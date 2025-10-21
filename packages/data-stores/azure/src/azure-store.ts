import type { TokenCredential } from "@azure/core-auth";
import {
  BlobServiceClient as BlobService,
  type BlobServiceClient,
  type ContainerClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { UploadistaError } from "@uploadista/core/errors";

import type {
  DataStore,
  DataStoreCapabilities,
  DataStoreWriteOptions,
  KvStore,
  UploadFile,
  UploadStrategy,
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
  kvStore: KvStore<UploadFile>;
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
  ) => Effect.Effect<ReadableStream | Blob, UploadistaError>;
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
  kvStore,
  maxConcurrentBlockUploads = 60,
  expirationPeriodInMilliseconds = 1000 * 60 * 60 * 24 * 7, // 1 week
  connectionString,
  sasUrl,
  credential,
  accountName,
  accountKey,
  containerName,
}: AzureStoreOptions): AzureStore {
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
          const blobClient = containerClient.getBlockBlobClient(uploadFile.id);
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error as Error }),
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error as Error }),
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error as Error }),
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error as Error }),
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
    <E>(stream: Stream.Stream<Uint8Array, E>): Stream.Stream<ChunkInfo, E> => {
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
    (onProgress?: (totalBytes: number) => void, initialOffset = 0) =>
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
              onProgress(newTotal);
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
    onProgress?: (newOffset: number) => void,
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error as Error }),
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

  const readStream = (
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

  const read = (id: string): Effect.Effect<Uint8Array, UploadistaError> => {
    return Effect.gen(function* () {
      const stream = yield* readStream(id);

      // Convert stream/blob to Uint8Array
      if (stream instanceof Blob) {
        const arrayBuffer = yield* Effect.promise(() => stream.arrayBuffer());
        return new Uint8Array(arrayBuffer as ArrayBuffer);
      }

      // Read from ReadableStream
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      try {
        while (true) {
          const result = yield* Effect.promise(() => reader.read());
          if (result.done) break;
          chunks.push(result.value);
        }
      } finally {
        reader.releaseLock();
      }

      // Concatenate all chunks
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
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
      onProgress?: (chunkSize: number) => void;
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
              yield* clearCache(file_id);

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
          return yield* Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error as Error }),
    });
  };

  const getCapabilities = (): DataStoreCapabilities => {
    return {
      supportsParallelUploads: true,
      supportsConcatenation: false, // Azure doesn't have native concatenation like GCS
      supportsDeferredLength: true,
      supportsResumableUploads: true,
      supportsTransactionalUploads: true,
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

  return {
    bucket: containerName,
    create,
    remove,
    write,
    getUpload,
    read,
    readStream,
    deleteExpired: deleteExpired(),
    getCapabilities,
    getChunkerConstraints,
    validateUploadStrategy,
  };
}
