import type { UploadFile } from "@uploadista/core/types";
import {
  type UploadFileKVStore,
  uploadFileKvStore,
} from "@uploadista/core/types";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { Effect, Layer } from "effect";
import {
  MockR2ClientLayer,
  type MockR2Config,
  type MockR2TestMethods,
} from "../../src/services/__mocks__/r2-client-mock.service";
import { R2ClientService } from "../../src/services/r2-client.service";

// Re-export types for tests
export type { MockR2TestMethods };

import type { R2StoreConfig } from "../../src/types";

// Default test configuration
export const DEFAULT_TEST_CONFIG: MockR2Config = {
  simulateLatency: 0, // No latency by default for faster tests
  errorRate: 0,
  uploadFailureRate: 0,
  enableErrorInjection: true,
};

// Test bucket configuration
export const TEST_BUCKET = "test-uploadista-r2-bucket";
export const TEST_DELIVERY_URL = "https://test-r2-cdn.example.com";

// Common R2 store configuration for tests
export const createTestR2StoreConfig = (
  overrides: Partial<R2StoreConfig> = {},
): Omit<R2StoreConfig, "r2Bucket"> => ({
  deliveryUrl: TEST_DELIVERY_URL,
  partSize: 8 * 1024 * 1024, // 8MB default part size
  minPartSize: 5 * 1024 * 1024, // 5MB minimum
  maxMultipartParts: 10_000,
  maxConcurrentPartUploads: 10,
  bucket: TEST_BUCKET,
  ...overrides,
});

// Layer that provides both KV store and R2 client for testing
// Creates a fresh isolated KV store for each test
export const TestLayersWithMockR2 = (
  mockConfig: MockR2Config = DEFAULT_TEST_CONFIG,
) => {
  // First provide the base KV store, then build the typed store from it
  const kvLayer = uploadFileKvStore.pipe(Layer.provide(memoryKvStore));
  // Merge the KV layer with the mock R2 layer
  return Layer.merge(kvLayer, MockR2ClientLayer(TEST_BUCKET, mockConfig));
};

// Helper to get the mock service with testing methods
export const getMockR2Service = (): Effect.Effect<
  R2ClientService["Type"] & MockR2TestMethods,
  never,
  R2ClientService | UploadFileKVStore
> =>
  Effect.gen(function* () {
    const service = yield* R2ClientService;
    // Type assertion since we know this is our mock when using TestLayersWithMockR2
    return service as R2ClientService["Type"] & MockR2TestMethods;
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
    type: "r2",
    path: id,
    ...overrides.storage,
  },
  url: `${TEST_DELIVERY_URL}/${id}`,
  ...overrides,
});

// Test environment setup that can be used in beforeEach
export const setupTestEnvironment = (
  mockConfig: MockR2Config = DEFAULT_TEST_CONFIG,
) =>
  Effect.gen(function* () {
    const mockService = yield* getMockR2Service();

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
  mockService: R2ClientService["Type"] & MockR2TestMethods,
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
  mockService: R2ClientService["Type"] & MockR2TestMethods,
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
  mockService: R2ClientService["Type"] & MockR2TestMethods,
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
  config: MockR2Config;
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
