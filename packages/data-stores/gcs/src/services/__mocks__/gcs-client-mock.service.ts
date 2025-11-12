import { UploadistaError } from "@uploadista/core/errors";
import { Effect, Layer } from "effect";
import type {
  GCSClient,
  GCSObjectMetadata,
  GCSOperationContext,
} from "../gcs-client.service";
import { GCSClientService } from "../gcs-client.service";

export interface MockGCSConfig {
  simulateLatency: number;
  errorRate: number;
  uploadFailureRate: number;
  enableErrorInjection: boolean;
}

// Storage types
export interface MockGCSObject {
  key: string;
  data: Uint8Array;
  metadata: Partial<GCSObjectMetadata>;
  contentType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MockGCSStorage {
  objects: Map<string, MockGCSObject>;
  resumableUploads: Map<
    string,
    { context: GCSOperationContext; data: Uint8Array[] }
  >;
  operationCounts: Map<string, number>;
}

export interface MockGCSTestMethods {
  // Test-only methods to inspect internal state
  getStorage: () => Effect.Effect<MockGCSStorage, never>;
  getMetrics: () => Effect.Effect<
    {
      operationCounts: Map<string, number>;
      totalObjects: number;
      totalBytes: number;
    },
    never
  >;
  clearStorage: () => Effect.Effect<void, never>;
  injectError: (operation: string, error: Error) => Effect.Effect<void, never>;
}

/**
 * Create a mock GCS client that simulates GCS operations in memory
 */
export function createMockGCSClient(
  bucket: string,
  config: MockGCSConfig,
): GCSClient & MockGCSTestMethods {
  const storage: MockGCSStorage = {
    objects: new Map(),
    resumableUploads: new Map(),
    operationCounts: new Map(),
  };

  const injectedErrors = new Map<string, Error>();

  // Helper: simulate latency
  const simulateLatency = () =>
    config.simulateLatency > 0
      ? Effect.sleep(`${config.simulateLatency} millis`)
      : Effect.void;

  // Helper: check for injected errors
  const checkInjectedError = (operation: string) =>
    Effect.gen(function* () {
      const error = injectedErrors.get(operation);
      if (error) {
        injectedErrors.delete(operation);
        return yield* Effect.fail(
          UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error }),
        );
      }
    });

  // Helper: simulate random errors
  const maybeInjectError = (operation: string) =>
    Effect.gen(function* () {
      if (config.enableErrorInjection) {
        const errorRate =
          operation.includes("upload") || operation.includes("put")
            ? config.uploadFailureRate
            : config.errorRate;

        if (Math.random() < errorRate) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FILE_WRITE_ERROR", {
              cause: new Error(`Simulated ${operation} failure`),
            }),
          );
        }
      }
    });

  // Helper: track operation
  const trackOperation = (operation: string) =>
    Effect.sync(() => {
      const count = storage.operationCounts.get(operation) || 0;
      storage.operationCounts.set(operation, count + 1);
    });

  // Helper: convert ReadableStream to Uint8Array
  const streamToUint8Array = (
    stream: ReadableStream<Uint8Array>,
  ): Effect.Effect<Uint8Array, UploadistaError> =>
    Effect.gen(function* () {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let totalLength = 0;

      while (true) {
        const { done, value } = yield* Effect.promise(() => reader.read());
        if (done) break;
        chunks.push(value);
        totalLength += value.byteLength;
      }

      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.byteLength;
      }

      return result;
    });

  return {
    bucket,

    // Basic operations
    getObject: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("getObject");
        yield* checkInjectedError("getObject");
        yield* maybeInjectError("getObject");

        const obj = storage.objects.get(key);
        if (!obj) {
          return yield* Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
        }

        // Convert Uint8Array to ReadableStream
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(obj.data);
            controller.close();
          },
        });

        return stream;
      }),

    getObjectMetadata: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("getObjectMetadata");
        yield* checkInjectedError("getObjectMetadata");
        yield* maybeInjectError("getObjectMetadata");

        const obj = storage.objects.get(key);
        if (!obj) {
          return yield* Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
        }

        return {
          name: key,
          bucket,
          size: obj.data.byteLength,
          contentType: obj.contentType,
          metadata: obj.metadata.metadata as Record<string, string | null>,
          generation: "1",
          timeCreated: obj.createdAt.toISOString(),
          updated: obj.updatedAt.toISOString(),
        };
      }),

    getObjectBuffer: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("getObjectBuffer");
        yield* checkInjectedError("getObjectBuffer");
        yield* maybeInjectError("getObjectBuffer");

        const obj = storage.objects.get(key);
        if (!obj) {
          return yield* Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
        }

        return obj.data;
      }),

    objectExists: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("objectExists");

        return storage.objects.has(key);
      }),

    putObject: (key: string, body: Uint8Array, context?: Partial<GCSOperationContext>) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("putObject");
        yield* checkInjectedError("putObject");
        yield* maybeInjectError("putObject");

        storage.objects.set(key, {
          key,
          data: body,
          metadata: {
            metadata: context?.metadata,
          },
          contentType: context?.contentType,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return key;
      }),

    putObjectFromStreamWithPatching: (
      key: string,
      offset: number,
      readableStream: ReadableStream,
      context?: Partial<GCSOperationContext>,
      onProgress?: (chunkSize: number) => void,
      isAppend?: boolean,
    ) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("putObjectFromStreamWithPatching");
        yield* checkInjectedError("putObjectFromStreamWithPatching");
        yield* maybeInjectError("putObjectFromStreamWithPatching");

        // Read stream data
        const newData = yield* streamToUint8Array(readableStream);

        if (isAppend) {
          // Append mode: combine with existing data
          const patchKey = `${key}_patch`;

          // Store patch temporarily
          storage.objects.set(patchKey, {
            key: patchKey,
            data: newData,
            metadata: {},
            contentType: context?.contentType,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Get existing file
          const existingObj = storage.objects.get(key);
          if (!existingObj) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FILE_NOT_FOUND"),
            );
          }

          // Combine files
          const combinedData = new Uint8Array(
            existingObj.data.byteLength + newData.byteLength,
          );
          combinedData.set(existingObj.data, 0);
          combinedData.set(newData, existingObj.data.byteLength);

          // Update main file
          storage.objects.set(key, {
            key,
            data: combinedData,
            metadata: {
              metadata: context?.metadata,
            },
            contentType: context?.contentType || existingObj.contentType,
            createdAt: existingObj.createdAt,
            updatedAt: new Date(),
          });

          // Delete patch
          storage.objects.delete(patchKey);

          if (onProgress) {
            onProgress(combinedData.byteLength);
          }

          return combinedData.byteLength;
        } else {
          // Direct upload mode
          storage.objects.set(key, {
            key,
            data: newData,
            metadata: {
              metadata: context?.metadata,
            },
            contentType: context?.contentType,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          if (onProgress) {
            onProgress(newData.byteLength);
          }

          return newData.byteLength;
        }
      }),

    deleteObject: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("deleteObject");
        yield* checkInjectedError("deleteObject");
        yield* maybeInjectError("deleteObject");

        storage.objects.delete(key);
      }),

    // Resumable upload operations
    createResumableUpload: (context: GCSOperationContext) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("createResumableUpload");
        yield* checkInjectedError("createResumableUpload");
        yield* maybeInjectError("createResumableUpload");

        const uploadId = `upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=resumable&upload_id=${uploadId}`;

        storage.resumableUploads.set(uploadUrl, { context, data: [] });

        return uploadUrl;
      }),

    uploadChunk: (uploadUrl: string, chunk: Uint8Array, start: number, total?: number) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("uploadChunk");
        yield* checkInjectedError("uploadChunk");
        yield* maybeInjectError("uploadChunk");

        const upload = storage.resumableUploads.get(uploadUrl);
        if (!upload) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND"),
          );
        }

        upload.data.push(chunk);

        const bytesUploaded = start + chunk.byteLength;
        const completed = total !== undefined && bytesUploaded >= total;

        if (completed) {
          // Combine all chunks
          const totalSize = upload.data.reduce(
            (sum, c) => sum + c.byteLength,
            0,
          );
          const combinedData = new Uint8Array(totalSize);
          let offset = 0;
          for (const c of upload.data) {
            combinedData.set(c, offset);
            offset += c.byteLength;
          }

          // Store the object
          storage.objects.set(upload.context.key, {
            key: upload.context.key,
            data: combinedData,
            metadata: {
              metadata: upload.context.metadata,
            },
            contentType: upload.context.contentType,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Clean up resumable upload
          storage.resumableUploads.delete(uploadUrl);
        }

        return { completed, bytesUploaded };
      }),

    getUploadStatus: (uploadUrl: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("getUploadStatus");

        const upload = storage.resumableUploads.get(uploadUrl);
        if (!upload) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND"),
          );
        }

        const bytesUploaded = upload.data.reduce(
          (sum, chunk) => sum + chunk.byteLength,
          0,
        );

        return { bytesUploaded, completed: false };
      }),

    cancelUpload: (uploadUrl: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("cancelUpload");

        storage.resumableUploads.delete(uploadUrl);
      }),

    // Compose operations
    composeObjects: (sourceKeys: string[], destinationKey: string, context?: Partial<GCSOperationContext>) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("composeObjects");
        yield* checkInjectedError("composeObjects");
        yield* maybeInjectError("composeObjects");

        // Get all source objects
        const sourceObjects = sourceKeys.map((key) => storage.objects.get(key));

        if (sourceObjects.some((obj) => !obj)) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND"),
          );
        }

        // Calculate total size
        const totalSize = sourceObjects.reduce(
          (sum, obj) => sum + (obj?.data.byteLength || 0),
          0,
        );

        // Combine data
        const combinedData = new Uint8Array(totalSize);
        let offset = 0;
        for (const obj of sourceObjects) {
          if (obj) {
            combinedData.set(obj.data, offset);
            offset += obj.data.byteLength;
          }
        }

        // Store combined object
        storage.objects.set(destinationKey, {
          key: destinationKey,
          data: combinedData,
          metadata: {
            metadata: context?.metadata,
          },
          contentType: context?.contentType || sourceObjects[0]?.contentType,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return destinationKey;
      }),

    // Temporary file operations
    putTemporaryObject: (key: string, body: Uint8Array, context?: Partial<GCSOperationContext>) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("putTemporaryObject");
        yield* checkInjectedError("putTemporaryObject");
        yield* maybeInjectError("putTemporaryObject");

        storage.objects.set(key, {
          key,
          data: body,
          metadata: {
            metadata: context?.metadata,
          },
          contentType: context?.contentType,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return key;
      }),

    getTemporaryObject: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("getTemporaryObject");

        const obj = storage.objects.get(key);
        if (!obj) {
          return undefined;
        }

        // Convert Uint8Array to ReadableStream
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(obj.data);
            controller.close();
          },
        });

        return stream;
      }),

    deleteTemporaryObject: (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* trackOperation("deleteTemporaryObject");

        storage.objects.delete(key);
      }),

    // Test-only methods
    getStorage: () => Effect.succeed(storage),

    getMetrics: () =>
      Effect.gen(function* () {
        const totalObjects = storage.objects.size;
        const totalBytes = Array.from(storage.objects.values()).reduce(
          (sum, obj) => sum + obj.data.byteLength,
          0,
        );

        return {
          operationCounts: storage.operationCounts,
          totalObjects,
          totalBytes,
        };
      }),

    clearStorage: () =>
      Effect.sync(() => {
        storage.objects.clear();
        storage.resumableUploads.clear();
        storage.operationCounts.clear();
      }),

    injectError: (operation: string, error: Error) =>
      Effect.sync(() => {
        injectedErrors.set(operation, error);
      }),
  };
}

/**
 * Create a layer that provides a mock GCS client
 */
export const MockGCSClientLayer = (
  bucket: string,
  config: MockGCSConfig = {
    simulateLatency: 0,
    errorRate: 0,
    uploadFailureRate: 0,
    enableErrorInjection: true,
  },
): Layer.Layer<GCSClientService, never, never> => {
  return Layer.succeed(GCSClientService, createMockGCSClient(bucket, config));
};
