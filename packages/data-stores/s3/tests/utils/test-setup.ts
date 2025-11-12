import type { UploadFile } from "@uploadista/core/types";
import {
  type UploadFileKVStore,
  uploadFileKvStore,
} from "@uploadista/core/types";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { Effect, Layer } from "effect";
import {
  MockS3ClientLayer,
  type MockS3Config,
  type MockS3TestMethods,
} from "../../src/services/__mocks__/s3-client-mock.service";
import { S3ClientService } from "../../src/services/s3-client.service";

// Re-export types for tests
export type { MockS3TestMethods };

import type { S3StoreConfig } from "../../src/types";

// Default test configuration
export const DEFAULT_TEST_CONFIG: MockS3Config = {
  simulateLatency: 0, // No latency by default for faster tests
  errorRate: 0,
  uploadFailureRate: 0,
  enableErrorInjection: true,
};

// Test bucket configuration
export const TEST_BUCKET = "test-uploadista-bucket";
export const TEST_DELIVERY_URL = "https://test-cdn.example.com";

// Common S3 store configuration for tests
export const createTestS3StoreConfig = (
  overrides: Partial<S3StoreConfig> = {},
): Omit<S3StoreConfig, "kvStore"> => ({
  deliveryUrl: TEST_DELIVERY_URL,
  partSize: 8 * 1024 * 1024, // 8MB default part size
  minPartSize: 5 * 1024 * 1024, // 5MB S3 minimum
  maxMultipartParts: 10_000,
  useTags: true,
  maxConcurrentPartUploads: 10,
  expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000, // 1 week
  s3ClientConfig: {
    region: "us-east-1",
    bucket: TEST_BUCKET,
  },
  ...overrides,
});

// Layer that provides both KV store and S3 client for testing
// Creates a fresh isolated KV store for each test
export const TestLayersWithMockS3 = (
  mockConfig: MockS3Config = DEFAULT_TEST_CONFIG,
) => {
  // First provide the base KV store, then build the typed store from it
  const kvLayer = uploadFileKvStore.pipe(Layer.provide(memoryKvStore));
  // Merge the KV layer with the mock S3 layer
  return Layer.merge(kvLayer, MockS3ClientLayer(TEST_BUCKET, mockConfig));
};

// Not implemented : Layer with real S3 client (for integration tests with LocalStack/Minio)
export const TestLayersWithRealS3 = () => {
  const kvLayer = uploadFileKvStore.pipe(Layer.provide(memoryKvStore));
  return Layer.merge(
    kvLayer,
    Layer.succeed(S3ClientService, {
      bucket: TEST_BUCKET,
      // Add dummy implementations for the interface
      getObject: () => Effect.die("Not implemented in test setup"),
      headObject: () => Effect.die("Not implemented in test setup"),
      putObject: () => Effect.die("Not implemented in test setup"),
      deleteObject: () => Effect.die("Not implemented in test setup"),
      deleteObjects: () => Effect.die("Not implemented in test setup"),
      createMultipartUpload: () => Effect.die("Not implemented in test setup"),
      uploadPart: () => Effect.die("Not implemented in test setup"),
      completeMultipartUpload: () =>
        Effect.die("Not implemented in test setup"),
      abortMultipartUpload: () => Effect.die("Not implemented in test setup"),
      listParts: () => Effect.die("Not implemented in test setup"),
      listMultipartUploads: () => Effect.die("Not implemented in test setup"),
      getIncompletePart: () => Effect.die("Not implemented in test setup"),
      getIncompletePartSize: () => Effect.die("Not implemented in test setup"),
      putIncompletePart: () => Effect.die("Not implemented in test setup"),
      deleteIncompletePart: () => Effect.die("Not implemented in test setup"),
    }),
  );
};

// Helper to get the mock service with testing methods
export const getMockS3Service = (): Effect.Effect<
  S3ClientService["Type"] & MockS3TestMethods,
  never,
  S3ClientService | UploadFileKVStore
> =>
  Effect.gen(function* () {
    const service = yield* S3ClientService;
    // Type assertion since we know this is our mock when using TestLayersWithMockS3
    return service as S3ClientService["Type"] & MockS3TestMethods;
  });

