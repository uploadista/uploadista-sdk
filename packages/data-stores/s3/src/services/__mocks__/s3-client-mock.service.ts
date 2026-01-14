import type AWS from "@aws-sdk/client-s3";
import { UploadistaError } from "@uploadista/core/errors";
import { Effect, Layer, Ref } from "effect";
import type { S3OperationContext } from "../../types";
import { S3ClientService } from "../s3-client.service";

// Mock configuration for testing scenarios
export interface MockS3Config {
  simulateLatency?: number; // ms delay for all operations
  errorRate?: number; // 0-1 probability of random errors
  uploadFailureRate?: number; // 0-1 probability of upload failures
  maxObjectSize?: number; // Maximum allowed object size
  enableErrorInjection?: boolean;
}

// In-memory storage for mock S3
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

// Additional methods for testing that extend the base S3ClientService
export interface MockS3TestMethods {
  readonly setConfig: (config: Partial<MockS3Config>) => Effect.Effect<void>;
  readonly clearStorage: () => Effect.Effect<void>;
  readonly injectError: (
    operation: string,
    error: Error,
  ) => Effect.Effect<void>;
  readonly clearError: (operation: string) => Effect.Effect<void>;
  readonly getMetrics: () => Effect.Effect<MockMetrics>;
  readonly getStorage: () => Effect.Effect<MockStorage>;
}

