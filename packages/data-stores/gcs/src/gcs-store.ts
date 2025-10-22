import { PassThrough, pipeline, Readable, Transform } from "node:stream";
import type { Bucket, CreateWriteStreamOptions } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import { UploadistaError } from "@uploadista/core/errors";
import {
  type DataStore,
  type DataStoreCapabilities,
  type DataStoreWriteOptions,
  type KvStore,
  type UploadFile,
  UploadFileDataStore,
  UploadFileKVStore,
  type UploadStrategy,
} from "@uploadista/core/types";
import {
  gcsActiveUploadsGauge as activeUploadsGauge,
  gcsFileSizeHistogram as fileSizeHistogram,
  logGCSUploadCompletion,
  trackGCSError,
  gcsUploadDurationHistogram as uploadDurationHistogram,
  gcsUploadErrorsTotal as uploadErrorsTotal,
  gcsUploadRequestsTotal as uploadRequestsTotal,
  gcsUploadSuccessTotal as uploadSuccessTotal,
  withGCSTimingMetrics as withTimingMetrics,
  withGCSUploadMetrics as withUploadMetrics,
} from "@uploadista/observability";
import { Effect, Layer, Stream } from "effect";

export type GCSStoreOptions = {
  keyFilename?: string;
  credentials?: object;
  bucketName: string;
  kvStore: KvStore<UploadFile>;
};

/**
 * Convert the Upload object to a format that can be stored in GCS metadata.
 */
function stringifyUploadKeys(upload: UploadFile) {
  return {
    size: upload.size ?? null,
    sizeIsDeferred: `${upload.sizeIsDeferred}`,
    offset: upload.offset,
    metadata: JSON.stringify(upload.metadata),
    storage: JSON.stringify(upload.storage),
  };
}

const getUpload = (
  bucket: Bucket,
  id: string,
  kvStore: KvStore<UploadFile>,
) => {
  return Effect.gen(function* () {
    try {
      const [metadata] = yield* Effect.promise(() =>
        bucket.file(id).getMetadata(),
      );
      const { size, metadata: meta } = metadata;
      const file = yield* kvStore.get(id);
      return {
        id,
        size: size ? Number.parseInt(`${size}`, 10) : undefined,
        offset: metadata.size ? Number.parseInt(`${metadata.size}`, 10) : 0, // `size` is set by GCS
        metadata: meta ? (meta as Record<string, string>) : undefined,
        storage: {
          id: file.storage.id,
          type: file.storage.type,
          path: id,
          bucket: bucket.name,
        },
      };
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === 404
      ) {
        return yield* Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
      }

      throw error;
    }
  });
};

export function createGCSStore({
  keyFilename,
  credentials,
  bucketName,
}: Omit<GCSStoreOptions, "kvStore">) {
  return Effect.gen(function* () {
    const kvStore = yield* UploadFileKVStore;
    return gcsStore({ keyFilename, credentials, bucketName, kvStore });
  });
}