// Helper to create a test upload file
export const createTestUploadFile = (
  id: string,
  size: number,
  overrides: Partial<UploadFile> = {},
): UploadFile => ({
  id,
  offset: 0,
  size,
  metadata: {
    contentType: "application/octet-stream",
    ...overrides.metadata,
  },
  storage: {
    id: id,
    type: "s3",
    path: id,
    ...overrides.storage,
  },
  url: `${TEST_DELIVERY_URL}/${id}`,
  ...overrides,
});

// Test environment setup that can be used in beforeEach
export const setupTestEnvironment = (
  mockConfig: MockS3Config = DEFAULT_TEST_CONFIG,
) =>
  Effect.gen(function* () {
    const mockService = yield* getMockS3Service();

    // Clear storage and reset configuration
    yield* mockService.clearStorage();
    yield* mockService.setConfig({ ...DEFAULT_TEST_CONFIG, ...mockConfig });

    return mockService;
  });

// Helper to run tests with proper error handling and logging
export const runTestWithTimeout = <A, E>(
  effect: Effect.Effect<A, E>,
  timeoutMs: number = 10000,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.timeout(`${timeoutMs} millis`),
      Effect.tapError((error) =>
        Effect.logError("Test failed").pipe(
          Effect.annotateLogs({ error: String(error) }),
        ),
      ),
    ),
  );

// Assertion helpers for common test patterns
export const assertFileUploaded = (
  mockService: S3ClientService["Type"] & MockS3TestMethods,
  fileId: string,
  expectedSize: number,
) =>
  Effect.gen(function* () {
    const storage = yield* mockService.getStorage();
    const uploadedFile = storage.objects.get(fileId);

    if (!uploadedFile) {
      return yield* Effect.fail(new Error(`File ${fileId} was not uploaded`));
    }

    if (uploadedFile.length !== expectedSize) {
      yield* Effect.fail(
        new Error(
          `File ${fileId} size ${uploadedFile.length} does not match expected ${expectedSize}`,
        ),
      );
    }

    return uploadedFile;
  });

export const assertMultipartUploadExists = (
  mockService: S3ClientService["Type"] & MockS3TestMethods,
  uploadId: string,
) =>
  Effect.gen(function* () {
    const storage = yield* mockService.getStorage();
    const upload = storage.multipartUploads.get(uploadId);

    if (!upload) {
      yield* Effect.fail(new Error(`Multipart upload ${uploadId} not found`));
    }

    return upload;
  });

export const assertMetricsRecorded = (
  mockService: S3ClientService["Type"] & MockS3TestMethods,
  operation: string,
  expectedCount: number = 1,
) =>
  Effect.gen(function* () {
    const metrics = yield* mockService.getMetrics();
    const actualCount = metrics.operationCounts.get(operation) || 0;

    if (actualCount !== expectedCount) {
      yield* Effect.fail(
        new Error(
          `Operation ${operation} was called ${actualCount} times, expected ${expectedCount}`,
        ),
      );
    }
  });

// Helper to create test scenarios with different configurations
export interface TestScenario {
  name: string;
  config: MockS3Config;
  description: string;
}

export const createTestScenarios = (): TestScenario[] => [
  {
    name: "normal",
    config: { ...DEFAULT_TEST_CONFIG },
    description: "Normal operation without errors or latency",
  },
  {
    name: "with-latency",
    config: { ...DEFAULT_TEST_CONFIG, simulateLatency: 10 },
    description: "Operation with 10ms simulated latency",
  },
  {
    name: "with-errors",
    config: { ...DEFAULT_TEST_CONFIG, errorRate: 0.1 },
    description: "Operation with 10% random error rate",
  },
  {
    name: "upload-failures",
    config: { ...DEFAULT_TEST_CONFIG, uploadFailureRate: 0.05 },
    description: "Operation with 5% upload failure rate",
  },
  {
    name: "high-latency",
    config: { ...DEFAULT_TEST_CONFIG, simulateLatency: 100 },
    description: "Operation with 100ms simulated latency",
  },
];

// Helper for parameterized tests
export const runParameterizedTest = <T>(
  scenarios: T[],
  testFn: (scenario: T) => Effect.Effect<void, unknown>,
) =>
  Effect.gen(function* () {
    for (const scenario of scenarios) {
      yield* testFn(scenario);
    }
  });
