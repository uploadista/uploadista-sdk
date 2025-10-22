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
import { Effect, Layer, Stream } from "effect";
import type {
  GCSClient,
  GCSClientConfig,
  GCSOperationContext,
} from "./services";
import {
  GCSClientNodeJSLayer,
  GCSClientRESTLayer,
  GCSClientService,
} from "./services";

export type GCSStoreOptions = GCSClientConfig;

/**
 * Convert the Upload object to a format that can be stored in GCS metadata.
 */
function stringifyUploadKeys(
  upload: UploadFile,
): Record<string, string | null> {
  return {
    size: upload.size?.toString() ?? null,
    sizeIsDeferred: `${upload.sizeIsDeferred}`,
    offset: upload.offset?.toString() ?? "0",
    metadata: JSON.stringify(upload.metadata),
    storage: JSON.stringify(upload.storage),
  };
}

const getUpload = (
  id: string,
  kvStore: KvStore<UploadFile>,
  gcsClient: GCSClient,
) => {
  return Effect.gen(function* () {
    try {
      const metadata = yield* gcsClient.getObjectMetadata(id);
      const file = yield* kvStore.get(id);

      return {
        id,
        size: metadata.size,
        offset: metadata.size || 0,
        metadata: metadata.metadata,
        storage: {
          id: file.storage.id,
          type: file.storage.type,
          path: id,
          bucket: gcsClient.bucket,
        },
      };
    } catch (error) {
      if (error instanceof UploadistaError && error.code === "FILE_NOT_FOUND") {
        return yield* Effect.fail(error);
      }
      throw error;
    }
  });
};

export function createGCSStore() {
  return Effect.gen(function* () {
    const gcsClient = yield* GCSClientService;
    const kvStore = yield* UploadFileKVStore;

    const getCapabilities = (): DataStoreCapabilities => {
      return {
        supportsParallelUploads: false, // GCS doesn't have native multipart upload like S3
        supportsConcatenation: true, // Can combine files using compose
        supportsDeferredLength: true,
        supportsResumableUploads: true, // Through resumable uploads
        supportsTransactionalUploads: false,
        maxConcurrentUploads: 1, // Sequential operations
        minChunkSize: undefined,
        maxChunkSize: undefined,
        maxParts: undefined,
        optimalChunkSize: 8 * 1024 * 1024, // 8MB default
        requiresOrderedChunks: true, // Due to compose operation
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
      bucket: gcsClient.bucket,
      create: (file: UploadFile) => {
        return Effect.gen(function* () {
          if (!file.id) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FILE_NOT_FOUND"),
            );
          }

          file.storage = {
            id: file.storage.id,
            type: file.storage.type,
            path: file.id,
            bucket: gcsClient.bucket,
          };

          // Create empty file
          const context = {
            bucket: gcsClient.bucket,
            key: file.id,
            contentType:
              file.metadata?.contentType?.toString() ||
              "application/octet-stream",
            metadata: stringifyUploadKeys(file),
          };

          yield* gcsClient.putObject(file.id, new Uint8Array(0), context);
          return file;
        });
      },

      remove: (file_id: string) => {
        return gcsClient.deleteObject(file_id);
      },

      write: (
        options: DataStoreWriteOptions,
        dependencies: {
          onProgress?: (chunkSize: number) => void;
        },
      ) => {
        return Effect.gen(function* () {
          const { file_id, offset, stream: effectStream } = options;
          const { onProgress } = dependencies;

          // Get current upload metadata
          const upload = yield* getUpload(file_id, kvStore, gcsClient);

          upload.offset = offset;
          // Persist the updated offset
          yield* kvStore.set(file_id, upload as UploadFile);

          const context = {
            bucket: gcsClient.bucket,
            key: file_id,
            contentType:
              upload.metadata?.contentType || "application/octet-stream",
            metadata: stringifyUploadKeys(upload as UploadFile),
          } satisfies Partial<GCSOperationContext>;

          // Convert Effect Stream to ReadableStream
          const readableStream = Stream.toReadableStream(effectStream);

          // Use native streams if available (Node.js implementation)
          if (gcsClient.putObjectFromStreamWithPatching) {
            const isAppend = upload.offset > 0; // Check original file size, not write offset

            return yield* gcsClient.putObjectFromStreamWithPatching(
              file_id,
              upload.offset,
              readableStream,
              context,
              onProgress,
              isAppend,
            );
          } else {
            // Fallback to chunk-based approach for REST implementation
            const reader = readableStream.getReader();
            const chunks: Uint8Array[] = [];
            let totalBytes = 0;

            // Read all chunks
            while (true) {
              const { done, value } = yield* Effect.promise(() =>
                reader.read(),
              );
              if (done) break;

              chunks.push(value);
              const chunkSize = value.byteLength;
              totalBytes += chunkSize;
              onProgress?.(totalBytes);
            }

            // Combine all chunks
            const combinedArray = new Uint8Array(totalBytes);
            let position = 0;
            for (const chunk of chunks) {
              combinedArray.set(chunk, position);
              position += chunk.byteLength;
            }

            // Check if we need to handle patches (append data)
            if (upload.offset === 0) {
              // Direct upload
              yield* gcsClient.putObject(file_id, combinedArray, context);
            } else {
              // We need to combine with existing data
              const patchKey = `${file_id}_patch`;

              // Upload patch data
              yield* gcsClient.putTemporaryObject(
                patchKey,
                combinedArray,
                context,
              );

              // Combine original file with patch
              yield* gcsClient.composeObjects(
                [file_id, patchKey],
                file_id,
                context,
              );

              // Clean up patch file
              yield* gcsClient.deleteTemporaryObject(patchKey);
            }

            return totalBytes;
          }
        });
      },

      getCapabilities,
      validateUploadStrategy,
      read: (file_id: string) => {
        return Effect.gen(function* () {
          const buffer = yield* gcsClient.getObjectBuffer(file_id);
          return buffer;
        });
      },
    } as DataStore<UploadFile>;
  });
}

export const gcsStoreRest = (config: GCSStoreOptions) =>
  createGCSStore().pipe(Effect.provide(GCSClientRESTLayer(config)));

export const gcsStoreNodejs = (config: GCSStoreOptions) =>
  createGCSStore().pipe(Effect.provide(GCSClientNodeJSLayer(config)));