export function gcsStore({
  keyFilename,
  credentials,
  bucketName,
  kvStore,
}: GCSStoreOptions): DataStore<UploadFile> {
  const storage = new Storage(
    keyFilename ? { keyFilename } : credentials ? { credentials } : {},
  );

  const bucket = storage.bucket(bucketName);

  const getCapabilities = (): DataStoreCapabilities => {
    return {
      supportsParallelUploads: false, // GCS doesn't have native multipart upload like S3
      supportsConcatenation: true, // Can combine files using bucket.combine
      supportsDeferredLength: true,
      supportsResumableUploads: true, // Through patch files
      supportsTransactionalUploads: false,
      maxConcurrentUploads: 1, // Sequential operations
      minChunkSize: undefined,
      maxChunkSize: undefined,
      maxParts: undefined,
      optimalChunkSize: 8 * 1024 * 1024, // 8MB default
      requiresOrderedChunks: true, // Due to combine operation
      requiresMimeTypeValidation: true,
      maxValidationSize: undefined, // no size limit
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
    bucket: bucket.name,
    create: (file: UploadFile) => {
      return Effect.gen(function* () {
        yield* uploadRequestsTotal(Effect.succeed(1));
        yield* activeUploadsGauge(Effect.succeed(1));
        yield* fileSizeHistogram(Effect.succeed(file.size || 0));

        if (!file.id) {
          yield* uploadErrorsTotal(Effect.succeed(1));
          return yield* Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
        }

        const gcs_file = bucket.file(file.id);

        file.storage = {
          id: file.storage.id,
          type: file.storage.type,
          path: file.id,
          bucket: bucket.name,
        };

        console.log("file", gcs_file.id);

        const options: CreateWriteStreamOptions = {
          metadata: {
            metadata: {
              ...stringifyUploadKeys(file),
            },
          },
        };
        if (file.metadata?.contentType) {
          options.contentType = file.metadata.contentType.toString();
        }

        return yield* Effect.tryPromise({
          try: () => {
            console.log("creating file", gcs_file.id);
            return new Promise<UploadFile>((resolve, reject) => {
              const fake_stream = new PassThrough();
              fake_stream.end();
              fake_stream
                .pipe(gcs_file.createWriteStream(options))
                .on("error", reject)
                .on("finish", () => {
                  resolve(file);
                });
            });
          },
          catch: (error) => {
            console.error("error creating file", error);
            Effect.runSync(
              trackGCSError("create", error, {
                upload_id: file.id,
                bucket: bucket.name,
              }),
            );
            return UploadistaError.fromCode("FILE_WRITE_ERROR", {
              cause: error,
            });
          },
        });
      });
    },
    read: (file_id: string) => {
      return Effect.tryPromise({
        try: async () => {
          const [buffer] = await bucket.file(file_id).download();
          return new Uint8Array(buffer);
        },
        catch: (error) => {
          Effect.runSync(
            trackGCSError("read", error, {
              upload_id: file_id,
              bucket: bucket.name,
            }),
          );
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === 404
          ) {
            return UploadistaError.fromCode("FILE_NOT_FOUND");
          }
          return UploadistaError.fromCode("FILE_READ_ERROR", {
            cause: error,
          });
        },
      });
    },
    remove: (file_id: string) => {
      return Effect.gen(function* () {
        try {
          yield* Effect.promise(() => bucket.file(file_id).delete());
          yield* activeUploadsGauge(Effect.succeed(-1));
        } catch (error) {
          Effect.runSync(
            trackGCSError("remove", error, {
              upload_id: file_id,
              bucket: bucket.name,
            }),
          );
          throw error;
        }
      });
    },
    /**
     * Get the file metatata from the object in GCS, then upload a new version
     * passing through the metadata to the new version.
     */
    write: (
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
            const { file_id, offset, stream: effectStream } = options;
            console.log("write", file_id, offset);
            const { onProgress } = dependencies;

            // GCS Doesn't persist metadata within versions,
            // get that metadata first
            const upload = yield* getUpload(bucket, file_id, kvStore);
            console.log("upload", upload);

            return yield* Effect.promise(
              () =>
                new Promise<number>((resolve, reject) => {
                  const file = bucket.file(file_id);
                  const destination =
                    upload.offset === 0
                      ? file
                      : bucket.file(`${file_id}_patch`);

                  upload.offset = offset;

                  const gcsOptions = {
                    metadata: {
                      metadata: {
                        ...stringifyUploadKeys(upload),
                      },
                    },
                  };
                  const write_stream =
                    destination.createWriteStream(gcsOptions);
                  if (!write_stream) {
                    Effect.runSync(uploadErrorsTotal(Effect.succeed(1)));
                    reject(UploadistaError.fromCode("FILE_WRITE_ERROR"));
                    return;
                  }

                  let bytes_received = upload.offset;

                  // Convert Effect Stream to ReadableStream
                  const readableStream = Stream.toReadableStream(effectStream);

                  const transform = new Transform({
                    transform(
                      chunk: Buffer,
                      _: string,
                      callback: (error?: Error | null, data?: Buffer) => void,
                    ) {
                      bytes_received += chunk.length;
                      onProgress?.(bytes_received);
                      callback(null, chunk);
                    },
                  });

                  const nodeReadable = Readable.fromWeb(readableStream);

                  pipeline(
                    nodeReadable,
                    transform,
                    write_stream,
                    async (e: Error | null) => {
                      if (e) {
                        console.error("error writing file", e);
                        Effect.runSync(
                          trackGCSError("write", e, {
                            upload_id: file_id,
                            bucket: bucket.name,
                            offset,
                          }),
                        );
                        try {
                          await destination.delete({ ignoreNotFound: true });
                        } finally {
                          reject(UploadistaError.fromCode("FILE_WRITE_ERROR"));
                        }
                      } else {
                        try {
                          if (file !== destination) {
                            await bucket.combine([file, destination], file);
                            await Promise.all([
                              file.setMetadata(gcsOptions.metadata),
                              destination.delete({ ignoreNotFound: true }),
                            ]);
                          }

                          // Log completion
                          Effect.runSync(
                            logGCSUploadCompletion(file_id, {
                              fileSize: upload.size || 0,
                              totalDurationMs: Date.now() - startTime,
                              partsCount: 1,
                              averagePartSize: upload.size,
                              throughputBps:
                                (upload.size || 0) / (Date.now() - startTime),
                              retryCount: 0,
                            }),
                          );
                          Effect.runSync(uploadSuccessTotal(Effect.succeed(1)));
                          Effect.runSync(
                            activeUploadsGauge(Effect.succeed(-1)),
                          );

                          resolve(bytes_received);
                        } catch (error) {
                          console.error(error);
                          Effect.runSync(
                            trackGCSError("write", error, {
                              upload_id: file_id,
                              bucket: bucket.name,
                              operation: "combine",
                            }),
                          );
                          reject(UploadistaError.fromCode("FILE_WRITE_ERROR"));
                        }
                      }
                    },
                  );
                }),
            );
          }),
        ),
      );
    },
    getCapabilities,
    validateUploadStrategy,
  };
}
