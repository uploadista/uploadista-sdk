import fs from "node:fs";
import fsProm from "node:fs/promises";
import path from "node:path";
import { UploadistaError } from "@uploadista/core/errors";
import type {
  DataStore,
  DataStoreCapabilities,
  DataStoreWriteOptions,
  StreamingConfig,
  StreamWriteOptions,
  StreamWriteResult,
  UploadFile,
  UploadStrategy,
} from "@uploadista/core/types";
import {
  DEFAULT_STREAMING_CONFIG,
  UploadFileKVStore,
} from "@uploadista/core/types";
import {
  filesystemActiveUploadsGauge as activeUploadsGauge,
  filesystemFileSizeHistogram as fileSizeHistogram,
  logFilesystemUploadCompletion,
  filesystemPartSizeHistogram as partSizeHistogram,
  trackFilesystemError,
  filesystemUploadDurationHistogram as uploadDurationHistogram,
  filesystemUploadPartsTotal as uploadPartsTotal,
  filesystemUploadRequestsTotal as uploadRequestsTotal,
  filesystemUploadSuccessTotal as uploadSuccessTotal,
  withFilesystemTimingMetrics as withTimingMetrics,
  withFilesystemUploadMetrics as withUploadMetrics,
} from "@uploadista/observability";
import { Effect, Ref, Sink, Stream } from "effect";

export type FileStoreOptions = {
  directory: string;
  deliveryUrl: string;
};

const MASK = "0777";
const IGNORED_MKDIR_ERROR = "EEXIST";
// const FILE_DOESNT_EXIST = "ENOENT";

const checkOrCreateDirectory = (directory: string) =>
  Effect.tryPromise({
    try: () => fsProm.mkdir(directory, { mode: MASK, recursive: true }),
    catch: (error) => {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === IGNORED_MKDIR_ERROR
      ) {
        // Directory already exists, not an error
        return new UploadistaError({
          code: "UNKNOWN_ERROR",
          status: 200,
          body: "Directory already exists",
          details: "Directory already exists",
        });
      }
      return new UploadistaError({
        code: "UNKNOWN_ERROR",
        status: 500,
        body: "Failed to create directory",
        details: `Directory creation failed: ${String(error)}`,
      });
    },
  }).pipe(Effect.orElse(() => Effect.void));

const createWriteStream = (file_path: string, offset: number) =>
  Effect.sync(() =>
    fs.createWriteStream(file_path, {
      flags: "r+",
      start: offset,
    }),
  );

const writeChunk =
  ({
    writeStream,
    bytesReceived,
    onProgress,
  }: {
    writeStream: fs.WriteStream;
    bytesReceived: Ref.Ref<number>;
    onProgress?: (chunkSize: number) => Effect.Effect<void>;
  }) =>
  (chunk: Uint8Array) =>
    Effect.gen(function* () {
      yield* Effect.async<void, UploadistaError>((resume) => {
        writeStream.write(chunk, (err) => {
          if (err) {
            resume(
              Effect.fail(
                new UploadistaError({
                  code: "FILE_WRITE_ERROR",
                  status: 500,
                  body: "Failed to write chunk",
                  details: `Chunk write failed: ${String(err)}`,
                }),
              ),
            );
          } else {
            resume(Effect.succeed(void 0));
          }
        });
      });

      yield* Ref.update(bytesReceived, (size) => size + chunk.length);
      yield* onProgress?.(chunk.length) ?? Effect.void;
    });

const endWriteStream = (writeStream: fs.WriteStream) =>
  Effect.async<void, UploadistaError>((resume) => {
    writeStream.end((err: Error | null | undefined) => {
      if (err) {
        resume(
          Effect.fail(
            new UploadistaError({
              code: "FILE_WRITE_ERROR",
              status: 500,
              body: "Failed to close write stream",
              details: `Stream close failed: ${String(err)}`,
            }),
          ),
        );
      } else {
        resume(Effect.succeed(void 0));
      }
    });
  });

const destroyWriteStream = (writeStream: fs.WriteStream) =>
  Effect.sync(() => {
    if (!writeStream.destroyed) {
      writeStream.destroy();
    }
  });
