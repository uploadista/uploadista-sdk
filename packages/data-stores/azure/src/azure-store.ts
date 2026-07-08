import type { TokenCredential } from "@azure/core-auth";
import {
  BlobServiceClient as BlobService,
  type BlobServiceClient,
  type ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { UploadistaError } from "@uploadista/core/errors";

import {
  type DataStore,
  type DataStoreCapabilities,
  type DataStoreWriteOptions,
  DEFAULT_STREAMING_CONFIG,
  type StreamingConfig,
  type StreamWriteOptions,
  type StreamWriteResult,
  type UploadFile,
  UploadFileKVStore,
  type UploadStrategy,
} from "@uploadista/core/types";
import {
  azureActiveUploadsGauge as activeUploadsGauge,
  azureFileSizeHistogram as fileSizeHistogram,
  logAzureUploadCompletion,
  azurePartSizeHistogram as partSizeHistogram,
  azurePartUploadDurationHistogram as partUploadDurationHistogram,
  trackAzureError,
  azureUploadDurationHistogram as uploadDurationHistogram,
  azureUploadErrorsTotal as uploadErrorsTotal,
  azureUploadPartsTotal as uploadPartsTotal,
  azureUploadRequestsTotal as uploadRequestsTotal,
  azureUploadSuccessTotal as uploadSuccessTotal,
  withAzureTimingMetrics as withTimingMetrics,
  withAzureUploadMetrics as withUploadMetrics,
} from "@uploadista/observability";
import { Effect, Ref, Stream } from "effect";

// Using base64 encoding that works in both Node.js and browser
const bufferFrom = (str: string) => {
  // Use global Buffer if available, otherwise fallback to btoa
  if (typeof globalThis !== "undefined" && "Buffer" in globalThis) {
    return (globalThis as any).Buffer.from(str);
  }
  // Fallback for browser environments
  return new Uint8Array(Array.from(str, (c) => c.charCodeAt(0)));
};

export type ChunkInfo = {
  blockNumber: number;
  data: Uint8Array;
  size: number;
  isFinalPart?: boolean;
};

export type AzureStoreOptions = {
  deliveryUrl: string;
  /**
   * The preferred block size for blocks sent to Azure. Can not be lower than 1 byte or more than 4000MiB.
   * The server calculates the optimal block size, which takes this size into account,
   * but may increase it to not exceed the Azure 50K blocks limit.
   */
  blockSize?: number;
  /**
   * The minimal block size for blocks.
   * Can be used to ensure that all non-trailing blocks are exactly the same size.
   * Can not be lower than 1 byte or more than 4000MiB.
   */
  minBlockSize?: number;
  /**
   * The maximum number of blocks allowed in a block blob upload. Defaults to 50,000.
   */
  maxBlocks?: number;
  maxConcurrentBlockUploads?: number;
  expirationPeriodInMilliseconds?: number;
  // Azure authentication options (choose one)
  connectionString?: string;
  /**
   * SAS URL for the storage account (works in all environments including browsers)
   * Format: https://<account>.blob.core.windows.net?<sas-token>
   */
  sasUrl?: string;
  /**
   * TokenCredential for OAuth authentication (e.g., DefaultAzureCredential)
   * Works in all environments and is the recommended approach for production
   */
  credential?: TokenCredential;
  /**
   * Account name and key for shared key authentication (Node.js only)
   * @deprecated Use sasUrl or credential instead for cross-platform compatibility
   */
  accountName?: string;
  /**
   * @deprecated Use sasUrl or credential instead for cross-platform compatibility
   */
  accountKey?: string;
  containerName: string;
};

function calcOffsetFromBlocks(blocks?: Array<{ size: number }>) {
  return blocks && blocks.length > 0
    ? blocks.reduce((a, b) => a + (b?.size ?? 0), 0)
    : 0;
}

export type AzureStore = DataStore<UploadFile> & {
  getUpload: (id: string) => Effect.Effect<UploadFile, UploadistaError>;
  readStream: (
    id: string,
    config?: StreamingConfig,
  ) => Effect.Effect<
    Stream.Stream<Uint8Array, UploadistaError>,
    UploadistaError
  >;
  getChunkerConstraints: () => {
    minChunkSize: number;
    maxChunkSize: number;
    optimalChunkSize: number;
    requiresOrderedChunks: boolean;
  };
};

export function azureStore({
  deliveryUrl,
  blockSize,
  minBlockSize = 1024, // 1KB minimum
  maxBlocks = 50_000,
  maxConcurrentBlockUploads = 60,
  expirationPeriodInMilliseconds = 1000 * 60 * 60 * 24 * 7, // 1 week
  connectionString,
  sasUrl,
  credential,
  accountName,
  accountKey,
  containerName,
}: AzureStoreOptions) {
  return Effect.gen(function* () {
    const kvStore = yield* UploadFileKVStore;
    const preferredBlockSize = blockSize || 8 * 1024 * 1024; // 8MB default
    const maxUploadSize = 5_497_558_138_880 as const; // 5TiB (Azure Block Blob limit)

    // Initialize Azure Blob Service Client with cross-platform authentication
    let blobServiceClient: BlobServiceClient;

    if (connectionString) {
      // Connection string (works in all environments)
      blobServiceClient = BlobService.fromConnectionString(connectionString);
    } else if (sasUrl) {
      // SAS URL (works in all environments including browsers)
      blobServiceClient = new BlobService(sasUrl);
    } else if (credential) {
      // OAuth token credential (works in all environments, recommended for production)
      const accountUrl = accountName
        ? `https://${accountName}.blob.core.windows.net`
        : sasUrl?.split("?")[0] || "";
      if (!accountUrl) {
        throw new Error(
          "When using credential authentication, either accountName or a valid sasUrl must be provided to determine the account URL",
        );
      }
      blobServiceClient = new BlobService(accountUrl, credential);
    } else if (accountName && accountKey) {
      // Legacy shared key authentication (Node.js only)
      // This will fail in browser/edge environments
      try {
        const sharedKeyCredential = new StorageSharedKeyCredential(
          accountName,
          accountKey,
        );
        blobServiceClient = new BlobService(
          `https://${accountName}.blob.core.windows.net`,
          sharedKeyCredential,
        );
      } catch (error) {
        throw new Error(
          "StorageSharedKeyCredential is only available in Node.js environments. " +
            "Use sasUrl or credential options for cross-platform compatibility. " +
            `Original error: ${error}`,
        );
      }
    } else {
      throw new Error(
        "Azure authentication required. Provide one of: " +
          "connectionString, sasUrl, credential, or accountName + accountKey (Node.js only)",
      );
    }

    const containerClient: ContainerClient =
      blobServiceClient.getContainerClient(containerName);

    const incompletePartKey = (id: string) => {
      return `${id}.incomplete`;
    };

    const uploadBlock = (
      uploadFile: UploadFile,
      readStream: Uint8Array,
      blockId: string,
    ) => {
      return withTimingMetrics(
        partUploadDurationHistogram,
        Effect.gen(function* () {
          yield* Effect.logInfo("Uploading block").pipe(
            Effect.annotateLogs({
              upload_id: uploadFile.id,
              block_id: blockId,
              block_size: readStream.length,
            }),
          );

          yield* uploadPartsTotal(Effect.succeed(1));
          yield* partSizeHistogram(Effect.succeed(readStream.length));

          try {
            const blobClient = containerClient.getBlockBlobClient(
              uploadFile.id,
            );
            yield* Effect.tryPromise({
              try: async () => {
                await blobClient.stageBlock(
                  blockId,
                  readStream,
                  readStream.length,
                );
              },
              catch: (error) => {
                Effect.runSync(
                  trackAzureError("uploadBlock", error, {
                    upload_id: uploadFile.id,
                    block_id: blockId,
                    block_size: readStream.length,
                  }),
                );
                return UploadistaError.fromCode("FILE_WRITE_ERROR", {
                  cause: error as Error,
                });
              },
            });

            yield* Effect.logInfo("Finished uploading block").pipe(
              Effect.annotateLogs({
                upload_id: uploadFile.id,
                block_id: blockId,
                block_size: readStream.length,
              }),
            );
          } catch (error) {
            Effect.runSync(
              trackAzureError("uploadBlock", error, {
                upload_id: uploadFile.id,
                block_id: blockId,
                block_size: readStream.length,
              }),
            );
            throw error;
          }
        }),
      );
    };

    const uploadIncompleteBlock = (id: string, readStream: Uint8Array) => {
      return Effect.tryPromise({
        try: async () => {
          const blobClient = containerClient.getBlockBlobClient(
            incompletePartKey(id),
          );
          await blobClient.upload(readStream, readStream.length);
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      }).pipe(
        Effect.tap(() =>
          Effect.logInfo("Finished uploading incomplete block").pipe(
            Effect.annotateLogs({
              upload_id: id,
            }),
          ),
        ),
      );
    };

    const getIncompleteBlock = (id: string) => {
      return Effect.tryPromise({
        try: async () => {
          try {
            const blobClient = containerClient.getBlockBlobClient(
              incompletePartKey(id),
            );
            const response = await blobClient.download();
            return response.readableStreamBody as unknown as ReadableStream;
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "statusCode" in error &&
              error.statusCode === 404
            ) {
              return undefined;
            }
            throw error;
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      });
    };

    const getIncompleteBlockSize = (id: string) => {
      return Effect.tryPromise({
        try: async () => {
          try {
            const blobClient = containerClient.getBlockBlobClient(
              incompletePartKey(id),
            );
            const properties = await blobClient.getProperties();
            return properties.contentLength;
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "statusCode" in error &&
              error.statusCode === 404
            ) {
              return undefined;
            }
            throw error;
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      });
    };

    const deleteIncompleteBlock = (id: string) => {
      return Effect.tryPromise({
        try: async () => {
          const blobClient = containerClient.getBlockBlobClient(
            incompletePartKey(id),
          );
          await blobClient.deleteIfExists();
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      });
    };

    const downloadIncompleteBlock = (id: string) => {
      return Effect.gen(function* () {
        const incompleteBlock = yield* getIncompleteBlock(id);

        if (!incompleteBlock) {
          return;
        }

        // Read the stream and collect all chunks to calculate size
        const reader = incompleteBlock.getReader();
        const chunks: Uint8Array[] = [];
        let incompleteBlockSize = 0;

        try {
          while (true) {
            const result = yield* Effect.promise(() => reader.read());
            if (result.done) break;
            chunks.push(result.value);
            incompleteBlockSize += result.value.length;
          }
        } finally {
          reader.releaseLock();
        }

        // Create a new readable stream from the chunks
        const stream = Stream.fromIterable(chunks);

        return {
          size: incompleteBlockSize,
          stream,
        };
      });
    };

    const calcOptimalBlockSize = (initSize?: number): number => {
      const size = initSize ?? maxUploadSize;
      let optimalBlockSize: number;

      if (size <= preferredBlockSize) {
        optimalBlockSize = size;
      } else if (size <= preferredBlockSize * maxBlocks) {
        optimalBlockSize = preferredBlockSize;
      } else {
        // Calculate the minimum block size needed to fit within the max blocks limit
        optimalBlockSize = Math.ceil(size / maxBlocks);
      }

      // Ensure the block size respects the minimum and is aligned properly
      const finalBlockSize = Math.max(optimalBlockSize, minBlockSize);

      // Round up to ensure consistent block sizes
      return Math.ceil(finalBlockSize / 1024) * 1024; // Align to 1KB boundaries
    };

    // Proper single-pass chunking using Effect's async stream constructor
    // Ensures all parts except the final part are exactly the same size (S3 requirement)
    const createChunkedStream =
      (chunkSize: number) =>
      <E>(
        stream: Stream.Stream<Uint8Array, E>,
      ): Stream.Stream<ChunkInfo, E> => {
        return Stream.async<ChunkInfo, E>((emit) => {
          let buffer = new Uint8Array(0);
          let blockNumber = 1;
          let totalBytesProcessed = 0;

          const emitChunk = (data: Uint8Array, isFinalChunk = false) => {
            // Log chunk information for debugging - use INFO level to see in logs
            Effect.runSync(
              Effect.logInfo("Creating chunk").pipe(
                Effect.annotateLogs({
                  block_number: blockNumber,
                  chunk_size: data.length,
                  expected_size: chunkSize,
                  is_final_chunk: isFinalChunk,
                  total_bytes_processed: totalBytesProcessed + data.length,
                }),
              ),
            );
            emit.single({
              blockNumber: blockNumber++,
              data,
              size: data.length,
            });
          };

          const processChunk = (newData: Uint8Array) => {
            // Combine buffer with new data
            const combined = new Uint8Array(buffer.length + newData.length);
            combined.set(buffer);
            combined.set(newData, buffer.length);
            buffer = combined;
            totalBytesProcessed += newData.length;

            // Emit full chunks of exactly chunkSize bytes
            // This ensures S3 multipart upload rule: all parts except last must be same size
            while (buffer.length >= chunkSize) {
              const chunk = buffer.slice(0, chunkSize);
              buffer = buffer.slice(chunkSize);
              emitChunk(chunk, false);
            }
          };

          // Process the stream
          Effect.runFork(
            stream.pipe(
              Stream.runForEach((chunk) =>
                Effect.sync(() => processChunk(chunk)),
              ),
              Effect.andThen(() =>
                Effect.sync(() => {
                  // Emit final chunk if there's remaining data
                  // The final chunk can be any size < chunkSize (S3 allows this)
                  if (buffer.length > 0) {
                    emitChunk(buffer, true);
                  }
                  emit.end();
                }),
              ),
              Effect.catchAll((error) => Effect.sync(() => emit.fail(error))),
            ),
          );
        });
      };

    // Byte-level progress tracking during streaming
    // This provides smooth, immediate progress feedback by tracking bytes as they
    // flow through the stream, before they reach S3. This solves the issue where
    // small files (< 5MB) would jump from 0% to 100% instantly.
    const withByteProgressTracking =
      (
        onProgress?: (totalBytes: number) => Effect.Effect<void>,
        initialOffset = 0,
      ) =>
      <E, R>(stream: Stream.Stream<Uint8Array, E, R>) => {
        if (!onProgress) return stream;

        return Effect.gen(function* () {
          const totalBytesProcessedRef = yield* Ref.make(initialOffset);

          return stream.pipe(
            Stream.tap((chunk) =>
              Effect.gen(function* () {
                const newTotal = yield* Ref.updateAndGet(
                  totalBytesProcessedRef,
                  (total) => total + chunk.length,
                );
                yield* onProgress(newTotal);
              }),
            ),
          );
        }).pipe(Stream.unwrap);
      };

    /**
     * Uploads a stream to Azure using multiple blocks
     */
    const uploadBlocks = (
      uploadFile: UploadFile,
      readStream: Stream.Stream<Uint8Array, UploadistaError>,
      initCurrentBlockNumber: number,
      initOffset: number,
      onProgress?: (newOffset: number) => Effect.Effect<void>,
    ) => {
      return Effect.gen(function* () {
        yield* Effect.logInfo("Uploading blocks").pipe(
          Effect.annotateLogs({
            upload_id: uploadFile.id,
            init_offset: initOffset,
            file_size: uploadFile.size,
          }),
        );

        const size = uploadFile.size;

        const uploadBlockSize = calcOptimalBlockSize(size);
        yield* Effect.logInfo("Block size").pipe(
          Effect.annotateLogs({
            upload_id: uploadFile.id,
            block_size: uploadBlockSize,
          }),
        );
        // Enhanced Progress Tracking Strategy:
        // 1. Byte-level progress during streaming - provides immediate, smooth feedback
        //    as data flows through the pipeline (even for small files)
        // 2. This tracks progress BEFORE S3 upload, giving users immediate feedback
        // 3. For large files with multiple parts, this provides granular updates
        // 4. For small files (single part), this prevents 0%->100% jumps
        const chunkStream = readStream.pipe(
          // Add byte-level progress tracking during streaming (immediate feedback)
          withByteProgressTracking(onProgress, initOffset),
          // Create chunks for S3 multipart upload with uniform part sizes
          createChunkedStream(uploadBlockSize),
        );

        // Track cumulative offset and total bytes with Effect Refs
        const cumulativeOffsetRef = yield* Ref.make(initOffset);
        const totalBytesUploadedRef = yield* Ref.make(0);
        const blockIdsRef = yield* Ref.make<string[]>([]);
        // Create a chunk upload function for the sink
        const uploadChunk = (chunkInfo: ChunkInfo) =>
          Effect.gen(function* () {
            // Calculate cumulative bytes to determine if this is the final block
            const cumulativeOffset = yield* Ref.updateAndGet(
              cumulativeOffsetRef,
              (offset) => offset + chunkInfo.size,
            );
            const isFinalBlock = cumulativeOffset >= (uploadFile.size || 0);

            yield* Effect.logDebug("Processing chunk").pipe(
              Effect.annotateLogs({
                upload_id: uploadFile.id,
                cumulative_offset: cumulativeOffset,
                file_size: uploadFile.size,
                chunk_size: chunkInfo.size,
                is_final_block: isFinalBlock,
              }),
            );

            const actualBlockNumber =
              initCurrentBlockNumber + chunkInfo.blockNumber - 1;

            if (chunkInfo.size > uploadBlockSize) {
              yield* Effect.fail(
                UploadistaError.fromCode("FILE_WRITE_ERROR", {
                  cause: new Error(
                    `Block size ${chunkInfo.size} exceeds upload block size ${uploadBlockSize}`,
                  ),
                }),
              );
            }

            // For parts that meet the minimum part size (5MB) or are the final part,
            // upload them as regular multipart parts
            if (chunkInfo.size >= minBlockSize || isFinalBlock) {
              yield* Effect.logDebug("Uploading multipart chunk").pipe(
                Effect.annotateLogs({
                  upload_id: uploadFile.id,
                  block_number: actualBlockNumber,
                  chunk_size: chunkInfo.size,
                  min_block_size: minBlockSize,
                  is_final_block: isFinalBlock,
                }),
              );
              // Generate block ID (base64 encoded, must be consistent)
              const blockId = bufferFrom(
                `block-${actualBlockNumber.toString().padStart(6, "0")}`,
              ).toString("base64");
              yield* uploadBlock(uploadFile, chunkInfo.data, blockId);
              yield* Ref.update(blockIdsRef, (ids) => [...ids, blockId]);
              yield* partSizeHistogram(Effect.succeed(chunkInfo.size));
            } else {
              // Only upload as incomplete part if it's smaller than minimum and not final
              yield* uploadIncompleteBlock(uploadFile.id, chunkInfo.data);
            }

            yield* Ref.update(
              totalBytesUploadedRef,
              (total) => total + chunkInfo.size,
            );

            // Note: Byte-level progress is now tracked during streaming phase
            // This ensures smooth progress updates regardless of part size
            // Azure upload completion is tracked via totalBytesUploadedRef for accuracy
          });

        // Process chunks concurrently with controlled concurrency
        yield* chunkStream.pipe(
          Stream.runForEach((chunkInfo) => uploadChunk(chunkInfo)),
          Effect.withConcurrency(maxConcurrentBlockUploads),
        );

        return {
          bytesUploaded: yield* Ref.get(totalBytesUploadedRef),
          blockIds: yield* Ref.get(blockIdsRef),
        };
      });
    };

    /**
     * Commits all staged blocks to create the final blob
     */
    const commitBlocks = (uploadFile: UploadFile, blockIds: string[]) => {
      return Effect.tryPromise({
        try: async () => {
          const blobClient = containerClient.getBlockBlobClient(uploadFile.id);
          await blobClient.commitBlockList(blockIds, {
            blobHTTPHeaders: {
              blobContentType: uploadFile.metadata?.contentType?.toString(),
              blobCacheControl: uploadFile.metadata?.cacheControl?.toString(),
            },
          });
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      });
    };

    /**
     * Gets the committed blocks for a blob
     */
    const retrieveBlocks = (id: string) => {
      return Effect.tryPromise({
        try: async () => {
          try {
            const blobClient = containerClient.getBlockBlobClient(id);
            const blockList = await blobClient.getBlockList("committed");

            const blocks =
              blockList.committedBlocks?.map((block) => ({
                size: block.size,
              })) ?? [];

            return blocks;
          } catch (error) {
            if (
              error &&
              typeof error === "object" &&
              "statusCode" in error &&
              error.statusCode === 404
            ) {
              return [];
            }
            throw error;
          }
        },
        catch: (error) =>
          UploadistaError.fromCode("UPLOAD_ID_NOT_FOUND", {
            cause: error as Error,
          }),
      });
    };

    /**
     * Removes cached data for a given file
     */
    const clearCache = (id: string) => {
      return Effect.gen(function* () {
        yield* Effect.logInfo("Removing cached data").pipe(
          Effect.annotateLogs({
            upload_id: id,
          }),
        );
        yield* kvStore.delete(id);
      });
    };

    /**
     * Creates a blob placeholder in Azure and stores metadata
     */
    const create = (upload: UploadFile) => {
      return Effect.gen(function* () {
        yield* uploadRequestsTotal(Effect.succeed(1));
        yield* activeUploadsGauge(Effect.succeed(1));
        yield* fileSizeHistogram(Effect.succeed(upload.size || 0));

        yield* Effect.logInfo("Initializing Azure blob upload").pipe(
          Effect.annotateLogs({
            upload_id: upload.id,
          }),
        );

        upload.creationDate = new Date().toISOString();
        upload.storage = {
          id: upload.storage.id,
          type: upload.storage.type,
          path: upload.id,
          bucket: containerName,
        };
        upload.url = `${deliveryUrl}/${upload.id}`;

        yield* kvStore.set(upload.id, upload);
        yield* Effect.logInfo("Azure blob upload initialized").pipe(
          Effect.annotateLogs({
            upload_id: upload.id,
          }),
        );

        return upload;
      });
    };

    /**
     * Internal helper to get raw Azure stream (for backward compatibility).
     */
    const getAzureStream = (
      id: string,
    ): Effect.Effect<ReadableStream | Blob, UploadistaError> => {
      return Effect.tryPromise({
        try: async () => {
          const blobClient = containerClient.getBlockBlobClient(id);
          const response = await blobClient.download();
          if (response.blobBody) {
            return response.blobBody;
          }
          if (response.readableStreamBody) {
            return response.readableStreamBody as unknown as ReadableStream;
          }
          throw new Error("No blob body or readable stream body");
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      });
    };

    /**
     * Reads file content as a stream of chunks for memory-efficient processing.
     * Uses Azure BlobClient.download and converts to an Effect Stream.
     *
     * @param id - The unique identifier of the file to read
     * @param config - Optional streaming configuration (chunk size)
     * @returns An Effect that resolves to a Stream of byte chunks
     */
    const readStream = (id: string, config?: StreamingConfig) =>
      Effect.gen(function* () {
        // Merge config with defaults
        const effectiveConfig = {
          ...DEFAULT_STREAMING_CONFIG,
          ...config,
        };

        const azureStream = yield* getAzureStream(id);

        // Handle Blob type (browser environment)
        if (azureStream instanceof Blob) {
          const arrayBuffer = yield* Effect.promise(() =>
            azureStream.arrayBuffer(),
          );
          const bytes = new Uint8Array(arrayBuffer as ArrayBuffer);

          // Convert to chunked stream
          const chunkSize = effectiveConfig.chunkSize;
          const chunks: Uint8Array[] = [];
          for (let i = 0; i < bytes.length; i += chunkSize) {
            chunks.push(bytes.slice(i, Math.min(i + chunkSize, bytes.length)));
          }
          return Stream.fromIterable(chunks);
        }

        // Handle ReadableStream type
        return Stream.async<Uint8Array, UploadistaError>((emit) => {
          const reader = azureStream.getReader();
          const chunkSize = effectiveConfig.chunkSize;
          let buffer = new Uint8Array(0);

          const processChunk = async () => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  // Emit any remaining data in buffer
                  if (buffer.length > 0) {
                    emit.single(buffer);
                  }
                  emit.end();
                  return;
                }

                if (value) {
                  // Combine buffer with new value
                  const combined = new Uint8Array(buffer.length + value.length);
                  combined.set(buffer);
                  combined.set(value, buffer.length);
                  buffer = combined;

                  // Emit chunks of the configured size
                  while (buffer.length >= chunkSize) {
                    const chunk = buffer.slice(0, chunkSize);
                    buffer = buffer.slice(chunkSize);
                    emit.single(chunk);
                  }
                }
              }
            } catch (error) {
              emit.fail(
                new UploadistaError({
                  code: "FILE_READ_ERROR",
                  status: 500,
                  body: "Failed to read Azure blob stream",
                  details: `Azure stream read failed: ${String(error)}`,
                }),
              );
            }
          };

          // Start processing
          processChunk();

          // Cleanup function
          return Effect.sync(() => {
            reader.releaseLock();
          });
        });
      });

    const read = (id: string): Effect.Effect<Uint8Array, UploadistaError> => {
      return Effect.gen(function* () {
        const stream = yield* readStream(id);

        // Collect all chunks from the Effect Stream
        const chunks: Uint8Array[] = [];
        yield* Stream.runForEach(stream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
          }),
        );

        // Concatenate all chunks
        const totalLength = chunks.reduce(
          (acc, chunk) => acc + chunk.length,
          0,
        );
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }

        return result;
      });
    };

    const prepareUpload = (
      file_id: string,
      initialOffset: number,
      initialData: Stream.Stream<Uint8Array, UploadistaError>,
    ) => {
      return Effect.gen(function* () {
        const uploadFile = yield* kvStore.get(file_id);

        const blocks = yield* retrieveBlocks(file_id);

        const blockNumber = blocks.length;
        const nextBlockNumber = blockNumber + 1;

        const incompleteBlock = yield* downloadIncompleteBlock(file_id);

        if (incompleteBlock) {
          yield* deleteIncompleteBlock(file_id);
          const offset = initialOffset - incompleteBlock.size;
          const data = incompleteBlock.stream.pipe(Stream.concat(initialData));
          return {
            uploadFile,
            nextBlockNumber: nextBlockNumber - 1,
            offset,
            incompleteBlockSize: incompleteBlock.size,
            data,
          };
        } else {
          return {
            uploadFile,
            nextBlockNumber,
            offset: initialOffset,
            incompleteBlockSize: 0,
            data: initialData,
          };
        }
      });
    };

    /**
     * Write to the file, starting at the provided offset
     */
    const write = (
      options: DataStoreWriteOptions,
      dependencies: {
        onProgress?: (chunkSize: number) => Effect.Effect<void>;
      },
    ) => {
      return withUploadMetrics(
        options.file_id,
        withTimingMetrics(
          uploadDurationHistogram,
          Effect.gen(function* () {
            const startTime = Date.now();
            const {
              stream: initialData,
              file_id,
              offset: initialOffset,
            } = options;
            const { onProgress } = dependencies;

            const prepareResult = yield* prepareUpload(
              file_id,
              initialOffset,
              initialData,
            );

            const { uploadFile, nextBlockNumber, offset, data } = prepareResult;

            const { bytesUploaded, blockIds } = yield* uploadBlocks(
              uploadFile,
              data,
              nextBlockNumber,
              offset,
              onProgress,
            );

            const newOffset = offset + bytesUploaded;

            if (uploadFile.size === newOffset) {
              try {
                // Commit all blocks to finalize the blob
                yield* commitBlocks(uploadFile, blockIds);

                // Update the upload file with the final offset in the KV store
                yield* kvStore.set(file_id, {
                  ...uploadFile,
                  offset: newOffset,
                });

                // Log completion with observability
                yield* logAzureUploadCompletion(file_id, {
                  fileSize: uploadFile.size || 0,
                  totalDurationMs: Date.now() - startTime,
                  partsCount: blockIds.length,
                  averagePartSize: uploadFile.size,
                  throughputBps: uploadFile.size / (Date.now() - startTime),
                  retryCount: 0,
                });

                yield* uploadSuccessTotal(Effect.succeed(1));
                yield* activeUploadsGauge(Effect.succeed(-1));
              } catch (error) {
                yield* Effect.logError("Failed to finish upload").pipe(
                  Effect.annotateLogs({
                    upload_id: file_id,
                    error: JSON.stringify(error),
                  }),
                );
                yield* uploadErrorsTotal(Effect.succeed(1));
                Effect.runSync(
                  trackAzureError("write", error, {
                    upload_id: file_id,
                    operation: "commit",
                    blocks: blockIds.length,
                  }),
                );
                throw error;
              }
            }

            return newOffset;
          }),
        ),
      );
    };

    const getUpload = (id: string) => {
      return Effect.gen(function* () {
        const uploadFile = yield* kvStore.get(id);

        let offset = 0;

        try {
          const blocks = yield* retrieveBlocks(id);
          offset = calcOffsetFromBlocks(blocks);
        } catch (error) {
          // Check if the error is caused by the blob not being found
          if (
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            error.statusCode === 404
          ) {
            return {
              ...uploadFile,
              offset: uploadFile.size as number,
              size: uploadFile.size,
              metadata: uploadFile.metadata,
              storage: uploadFile.storage,
            };
          }

          yield* Effect.logError("Error on get upload").pipe(
            Effect.annotateLogs({
              upload_id: id,
              error: JSON.stringify(error),
            }),
          );
          throw error;
        }

        const incompleteBlockSize = yield* getIncompleteBlockSize(id);

        return {
          ...uploadFile,
          offset: offset + (incompleteBlockSize ?? 0),
          size: uploadFile.size,
          storage: uploadFile.storage,
        };
      });
    };

    const remove = (id: string) => {
      return Effect.gen(function* () {
        try {
          const blobClient = containerClient.getBlockBlobClient(id);
          yield* Effect.promise(() => blobClient.deleteIfExists());

          // Also delete incomplete block if it exists
          yield* deleteIncompleteBlock(id);
        } catch (error) {
          if (
            typeof error === "object" &&
            error !== null &&
            "statusCode" in error &&
            error.statusCode === 404
          ) {
            yield* Effect.logError("No file found").pipe(
              Effect.annotateLogs({
                upload_id: id,
              }),
            );
            return yield* Effect.fail(
              UploadistaError.fromCode("FILE_NOT_FOUND"),
            );
          }
          Effect.runSync(
            trackAzureError("remove", error, {
              upload_id: id,
            }),
          );
          throw error;
        }

        yield* clearCache(id);
        yield* activeUploadsGauge(Effect.succeed(-1));
      });
    };

    const getExpiration = () => {
      return expirationPeriodInMilliseconds;
    };

    const getExpirationDate = (created_at: string) => {
      const date = new Date(created_at);
      return new Date(date.getTime() + getExpiration());
    };

    const deleteExpired = (): Effect.Effect<number, UploadistaError> => {
      return Effect.tryPromise({
        try: async (): Promise<number> => {
          if (getExpiration() === 0) {
            return 0;
          }

          let deleted = 0;

          const response = containerClient.listBlobsFlat({
            includeMetadata: true,
          });

          const expiredBlobs: string[] = [];

          for await (const blob of response) {
            if (blob.metadata?.creationDate) {
              const creationDate = new Date(blob.metadata.creationDate);
              if (
                Date.now() >
                getExpirationDate(creationDate.toISOString()).getTime()
              ) {
                expiredBlobs.push(blob.name);
              }
            }
          }

          // Delete expired blobs
          for (const blobName of expiredBlobs) {
            await containerClient.deleteBlob(blobName);
            deleted++;
          }

          return deleted;
        },
        catch: (error) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", {
            cause: error as Error,
          }),
      });
    };

    const getCapabilities = (): DataStoreCapabilities => {
      return {
        supportsParallelUploads: true,
        supportsConcatenation: false, // Azure doesn't have native concatenation like GCS
        supportsDeferredLength: true,
        supportsResumableUploads: true,
        supportsTransactionalUploads: true,
        supportsStreamingRead: true, // Supports streaming reads via BlobClient.download
        supportsStreamingWrite: true, // Supports streaming writes via block staging
        maxConcurrentUploads: maxConcurrentBlockUploads,
        minChunkSize: minBlockSize,
        maxChunkSize: 4000 * 1024 * 1024, // 4000MB Azure limit
        maxParts: maxBlocks,
        optimalChunkSize: preferredBlockSize,
        requiresOrderedChunks: false,
        requiresMimeTypeValidation: true,
        maxValidationSize: undefined, // no size limit
      };
    };

    const getChunkerConstraints = () => {
      return {
        minChunkSize: minBlockSize,
        maxChunkSize: 4000 * 1024 * 1024, // 4000MB Azure limit
        optimalChunkSize: preferredBlockSize,
        requiresOrderedChunks: false,
      };
    };

    const validateUploadStrategy = (
      strategy: UploadStrategy,
    ): Effect.Effect<boolean, never> => {
      const capabilities = getCapabilities();

      const result = (() => {
        switch (strategy) {
          case "parallel":
            return capabilities.supportsParallelUploads;
          case "single":
            return true;
          default:
            return false;
        }
      })();

      return Effect.succeed(result);
    };

    /**
     * Writes file content from a stream without knowing the final size upfront.
     * Uses Azure block blob staging to stream content as blocks are buffered.
     *
     * @param fileId - The unique identifier for the file
     * @param options - Stream write options including the Effect Stream
     * @returns StreamWriteResult with final size after stream completes
     */
    const writeStream = (
      fileId: string,
      options: StreamWriteOptions,
    ): Effect.Effect<StreamWriteResult, UploadistaError> =>
      withTimingMetrics(
        uploadDurationHistogram,
        Effect.gen(function* () {
          const startTime = Date.now();

          yield* Effect.logInfo("Starting streaming write to Azure").pipe(
            Effect.annotateLogs({
              upload_id: fileId,
              container: containerName,
              size_hint: options.sizeHint,
            }),
          );

          yield* uploadRequestsTotal(Effect.succeed(1));
          yield* activeUploadsGauge(Effect.succeed(1));

          // Calculate optimal block size based on size hint or use default
          const uploadBlockSize = calcOptimalBlockSize(options.sizeHint);

          // Track blocks and total bytes
          const blockIdsRef = yield* Ref.make<string[]>([]);
          const totalBytesRef = yield* Ref.make(0);
          const blockNumberRef = yield* Ref.make(1);
          const bufferRef = yield* Ref.make(new Uint8Array(0));

          // Helper to stage a block
          const stageBlock = (data: Uint8Array, isFinalBlock: boolean) =>
            Effect.gen(function* () {
              if (data.length === 0) {
                return;
              }

              // Only stage if we have enough data or it's the final block
              if (data.length < minBlockSize && !isFinalBlock) {
                return;
              }

              const blockNumber = yield* Ref.getAndUpdate(
                blockNumberRef,
                (n) => n + 1,
              );

              // Generate block ID (base64 encoded, must be consistent length)
              const blockId = bufferFrom(
                `stream-block-${blockNumber.toString().padStart(6, "0")}`,
              ).toString("base64");

              yield* Effect.logDebug("Staging block from stream").pipe(
                Effect.annotateLogs({
                  upload_id: fileId,
                  block_number: blockNumber,
                  block_size: data.length,
                  is_final_block: isFinalBlock,
                }),
              );

              const blobClient = containerClient.getBlockBlobClient(fileId);
              yield* Effect.tryPromise({
                try: () => blobClient.stageBlock(blockId, data, data.length),
                catch: (error) => {
                  Effect.runSync(
                    trackAzureError("writeStream", error, {
                      upload_id: fileId,
                      block_number: blockNumber,
                      block_size: data.length,
                    }),
                  );
                  return UploadistaError.fromCode("FILE_WRITE_ERROR", {
                    cause: error as Error,
                  });
                },
              });

              yield* Ref.update(blockIdsRef, (ids) => [...ids, blockId]);
              yield* uploadPartsTotal(Effect.succeed(1));
              yield* partSizeHistogram(Effect.succeed(data.length));
            });

          // Process stream chunks
          yield* options.stream.pipe(
            Stream.runForEach((chunk) =>
              Effect.gen(function* () {
                // Update total bytes
                yield* Ref.update(
                  totalBytesRef,
                  (total) => total + chunk.length,
                );

                // Get current buffer and append new chunk
                const currentBuffer = yield* Ref.get(bufferRef);
                const combined = new Uint8Array(
                  currentBuffer.length + chunk.length,
                );
                combined.set(currentBuffer);
                combined.set(chunk, currentBuffer.length);

                // Extract full blocks and keep remainder in buffer
                let offset = 0;
                while (combined.length - offset >= uploadBlockSize) {
                  const blockData = combined.slice(
                    offset,
                    offset + uploadBlockSize,
                  );
                  yield* stageBlock(blockData, false);
                  offset += uploadBlockSize;
                }

                // Store remaining data in buffer
                yield* Ref.set(bufferRef, combined.slice(offset));
              }),
            ),
          );

          // Stage any remaining data as final block
          const remainingBuffer = yield* Ref.get(bufferRef);
          if (remainingBuffer.length > 0) {
            yield* stageBlock(remainingBuffer, true);
          }

          // Get all block IDs and commit the block list
          const blockIds = yield* Ref.get(blockIdsRef);
          const totalBytes = yield* Ref.get(totalBytesRef);

          if (blockIds.length === 0) {
            // No blocks staged (empty stream) - fail
            yield* activeUploadsGauge(Effect.succeed(-1));
            return yield* Effect.fail(
              new UploadistaError({
                code: "FILE_WRITE_ERROR",
                status: 400,
                body: "Cannot complete upload with no data",
                details: "The stream provided no data to upload",
              }),
            );
          }

          // Commit block list
          const blobClient = containerClient.getBlockBlobClient(fileId);
          yield* Effect.tryPromise({
            try: () =>
              blobClient.commitBlockList(blockIds, {
                blobHTTPHeaders: {
                  blobContentType: options.contentType,
                },
              }),
            catch: (error) => {
              Effect.runSync(
                trackAzureError("writeStream", error, {
                  upload_id: fileId,
                  operation: "commit",
                  blocks: blockIds.length,
                }),
              );
              return UploadistaError.fromCode("FILE_WRITE_ERROR", {
                cause: error as Error,
              });
            },
          });

          // Log completion metrics
          const endTime = Date.now();
          const totalDurationMs = endTime - startTime;
          const throughputBps =
            totalDurationMs > 0 ? (totalBytes * 1000) / totalDurationMs : 0;
          const averageBlockSize =
            blockIds.length > 0 ? totalBytes / blockIds.length : undefined;

          yield* logAzureUploadCompletion(fileId, {
            fileSize: totalBytes,
            totalDurationMs,
            partsCount: blockIds.length,
            averagePartSize: averageBlockSize,
            throughputBps,
            retryCount: 0,
          });

          yield* uploadSuccessTotal(Effect.succeed(1));
          yield* activeUploadsGauge(Effect.succeed(-1));
          yield* fileSizeHistogram(Effect.succeed(totalBytes));

          yield* Effect.logInfo("Streaming write to Azure completed").pipe(
            Effect.annotateLogs({
              upload_id: fileId,
              total_bytes: totalBytes,
              blocks_count: blockIds.length,
              duration_ms: totalDurationMs,
            }),
          );

          return {
            id: fileId,
            size: totalBytes,
            path: fileId,
            bucket: containerName,
          } satisfies StreamWriteResult;
        }).pipe(
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* uploadErrorsTotal(Effect.succeed(1));
              yield* activeUploadsGauge(Effect.succeed(-1));
              return yield* Effect.fail(error);
            }),
          ),
        ),
      );

    return {
      bucket: containerName,
      create,
      remove,
      write,
      getUpload,
      read,
      readStream,
      writeStream,
      deleteExpired,
      getCapabilities,
      getChunkerConstraints,
      validateUploadStrategy,
    } as DataStore<UploadFile>;
  });
}
