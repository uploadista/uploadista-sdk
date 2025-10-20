import { Effect, Layer, Metric } from "effect";
import type {
  FlowObservabilityService,
  StorageObservabilityService,
  UploadObservabilityService,
} from "./layers.js";
import {
  FlowObservability,
  StorageObservability,
  UploadObservability,
} from "./layers.js";
import { createStorageMetrics } from "./metrics.js";

// ============================================================================
// Test Observability Layers
// ============================================================================

/**
 * Mock storage observability for testing
 */
export const makeTestStorageObservability = (
  storageType: string,
): Layer.Layer<StorageObservability> => {
  const metrics = createStorageMetrics(storageType);
  const service: StorageObservabilityService = {
    serviceName: `test-${storageType}-store`,
    storageType,
    metrics,
    enabled: true,
  };
  return Layer.succeed(StorageObservability, service);
};

/**
 * Mock upload observability for testing
 */
export const makeTestUploadObservability =
  (): Layer.Layer<UploadObservability> => {
    const service: UploadObservabilityService = {
      serviceName: "test-upload-server",
      enabled: true,
      metrics: {
        uploadCreated: Effect.void,
        uploadCompleted: Effect.void,
        uploadFailed: Effect.void,
        chunkUploaded: Effect.void,
      },
    };
    return Layer.succeed(UploadObservability, service);
  };

/**
 * Mock flow observability for testing
 */
export const makeTestFlowObservability = (): Layer.Layer<FlowObservability> => {
  const service: FlowObservabilityService = {
    serviceName: "test-flow-engine",
    enabled: true,
    metrics: {
      flowStarted: Effect.void,
      flowCompleted: Effect.void,
      flowFailed: Effect.void,
      nodeExecuted: Effect.void,
    },
  };
  return Layer.succeed(FlowObservability, service);
};

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Capture metrics snapshot from an effect for testing
 * Note: Metric snapshots are simplified - for full metric testing,
 * use Effect's built-in metric testing utilities
 */
export const captureMetrics = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const result = yield* effect;
    // Metrics are automatically captured by Effect runtime
    yield* Metric.snapshot;
    return result;
  });

/**
 * Test helper to capture metrics around effect execution
 * This is a simplified version - for production testing,
 * use Effect's metric testing utilities
 */
export const withMetricTracking = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    // Track metric before execution
    yield* Metric.snapshot;
    const result = yield* effect;
    // Track metric after execution
    yield* Metric.snapshot;
    return result;
  });

/**
 * Test fixture for observability testing
 */
export interface ObservabilityTestFixture {
  readonly storageObservability: Layer.Layer<StorageObservability>;
  readonly uploadObservability: Layer.Layer<UploadObservability>;
  readonly flowObservability: Layer.Layer<FlowObservability>;
}

/**
 * Create a complete test fixture with all observability layers
 */
export const createTestFixture = (
  storageType = "test-storage",
): ObservabilityTestFixture => ({
  storageObservability: makeTestStorageObservability(storageType),
  uploadObservability: makeTestUploadObservability(),
  flowObservability: makeTestFlowObservability(),
});

/**
 * Run an effect with test observability layers
 */
export const runWithTestObservability = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    StorageObservability | UploadObservability | FlowObservability
  >,
  storageType = "test-storage",
): Effect.Effect<A, E> => {
  const fixture = createTestFixture(storageType);
  return effect.pipe(
    Effect.provide(fixture.storageObservability),
    Effect.provide(fixture.uploadObservability),
    Effect.provide(fixture.flowObservability),
  );
};