/**
 * A data store that stores files in the filesystem.
 * @param options - The options for the file store.
 * @returns A data store that stores files in the filesystem.
 */
export const fileStore = ({ directory, deliveryUrl }: FileStoreOptions) =>
  Effect.gen(function* () {
    yield* checkOrCreateDirectory(directory);
    const kvStore = yield* UploadFileKVStore;

    const getCapabilities = (): DataStoreCapabilities => {
      return {
        supportsParallelUploads: false, // Filesystem operations are sequential
        supportsConcatenation: false, // No native concatenation support
        supportsDeferredLength: true, // Supports deferred length via writeStream
        supportsResumableUploads: true, // Can write at specific offsets
        supportsTransactionalUploads: false,
        supportsStreamingRead: true, // Supports streaming reads via Node.js fs streams
        supportsStreamingWrite: true, // Supports streaming writes via writeStream
        maxConcurrentUploads: 1, // Sequential writes only
        minChunkSize: undefined,
        maxChunkSize: undefined,
        maxParts: undefined,
        optimalChunkSize: 1024 * 1024, // 1MB default
        requiresOrderedChunks: true, // Sequential offset-based writes
        requiresMimeTypeValidation: true,
        maxValidationSize: undefined, // no size limit
      };
    };

    const validateUploadStrategy = (
      strategy: UploadStrategy,
    ): Effect.Effect<boolean, never> => {
      const capabilities = getCapabilities();

      switch (strategy) {
        case "parallel":
          return Effect.succeed(capabilities.supportsParallelUploads);
        case "single":
          return Effect.succeed(true);
        default:
          return Effect.succeed(false);
      }
    };

    return {
      bucket: directory,
      create: (
        file: UploadFile,
      ): Effect.Effect<UploadFile, UploadistaError> => {
        const fileName = file.metadata?.fileName?.toString();
        const fileExtension = fileName?.split(".").pop();

        const dirs = file.id.split("/").slice(0, -1);
        const filePath = path.join(
          directory,
          fileExtension ? `${file.id}.${fileExtension}` : file.id,
        );

        return Effect.gen(function* () {
          yield* uploadRequestsTotal(Effect.succeed(1));
          yield* activeUploadsGauge(Effect.succeed(1));
          yield* fileSizeHistogram(Effect.succeed(file.size || 0));

          yield* Effect.tryPromise({
            try: () =>
              fsProm.mkdir(path.join(directory, ...dirs), {
                recursive: true,
              }),
            catch: (error) => {
              Effect.runSync(
                trackFilesystemError("create", error, {
                  upload_id: file.id,
                  path: filePath,
                }),
              );
              return new UploadistaError({
                code: "UNKNOWN_ERROR",
                status: 500,
                body: "Failed to create file directory",
                details: `Directory creation failed: ${String(error)}`,
              });
            },
          });

          yield* Effect.tryPromise({
            try: () => fsProm.writeFile(filePath, ""),
            catch: (error) => {
              Effect.runSync(
                trackFilesystemError("create", error, {
                  upload_id: file.id,
                  path: filePath,
                }),
              );
              return new UploadistaError({
                code: "UNKNOWN_ERROR",
                status: 500,
                body: "Failed to create file",
                details: `File creation failed: ${String(error)}`,
              });
            },
          });

          const fileId = fileExtension
            ? `${file.id}.${fileExtension}`
            : file.id;
          file.storage = {
            id: fileId,
            type: file.storage.type,
            path: filePath,
            bucket: directory,
          };
          file.url = `${deliveryUrl}/${fileId}`;

          // Store file metadata in KV store
          yield* kvStore.set(file.id, file);

          return file;
        });
      },
      remove: (file_id: string): Effect.Effect<void, UploadistaError> => {
        return Effect.gen(function* () {
          const uploadFile = yield* kvStore.get(file_id);
          const file_path =
            uploadFile.storage.path || path.join(directory, file_id);

          yield* Effect.tryPromise({
            try: () => fsProm.unlink(file_path),
            catch: (error) => {
              Effect.runSync(
                trackFilesystemError("remove", error, {
                  upload_id: file_id,
                  path: file_path,
                }),
              );
              return UploadistaError.fromCode("FILE_NOT_FOUND");
            },
          });

          yield* kvStore.delete(file_id);
          yield* activeUploadsGauge(Effect.succeed(-1));
        });
      },
      write: (
        { file_id, stream, offset }: DataStoreWriteOptions,
        {
          onProgress,
        }: { onProgress?: (chunkSize: number) => Effect.Effect<void> },
      ): Effect.Effect<number, UploadistaError> => {
        return withUploadMetrics(
          file_id,
          withTimingMetrics(
            uploadDurationHistogram,
            Effect.gen(function* () {
              const startTime = Date.now();
              // Get the upload file from KV store to retrieve the actual file path
              const uploadFile = yield* kvStore.get(file_id);
              const file_path =
                uploadFile.storage.path || path.join(directory, file_id);

              const bytesReceived = yield* Ref.make(0);

              try {
                const result = yield* Effect.acquireUseRelease(
                  createWriteStream(file_path, offset),
                  (writeStream) =>
                    Effect.gen(function* () {
                      const sink = Sink.forEach(
                        writeChunk({ writeStream, bytesReceived, onProgress }),
                      );

                      yield* uploadPartsTotal(Effect.succeed(1));
                      yield* Stream.run(stream, sink);
                      yield* endWriteStream(writeStream);

                      const totalBytes = yield* Ref.get(bytesReceived);
                      yield* partSizeHistogram(Effect.succeed(totalBytes));
                      return offset + totalBytes;
                    }),
                  destroyWriteStream,
                );

                // Check if upload is complete
                if (uploadFile.size && result === uploadFile.size) {
                  yield* logFilesystemUploadCompletion(file_id, {
                    fileSize: uploadFile.size,
                    totalDurationMs: Date.now() - startTime,
                    partsCount: 1,
                    averagePartSize: uploadFile.size,
                    throughputBps: uploadFile.size / (Date.now() - startTime),
                    retryCount: 0,
                  });
                  yield* uploadSuccessTotal(Effect.succeed(1));
                  yield* activeUploadsGauge(Effect.succeed(-1));
                }

                return result;
              } catch (error) {
                Effect.runSync(
                  trackFilesystemError("write", error, {
                    upload_id: file_id,
                    path: file_path,
                    offset,
                  }),
                );
                throw error;
              }
            }),
          ),
        );
      },
      getUpload: (id: string) =>
        Effect.gen(function* () {
          const uploadFile = yield* kvStore.get(id);

          // For filesystem, get the actual file size from disk
          const file_path = uploadFile.storage.path || path.join(directory, id);
          const stats = yield* Effect.tryPromise({
            try: () => fsProm.stat(file_path),
            catch: () => UploadistaError.fromCode("FILE_NOT_FOUND"),
          });

          return {
            ...uploadFile,
            offset: stats.size,
            size: uploadFile.size,
          };
        }),
      read: (id: string) =>
        Effect.gen(function* () {
          const uploadFile = yield* kvStore.get(id);
          const file_path = uploadFile.storage.path || path.join(directory, id);

          const buffer = yield* Effect.tryPromise({
            try: () => fsProm.readFile(file_path),
            catch: () => UploadistaError.fromCode("FILE_READ_ERROR"),
          });

          return new Uint8Array(buffer);
        }),
      /**
       * Reads file content as a stream of chunks for memory-efficient processing.
       * Uses Node.js fs.createReadStream under the hood.
       *
       * @param id - The unique identifier of the file to read
       * @param config - Optional streaming configuration (chunk size)
       * @returns An Effect that resolves to a Stream of byte chunks
       */
      readStream: (id: string, config?: StreamingConfig) =>
        Effect.gen(function* () {
          const uploadFile = yield* kvStore.get(id);
          const file_path = uploadFile.storage.path || path.join(directory, id);

          // Merge config with defaults
          const effectiveConfig = {
            ...DEFAULT_STREAMING_CONFIG,
            ...config,
          };

          // Verify file exists
          yield* Effect.tryPromise({
            try: () => fsProm.access(file_path, fs.constants.R_OK),
            catch: () => UploadistaError.fromCode("FILE_NOT_FOUND"),
          });

          // Create a Node.js readable stream with the configured chunk size
          const nodeStream = fs.createReadStream(file_path, {
            highWaterMark: effectiveConfig.chunkSize,
          });

          // Convert Node.js stream to Effect Stream
          return Stream.async<Uint8Array, UploadistaError>((emit) => {
            nodeStream.on("data", (chunk: Buffer | string) => {
              // Handle both Buffer and string (though readStream should return Buffer)
              const buffer =
                typeof chunk === "string" ? Buffer.from(chunk) : chunk;
              emit.single(new Uint8Array(buffer));
            });

            nodeStream.on("end", () => {
              emit.end();
            });

            nodeStream.on("error", (error) => {
              emit.fail(
                new UploadistaError({
                  code: "FILE_READ_ERROR",
                  status: 500,
                  body: "Failed to read file stream",
                  details: `Stream read failed: ${String(error)}`,
                }),
              );
            });

            // Cleanup function when stream is interrupted
            return Effect.sync(() => {
              if (!nodeStream.destroyed) {
                nodeStream.destroy();
              }
            });
          });
        }),
      /**
       * Writes file content from a stream without knowing the final size upfront.
       * Creates the file and streams content directly to disk.
       *
       * @param fileId - The unique identifier for the file
       * @param options - Stream write options including the Effect Stream
       * @returns StreamWriteResult with final size after stream completes
       */
      writeStream: (
        fileId: string,
        options: StreamWriteOptions,
      ): Effect.Effect<StreamWriteResult, UploadistaError> =>
        withTimingMetrics(
          uploadDurationHistogram,
          Effect.gen(function* () {
            const startTime = Date.now();

            // Determine file path
            const dirs = fileId.split("/").slice(0, -1);
            const filePath = path.join(directory, fileId);

            yield* uploadRequestsTotal(Effect.succeed(1));
            yield* activeUploadsGauge(Effect.succeed(1));

            // Create directory structure if needed
            if (dirs.length > 0) {
              yield* Effect.tryPromise({
                try: () =>
                  fsProm.mkdir(path.join(directory, ...dirs), {
                    recursive: true,
                  }),
                catch: (error) => {
                  Effect.runSync(
                    trackFilesystemError("writeStream", error, {
                      upload_id: fileId,
                      path: filePath,
                    }),
                  );
                  return new UploadistaError({
                    code: "UNKNOWN_ERROR",
                    status: 500,
                    body: "Failed to create file directory",
                    details: `Directory creation failed: ${String(error)}`,
                  });
                },
              });
            }

            const bytesWritten = yield* Ref.make(0);

            // Create write stream helper for streaming write
            const createNewWriteStream = (targetPath: string) =>
              Effect.sync(() =>
                fs.createWriteStream(targetPath, {
                  flags: "w", // Create new file or truncate existing
                }),
              );

            const result = yield* Effect.acquireUseRelease(
              createNewWriteStream(filePath),
              (writeStream) =>
                Effect.gen(function* () {
                  const sink = Sink.forEach(
                    writeChunk({
                      writeStream,
                      bytesReceived: bytesWritten,
                    }),
                  );

                  yield* uploadPartsTotal(Effect.succeed(1));
                  yield* Stream.run(options.stream, sink);
                  yield* endWriteStream(writeStream);

                  const totalBytes = yield* Ref.get(bytesWritten);
                  yield* partSizeHistogram(Effect.succeed(totalBytes));

                  return totalBytes;
                }),
              destroyWriteStream,
            );

            // Log completion and update metrics
            yield* logFilesystemUploadCompletion(fileId, {
              fileSize: result,
              totalDurationMs: Date.now() - startTime,
              partsCount: 1,
              averagePartSize: result,
              throughputBps: result / Math.max(1, Date.now() - startTime),
              retryCount: 0,
            });
            yield* uploadSuccessTotal(Effect.succeed(1));
            yield* activeUploadsGauge(Effect.succeed(-1));
            yield* fileSizeHistogram(Effect.succeed(result));

            return {
              id: fileId,
              size: result,
              path: filePath,
              bucket: directory,
            } satisfies StreamWriteResult;
          }),
        ),
      getCapabilities,
      validateUploadStrategy,
    } as DataStore<UploadFile>;
  });
