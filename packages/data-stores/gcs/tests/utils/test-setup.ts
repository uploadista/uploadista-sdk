import type { UploadFile } from "@uploadista/core/types";
import {
  type UploadFileKVStore,
  uploadFileKvStore,
} from "@uploadista/core/types";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { Effect, Layer } from "effect";
import {
  MockGCSClientLayer,
  type MockGCSConfig,
  type MockGCSTestMethods,
} from "../../src/services/__mocks__/gcs-client-mock.service";
import { GCSClientService } from "../../src/services/gcs-client.service";
import type { GCSStoreOptions } from "../../src/gcs-store-v2";

// Re-export types for tests
export type { MockGCSTestMethods };

// Default test configuration
export const DEFAULT_TEST_CONFIG: MockGCSConfig = {
  simulateLatency: 0, // No latency by default for faster tests
  errorRate: 0,
  uploadFailureRate: 0,
  enableErrorInjection: true,
};

// Test bucket configuration
export const TEST_BUCKET = "test-uploadista-gcs-bucket";

// Common GCS store configuration for tests
export const createTestGCSStoreConfig = (
  overrides: Partial<GCSStoreOptions> = {},
): GCSStoreOptions => ({
  bucket: TEST_BUCKET,
  projectId: "test-project",
  ...overrides,
});

// Layer that provides both KV store and GCS client for testing
export const TestLayersWithMockGCS = (
  mockConfig: MockGCSConfig = DEFAULT_TEST_CONFIG,
) => {
  const kvLayer = uploadFileKvStore.pipe(Layer.provide(memoryKvStore));
  return Layer.merge(kvLayer, MockGCSClientLayer(TEST_BUCKET, mockConfig));
};

// Helper to get the mock service with testing methods
export const getMockGCSService = (): Effect.Effect<
  GCSClientService["Type"] & MockGCSTestMethods,
  never,
  GCSClientService | UploadFileKVStore
> =>
  Effect.gen(function* () {
    const service = yield* GCSClientService;
    return service as GCSClientService["Type"] & MockGCSTestMethods;
  });

// Helper to run tests with timeout
export const runTestWithTimeout = async <E, R>(
  effect: Effect.Effect<void, E, R>,
  timeout = 10000,
) => {
  await Effect.runPromise(Effect.timeout(effect, `${timeout} millis`));
};

// Helper to set up test environment
export const setupTestEnvironment = (): Effect.Effect<
  GCSClientService["Type"] & MockGCSTestMethods,
  never,
  GCSClientService | UploadFileKVStore
> => getMockGCSService();

// Helper to create test upload file
export const createTestUploadFile = (
  id: string,
  size: number,
  options: {
    metadata?: Record<string, unknown>;
  } = {},
): UploadFile => ({
  id,
  size,
  offset: 0,
  metadata: options.metadata,
  storage: {
    id: "test-storage",
    type: "gcs",
    path: id,
    bucket: TEST_BUCKET,
  },
  sizeIsDeferred: false,
});

// Helper to assert file was uploaded correctly
export const assertFileUploaded = (
  mockService: MockGCSTestMethods,
  fileId: string,
  expectedSize: number,
): Effect.Effect<Uint8Array, never> =>
  Effect.gen(function* () {
    const storage = yield* mockService.getStorage();
    const obj = storage.objects.get(fileId);

    if (!obj) {
      throw new Error(`File ${fileId} not found in storage`);
    }

    if (obj.data.byteLength !== expectedSize) {
      throw new Error(
        `File size mismatch: expected ${expectedSize}, got ${obj.data.byteLength}`,
      );
    }

    return obj.data;
  });

// Helper to assert metrics were recorded
export const assertMetricsRecorded = (
  mockService: MockGCSTestMethods,
  operation: string,
  minCount: number,
): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const metrics = yield* mockService.getMetrics();
    const count = metrics.operationCounts.get(operation) || 0;

    if (count < minCount) {
      throw new Error(
        `Expected at least ${minCount} ${operation} operations, got ${count}`,
      );
    }
  });