export const makeMockS3ClientService = (
  bucket: string,
  initialConfig: MockS3Config = {},
): Effect.Effect<S3ClientService["Type"] & MockS3TestMethods, never> => {
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

    const configRef = yield* Ref.make<MockS3Config>(initialConfig);
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
          // Don't remove the error - let it persist for retries
          // Tests should clear errors explicitly when done
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error }),
          );
        }
      });

    const maybeInjectRandomError = (operation: string) =>
      Effect.gen(function* () {
        const config = yield* Ref.get(configRef);
        if (config.errorRate && Math.random() < config.errorRate) {
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_WRITE_ERROR", {
              cause: new Error(`Random error in ${operation}`),
            }),
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
    const setConfig = (config: Partial<MockS3Config>) =>
      Ref.update(configRef, (current) => ({ ...current, ...config }));

    const clearStorage = () =>
      Effect.gen(function* () {
        yield* Ref.set(storageRef, {
          objects: new Map(),
          multipartUploads: new Map(),
          incompleteParts: new Map(),
        });
        // Also clear injected errors
        yield* Ref.set(errorInjectionRef, new Map());
        // Reset metrics
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
            UploadistaError.fromCode("FILE_NOT_FOUND", {
              cause: new Error(`Object not found: ${key}`),
            }),
          );
          return new ReadableStream(); // Never reached but helps TypeScript
        }

        yield* Ref.update(metricsRef, (metrics) => ({
          ...metrics,
          totalBytesDownloaded: metrics.totalBytesDownloaded + data.length,
        }));

        // Convert Uint8Array to ReadableStream
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
            UploadistaError.fromCode("FILE_WRITE_ERROR", {
              cause: new Error(
                `Object size ${body.length} exceeds maximum ${config.maxObjectSize}`,
              ),
            }),
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

        return {
          $metadata: {},
          Deleted: keys.map((key) => ({ Key: key })),
          Errors: [],
        } as AWS.DeleteObjectsCommandOutput;
      });

    const createMultipartUpload = (context: S3OperationContext) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("createMultipartUpload");
        yield* checkForInjectedError("createMultipartUpload");

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
        };
      });

    const uploadPart = (
      context: S3OperationContext & { partNumber: number; data: Uint8Array },
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
            UploadistaError.fromCode("FILE_WRITE_ERROR", {
              cause: new Error(`Upload failed for part ${context.partNumber}`),
            }),
          );
        }

        const storage = yield* Ref.get(storageRef);
        const upload = storage.multipartUploads.get(context.uploadId);

        if (!upload) {
          // Return AWS-style error to match real S3 behavior
          const awsError = new Error(
            `Upload not found: ${context.uploadId}`,
          ) as Error & { code: string };
          awsError.code = "NoSuchUpload";
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", { cause: awsError }),
          );
          return ""; // Never reached but helps TypeScript
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
      context: S3OperationContext,
      parts: Array<AWS.Part>,
    ) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("completeMultipartUpload");
        yield* checkForInjectedError("completeMultipartUpload");

        const storage = yield* Ref.get(storageRef);
        const upload = storage.multipartUploads.get(context.uploadId);

        if (!upload) {
          // Return AWS-style error to match real S3 behavior
          const awsError = new Error(
            `Upload not found: ${context.uploadId}`,
          ) as Error & { code: string };
          awsError.code = "NoSuchUpload";
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", { cause: awsError }),
          );
          return; // This will never execute but helps TypeScript
        }

        // Validate all parts are present
        for (const part of parts) {
          if (!part.PartNumber || !upload.parts.has(part.PartNumber)) {
            yield* Effect.fail(
              UploadistaError.fromCode("FILE_WRITE_ERROR", {
                cause: new Error(`Part ${part.PartNumber} not found`),
              }),
            );
          }
        }

        // Combine all parts into final object
        const sortedParts = parts
          .sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0))
          .map((part) => {
            const partData = upload.parts.get(part.PartNumber || 0);
            if (!partData) throw new Error(`Part ${part.PartNumber} not found`);
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
            UploadistaError.fromCode("FILE_WRITE_ERROR", {
              cause: new Error(
                `Total upload size ${totalLength} exceeds maximum ${config.maxObjectSize}`,
              ),
            }),
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

        return `https://${context.bucket}.s3.amazonaws.com/${context.key}`;
      });

    const abortMultipartUpload = (context: S3OperationContext) =>
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

    const listParts = (
      context: S3OperationContext & { partNumberMarker?: string },
    ) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("listParts");
        yield* checkForInjectedError("listParts");

        const storage = yield* Ref.get(storageRef);
        const upload = storage.multipartUploads.get(context.uploadId);

        if (!upload) {
          // Return AWS-style error to match real S3 behavior
          const awsError = new Error(
            `Upload not found: ${context.uploadId}`,
          ) as Error & { code: string };
          awsError.code = "NoSuchUpload";
          yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", { cause: awsError }),
          );
          return {
            parts: [],
            isTruncated: false,
            nextPartNumberMarker: undefined,
          }; // Never reached but helps TypeScript
        }

        const parts: AWS.Part[] = Array.from(upload.parts.entries())
          .map(([partNumber, part]) => ({
            PartNumber: partNumber,
            ETag: part.etag,
            Size: part.data.length,
          }))
          .sort((a, b) => (a.PartNumber || 0) - (b.PartNumber || 0));

        return {
          parts,
          isTruncated: false,
          nextPartNumberMarker: undefined,
        };
      });

    const listMultipartUploads = (
      _keyMarker?: string,
      _uploadIdMarker?: string,
    ) =>
      Effect.gen(function* () {
        yield* simulateLatency();
        yield* recordOperation("listMultipartUploads");
        yield* checkForInjectedError("listMultipartUploads");

        const storage = yield* Ref.get(storageRef);
        const uploads = Array.from(storage.multipartUploads.values()).map(
          (upload) => ({
            Key: upload.metadata.key,
            UploadId: upload.uploadId,
            Initiated: new Date(),
          }),
        );

        return {
          Uploads: uploads,
          IsTruncated: false,
        } as AWS.ListMultipartUploadsCommandOutput;
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
      // S3ClientService methods
      getObject,
      headObject,
      putObject,
      deleteObject,
      deleteObjects,
      createMultipartUpload,
      uploadPart,
      completeMultipartUpload,
      abortMultipartUpload,
      listParts,
      listMultipartUploads,
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

export const MockS3ClientLayer = (bucket: string, config?: MockS3Config) =>
  Layer.effect(S3ClientService, makeMockS3ClientService(bucket, config));
