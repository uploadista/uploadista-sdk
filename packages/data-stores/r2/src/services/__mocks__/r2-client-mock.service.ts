import type { ReadableStream } from "@cloudflare/workers-types";
import { UploadistaError } from "@uploadista/core/errors";
import { Effect, Layer, Ref } from "effect";
import type {
  MultipartUploadInfo,
  R2OperationContext,
  R2UploadedPart,
} from "../../types";
import { R2ClientService } from "../r2-client.service";

// Mock configuration for testing scenarios
export interface MockR2Config {
  simulateLatency?: number; // ms delay for all operations
  errorRate?: number; // 0-1 probability of random errors
  uploadFailureRate?: number; // 0-1 probability of upload failures
  maxObjectSize?: number; // Maximum allowed object size
  enableErrorInjection?: boolean;
}

// In-memory storage for mock R2
interface MockStorage {
  objects: Map<string, Uint8Array>;
  multipartUploads: Map<
    string,
    {
      uploadId: string;
      parts: Map<number, { etag: string; data: Uint8Array }>;
      metadata: {
        contentType?: string;
        cacheControl?: string;
        key: string;
        bucket: string;
      };
    }
  >;
  incompleteParts: Map<string, Uint8Array>;
}

// Mock metrics for testing
interface MockMetrics {
  operationCounts: Map<string, number>;
  lastOperation?: string;
  totalBytesUploaded: number;
  totalBytesDownloaded: number;
}

// Additional methods for testing that extend the base R2ClientService
export interface MockR2TestMethods {
  readonly setConfig: (config: Partial<MockR2Config>) => Effect.Effect<void>;
  readonly clearStorage: () => Effect.Effect<void>;
  readonly injectError: (
    operation: string,
    error: Error,
  ) => Effect.Effect<void>;
  readonly clearError: (operation: string) => Effect.Effect<void>;
  readonly getMetrics: () => Effect.Effect<MockMetrics>;
  readonly getStorage: () => Effect.Effect<MockStorage>;
}

