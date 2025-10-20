import type { TokenCredential } from "@azure/core-auth";
import type { BlobServiceClient, ContainerClient } from "@azure/storage-blob";
import { BlobServiceClient as BlobService } from "@azure/storage-blob";
import { UploadistaError } from "@uploadista/core/errors";
import type { Logger } from "@uploadista/core/logger/logger";
import { createLogger } from "@uploadista/core/logger/logger";
import { MultiStream } from "@uploadista/core/streams/multi-stream";
import { streamSplitter } from "@uploadista/core/streams/stream-splitter";
import type {
  DataStore,
  DataStoreCapabilities,
  DataStoreWriteOptions,
  KvStore,
  UploadFile,
  UploadStrategy,
} from "@uploadista/core/types";
import type { Permit } from "@uploadista/core/utils/semaphore";
import { semaphore } from "@uploadista/core/utils/semaphore";
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
import { Effect, Stream } from "effect";

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
  logger?: Logger;
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
  logger = createLogger(true),
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
      const { StorageSharedKeyCredential } = require("@azure/storage-blob");
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
  const blockUploadSemaphore = semaphore(maxConcurrentBlockUploads);

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
        yield* Effect.sync(() =>
          logger.log(`[${uploadFile.id}] uploading block ${blockId}`),
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
              return UploadistaError.fromCode(
                "FILE_WRITE_ERROR",
                error as Error,
              );
            },
          });

          yield* Effect.sync(() =>
            logger.log(
              `[${uploadFile.id}] finished uploading block ${blockId}`,
            ),
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
        logger.log(`[${id}] finished uploading incomplete block`);
      },
      catch: (error) =>
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
    });
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
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
          const { done, value } = yield* Effect.promise(() => reader.read());
          if (done) break;
          chunks.push(value);
          incompleteBlockSize += value.length;
        }
      } finally {
        reader.releaseLock();
      }

      // Create a new readable stream from the chunks
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });

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

  /**
   * Uploads a stream to Azure using multiple blocks
   */
  const uploadBlocks = (
    uploadFile: UploadFile,
    readStream: ReadableStream,
    initCurrentBlockNumber: number,
    initOffset: number,
    incompleteBlockSize: number,
    onProgress?: (newOffset: number) => void,
  ) => {
    return Effect.gen(function* () {
      logger.log(
        `[${uploadFile.id}] uploading blocks from ${initOffset} to ${uploadFile.size}`,
      );

      let offset = initOffset;
      const size = uploadFile.size;
      const promises: Promise<{ blockId: string; blockSize: number }>[] = [];
      const permits: Map<number, Permit> = new Map();
      let streamError: Error | undefined;

      const uploadBlockSize = calcOptimalBlockSize(size);
      logger.log(`[${uploadFile.id}] block size ${uploadBlockSize}`);

      let tempOffset = offset - incompleteBlockSize;
      const blockIds: string[] = [];

      try {
        yield* Effect.promise(() =>
          streamSplitter(readStream, {
            options: { chunkSize: uploadBlockSize },
            onData: (chunkSize) => {
              tempOffset += chunkSize;
              if (tempOffset > initOffset) {
                onProgress?.(tempOffset);
              }
            },
            onChunkStarted: async (blockNumber: number) => {
              const permit = await blockUploadSemaphore.acquire();
              permits.set(blockNumber, permit);
            },
            onChunkError: (blockNumber, error) => {
              const errorDetails =
                error instanceof Error
                  ? {
                      name: error.name,
                      message: error.message,
                      stack: error.stack,
                      cause: error.cause,
                    }
                  : error;
              logger.log(
                `[${uploadFile.id}] error ${JSON.stringify(errorDetails)} on block ${blockNumber}`,
              );
              streamError = error as Error;
              permits.get(blockNumber)?.release();
            },
            onChunkCompleted: (chunk) => {
              const {
                partNumber: currentBlockNumber,
                stream: blockStream,
                size: blockSize,
              } = chunk;

              const blockNumber = initCurrentBlockNumber + currentBlockNumber;
              offset += blockSize;
              const isFinalBlock = size === offset;

              // Generate block ID (base64 encoded, must be consistent)
              const blockId = btoa(
                `block-${blockNumber.toString().padStart(6, "0")}`,
              );
              blockIds.push(blockId);

              const uploadPromise = async (): Promise<{
                blockId: string;
                blockSize: number;
              }> => {
                try {
                  logger.log(
                    `[${uploadFile.id}] uploading block ${JSON.stringify({
                      blockSize,
                      blockNumber,
                      blockId,
                    })}`,
                  );

                  if (blockSize > uploadBlockSize) {
                    logger.log(
                      `[${uploadFile.id}] block size ${blockSize} is greater than upload block size ${uploadBlockSize}`,
                    );
                    throw new Error(
                      `Block size ${blockSize} is greater than upload block size ${uploadBlockSize}`,
                    );
                  }

                  if (blockSize === uploadBlockSize || isFinalBlock) {
                    await Effect.runPromise(
                      uploadBlock(uploadFile, blockStream, blockId),
                    );
                  } else {
                    await Effect.runPromise(
                      uploadIncompleteBlock(uploadFile.id, blockStream),
                    );
                  }

                  return { blockId, blockSize };
                } catch (error) {
                  streamError = error as Error;
                  const errorDetails =
                    error instanceof Error
                      ? {
                          name: error.name,
                          message: error.message,
                          stack: error.stack,
                          cause: error.cause,
                        }
                      : error;
                  logger.log(
                    `[${uploadFile.id}] error ${JSON.stringify(errorDetails)} on block ${blockNumber}`,
                  );
                  throw error;
                } finally {
                  permits.get(currentBlockNumber)?.release();
                }
              };

              logger.log(
                `[${uploadFile.id}] block ${blockNumber} upload started`,
              );
              promises.push(uploadPromise());
            },
          }),
        );

        if (streamError) {
          throw streamError;
        }

        logger.log(
          `[${uploadFile.id}] waiting for ${promises.length} block(s) to complete`,
        );

        // Wait for all promises to complete and sum the bytes uploaded
        const blockResults = yield* Effect.promise(() =>
          Promise.allSettled(promises),
        );
        const committedBlockIds: string[] = [];
        const bytesUploaded = blockResults.reduce((total, blockResult) => {
          if (blockResult.status === "fulfilled") {
            committedBlockIds.push(blockResult.value.blockId);
            return total + blockResult.value.blockSize;
          }
          return total;
        }, 0);

        return { bytesUploaded, blockIds: committedBlockIds };
      } catch (error) {
        logger.log(`[${uploadFile.id}] error ${JSON.stringify(error)}`);
        throw error;
      }
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
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
        UploadistaError.fromCode("UPLOAD_ID_NOT_FOUND", error as Error),
    });
  };

  /**
   * Removes cached data for a given file
   */
  const clearCache = (id: string) => {
    return Effect.gen(function* () {
      logger.log(`[${id}] removing cached data`);
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

      yield* Effect.sync(() =>
        logger.log(`[${upload.id}] initializing Azure blob upload`),
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
      yield* Effect.sync(() =>
        logger.log(`[${upload.id}] Azure blob upload initialized`),
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
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
    });
  };

  const read = (id: string): Effect.Effect<Uint8Array, UploadistaError> => {
    return Effect.gen(function* () {
      const stream = yield* readStream(id);

      // Convert stream/blob to Uint8Array
      if (stream instanceof Blob) {
        const arrayBuffer = yield* Effect.promise(() => stream.arrayBuffer());
        return new Uint8Array(arrayBuffer);
      }

      // Read from ReadableStream
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];

      try {
        while (true) {
          const { done, value } = yield* Effect.promise(() => reader.read());
          if (done) break;
          chunks.push(value);
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
    initialData: ReadableStream,
  ) => {
    return Effect.gen(function* () {
      const uploadFile = yield* kvStore.get(file_id);
      logger.log(`[${file_id}] metadata ${JSON.stringify(uploadFile)}`);

      const blocks = yield* retrieveBlocks(file_id);
      logger.log(`[${file_id}] blocks ${JSON.stringify(blocks)}`);

      const blockNumber = blocks.length;
      const nextBlockNumber = blockNumber + 1;

      const incompleteBlock = yield* downloadIncompleteBlock(file_id);

      if (incompleteBlock) {
        logger.log(
          `[${file_id}] incompleteBlock ${JSON.stringify(incompleteBlock)}`,
        );
        yield* deleteIncompleteBlock(file_id);
        const offset = initialOffset - incompleteBlock.size;
        const data = new MultiStream([incompleteBlock.stream, initialData])
          .readable;
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
            stream: effectStream,
            file_id,
            offset: initialOffset,
          } = options;
          const { onProgress } = dependencies;

          // Convert Effect Stream to ReadableStream
          const initialData = Stream.toReadableStream(effectStream);

          const prepareResult = yield* prepareUpload(
            file_id,
            initialOffset,
            initialData,
          );

          const {
            uploadFile,
            nextBlockNumber,
            offset,
            data,
            incompleteBlockSize,
          } = prepareResult;

          const { bytesUploaded, blockIds } = yield* uploadBlocks(
            uploadFile,
            data,
            nextBlockNumber,
            offset,
            incompleteBlockSize,
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
              yield* Effect.sync(() =>
                logger.log(`[${file_id}] failed to finish upload, ${error}`),
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

        logger.log(`${error}`);
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
          yield* Effect.sync(() => logger.log("remove: No file found"));
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
          try {
            await containerClient.deleteBlob(blobName);
            deleted++;
          } catch (error) {
            logger.log(`Failed to delete expired blob ${blobName}: ${error}`);
          }
        }

        return deleted;
      },
      catch: (error) =>
        UploadistaError.fromCode("FILE_WRITE_ERROR", error as Error),
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