export const makeMockR2ClientService = (
  bucket: string,
  initialConfig: MockR2Config = {},
): Effect.Effect<R2ClientService["Type"] & MockR2TestMethods, never> => {
  return Effect.gen(function* () {
    const storageRef = yield* Ref.make<MockStorage>({
      objects: new Map(),
      multipartUploads: new Map(),
      incompleteParts: new Map(),
    });

    const metricsRef = yield* Ref.make<MockMetrics>({
      operationCounts: new Map(),
      totalBytesUploaded: 0,
      totalBytesDownloaded: 0,
    });

    const configRef = yield* Ref.make<MockR2Config>(initialConfig);
    const errorInjectionRef = yield* Ref.make<Map<string, Error>>(new Map());

    const simulateLatency = () =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);
        if (config.simulateLatency && config.simulateLatency > 0) {
          yield* Effect.sleep(`${config.simulateLatency} millis`);
        }
      });

    const recordOperation = (operation: string) =>
      Effect.gen(function* () {
        yield* Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          lastOperation: operation,
          operationCounts: new Map([
            ...metrics.operationCounts,
            [operation, (metrics.operationCounts.get(operation) || 0) + 1],
          ]),
        }));
      });

    const checkForInjectedError = (operation: string) =>
      Effect.gen(function* () {
        const errorMap = yield* Ref.get(errorInjectionRef);
        const error = errorMap.get(operation);
        if (error) {
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_WRITE_ERROR", error),
          );
        }
      });

    const maybeInjectRandomError = (operation: string) =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);
        if (config.errorRate && Math.random() < config.errorRate) {
          yield* Effect.fail(
            UploadistaError.fromCode(
              "FILE_WRITE_ERROR",
              new Error(`Random error in ${operation}`),
            ),
          );
        }
      });

    const generateETag = (data: Uint8Array): string => {
      // Simple hash for ETag simulation
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
      }
      return `"${Math.abs(hash).toString(16)}"`;
    };

    const generateUploadId = (): string => {
      return `upload-${Date.now()}-${Math.random().toString(36).substring(2)}`;
    };

    // Implementation of service methods
    const setConfig = (config: Partial<MockR2Config>) =>
      Ref.update(configRef, (current) => ({ ...current, ...config }));

    const clearStorage = () =>
      Effect.gen(function* () {
        yield* Ref.set(storageRef, {
          objects: new Map(),
          multipartUploads: new Map(),
          incompleteParts: new Map(),
        });
        yield* Ref.set(errorInjectionRef, new Map());
        yield* Ref.set(metricsRef, {
          operationCounts: new Map(),
          totalBytesUploaded: 0,
          totalBytesDownloaded: 0,
        });
      });

    const injectError = (operation: string, error: Error) =>
      Ref.update(
        errorInjectionRef,
        (map) => new Map([...map, [operation, error]]),
      );

    const clearError = (operation: string) =>
      Ref.update(errorInjectionRef, (map) => {
        const newMap = new Map(map);
        newMap.delete(operation);
        return newMap;
      });

    const getMetrics = () => Ref.get(metricsRef);

    const getObject = (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("getObject");
        yield* checkForInjectedError("getObject");
        yield* maybeInjectRandomError("getObject");

        const storage = yield* Ref.get(storageRef);
        const data = storage.objects.get(key);

        if (!data) {
          yield* Effect.fail(
            UploadistaError.fromCode(
              "FILE_NOT_FOUND",
              new Error(`Object not found: ${key}`),
            ),
          );
          return {} as ReadableStream; // Never reached but helps TypeScript
        }

        yield* Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          totalBytesDownloaded: metrics.totalBytesDownloaded + data.length,
        }));

        // Convert Uint8Array to ReadableStream
        // @ts-expect-error - Using standard ReadableStream in tests
        return new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
      });

    const headObject = (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("headObject");
        yield* checkForInjectedError("headObject");

        const storage = yield* Ref.get(storageRef);
        const data = storage.objects.get(key);
        return data?.length;
      });

    const putObject = (key: string, body: Uint8Array) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("putObject");
        yield* checkForInjectedError("putObject");
        yield* maybeInjectRandomError("putObject");

        const config = yield* Ref.get(configRef);
        if (config.maxObjectSize && body.length > config.maxObjectSize) {
          yield* Effect.fail(
            UploadistaError.fromCode(
              "FILE_WRITE_ERROR",
              new Error(
                `Object size ${body.length} exceeds maximum ${config.maxObjectSize}`,
              ),
            ),
          );
        }

        yield* Ref.update(storageRef, (storage) => ({
          ...storage,
          objects: new Map([...storage.objects, [key, body]]),
        }));

        yield* Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          totalBytesUploaded: metrics.totalBytesUploaded + body.length,
        }));

        return generateETag(body);
      });

    const deleteObject = (key: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("deleteObject");
        yield* checkForInjectedError("deleteObject");

        yield* Ref.update(storageRef, (storage) => {
          const newObjects = new Map(storage.objects);
          newObjects.delete(key);
          return { ...storage, objects: newObjects };
        });
      });

    const deleteObjects = (keys: string[]) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("deleteObjects");
        yield* checkForInjectedError("deleteObjects");

        yield* Ref.update(storageRef, (storage) => {
          const newObjects = new Map(storage.objects);
          for (const key of keys) {
            newObjects.delete(key);
          }
          return { ...storage, objects: newObjects };
        });
      });

    const createMultipartUpload = (context: R2OperationContext) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("createMultipartUpload");
        yield* checkForInjectedError("createMultipartUpload");
        yield* maybeInjectRandomError("createMultipartUpload");

        const uploadId = generateUploadId();

        yield* Ref.update(storageRef, (storage) => ({
          ...storage,
          multipartUploads: new Map([
            ...storage.multipartUploads,
            [
              uploadId,
              {
                uploadId,
                parts: new Map(),
                metadata: {
                  contentType: context.contentType,
                  cacheControl: context.cacheControl,
                  key: context.key,
                  bucket: context.bucket,
                },
              },
            ],
          ]),
        }));

        return {
          uploadId,
          bucket: context.bucket,
          key: context.key,
        } as MultipartUploadInfo;
      });

    const uploadPart = (
      context: R2OperationContext & { partNumber: number; data: Uint8Array },
    ) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("uploadPart");
        yield* checkForInjectedError("uploadPart");

        const config = yield* Ref.get(configRef);
        if (
          config.uploadFailureRate &&
          Math.random() < config.uploadFailureRate
        ) {
          yield* Effect.fail(
            UploadistaError.fromCode(
              "FILE_WRITE_ERROR",
              new Error(`Upload failed for part ${context.partNumber}`),
            ),
          );
        }

        const storage = yield* Ref.get(storageRef);
        const upload = storage.multipartUploads.get(context.uploadId);

        if (!upload) {
          const r2Error = new Error(
            `Upload not found: ${context.uploadId}`,
          ) as Error & { code: string };
          r2Error.code = "NoSuchUpload";
          return yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", r2Error),
          );
        }

        const etag = generateETag(context.data);
        upload.parts.set(context.partNumber, {
          etag,
          data: context.data,
        });

        yield* Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          totalBytesUploaded: metrics.totalBytesUploaded + context.data.length,
        }));

        return etag as string;
      });

    const completeMultipartUpload = (
      context: R2OperationContext,
      parts: Array<R2UploadedPart>,
    ) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("completeMultipartUpload");
        yield* checkForInjectedError("completeMultipartUpload");

        const storage = yield* Ref.get(storageRef);
        const upload = storage.multipartUploads.get(context.uploadId);

        if (!upload) {
          const r2Error = new Error(
            `Upload not found: ${context.uploadId}`,
          ) as Error & { code: string };
          r2Error.code = "NoSuchUpload";
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", r2Error),
          );
          return; // This will never execute but helps TypeScript
        }

        // Validate all parts are present
        for (const part of parts) {
          if (!part.partNumber || !upload.parts.has(part.partNumber)) {
            yield* Effect.fail(
              UploadistaError.fromCode(
                "FILE_WRITE_ERROR",
                new Error(`Part ${part.partNumber} not found`),
              ),
            );
          }
        }

        // Combine all parts into final object
        const sortedParts = parts
          .sort((a, b) => (a.partNumber || 0) - (b.partNumber || 0))
          .map((part) => {
            const partData = upload.parts.get(part.partNumber || 0);
            if (!partData) throw new Error(`Part ${part.partNumber} not found`);
            return partData.data;
          });

        const totalLength = sortedParts.reduce(
          (sum, part) => sum + part.length,
          0,
        );

        // Check if total size exceeds configured maximum
        const config = yield* Ref.get(configRef);
        if (config.maxObjectSize && totalLength > config.maxObjectSize) {
          yield* Effect.fail(
            UploadistaError.fromCode(
              "FILE_WRITE_ERROR",
              new Error(
                `Total upload size ${totalLength} exceeds maximum ${config.maxObjectSize}`,
              ),
            ),
          );
        }

        const combinedData = new Uint8Array(totalLength);
        let offset = 0;

        for (const part of sortedParts) {
          combinedData.set(part, offset);
          offset += part.length;
        }

        // Store the final object
        yield* Ref.update(storageRef, (storage) => ({
          ...storage,
          objects: new Map([...storage.objects, [context.key, combinedData]]),
          multipartUploads: new Map(
            [...storage.multipartUploads].filter(
              ([id]) => id !== context.uploadId,
            ),
          ),
        }));

        return context.key;
      });

    const abortMultipartUpload = (context: R2OperationContext) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("abortMultipartUpload");
        yield* checkForInjectedError("abortMultipartUpload");

        yield* Ref.update(storageRef, (storage) => ({
          ...storage,
          multipartUploads: new Map(
            [...storage.multipartUploads].filter(
              ([id]) => id !== context.uploadId,
            ),
          ),
        }));
      });

    const getIncompletePart = (id: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("getIncompletePart");

        const storage = yield* Ref.get(storageRef);
        const data = storage.incompleteParts.get(`${id}.part`);

        if (!data) {
          return undefined;
        }

        // @ts-expect-error - Using standard ReadableStream in tests
        return new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        });
      });

    const getIncompletePartSize = (id: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("getIncompletePartSize");

        const storage = yield* Ref.get(storageRef);
        const data = storage.incompleteParts.get(`${id}.part`);
        return data?.length;
      });

    const putIncompletePart = (id: string, data: Uint8Array) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("putIncompletePart");
        yield* checkForInjectedError("putIncompletePart");

        yield* Ref.update(storageRef, (storage) => ({
          ...storage,
          incompleteParts: new Map([
            ...storage.incompleteParts,
            [`${id}.part`, data],
          ]),
        }));

        yield* Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          totalBytesUploaded: metrics.totalBytesUploaded + data.length,
        }));

        return generateETag(data);
      });

    const deleteIncompletePart = (id: string) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("deleteIncompletePart");

        yield* Ref.update(storageRef, (storage) => {
          const newIncompleteParts = new Map(storage.incompleteParts);
          newIncompleteParts.delete(`${id}.part`);
          return { ...storage, incompleteParts: newIncompleteParts };
        });
      });

    const getStorage = () => Ref.get(storageRef);

    return {
      bucket,
      // R2ClientService methods
      getObject,
      headObject,
      putObject,
      deleteObject,
      deleteObjects,
      createMultipartUpload,
      uploadPart,
      completeMultipartUpload,
      abortMultipartUpload,
      getIncompletePart,
      getIncompletePartSize,
      putIncompletePart,
      deleteIncompletePart,
      // Mock-specific test methods
      setConfig,
      clearStorage,
      injectError,
      clearError,
      getMetrics,
      getStorage,
    };
  });
};

export const MockR2ClientLayer = (bucket: string, config?: MockR2Config) =>
  Layer.effect(R2ClientService, makeMockR2ClientService(bucket, config));
