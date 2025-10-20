import { Context, Effect, Layer, Option } from "effect";
import type { StorageMetrics } from "./metrics.js";

// ============================================================================
// Observability Layer Interfaces
// ============================================================================

/**
 * Core observability service providing tracing, metrics, and logging capabilities
 */
export interface ObservabilityService {
  readonly serviceName: string;
  readonly enabled: boolean;
}

/**
 * Observability service tag for Effect Context
 */
export class Observability extends Context.Tag("Observability")<
  Observability,
  ObservabilityService
>() {}

/**
 * Storage observability service extending base observability with storage-specific metrics
 */
export interface StorageObservabilityService extends ObservabilityService {
  readonly storageType: string;
  readonly metrics: StorageMetrics;
}

/**
 * Storage observability service tag
 */
export class StorageObservability extends Context.Tag("StorageObservability")<
  StorageObservability,
  StorageObservabilityService
>() {}

/**
 * Upload observability service for upload-specific operations
 */
export interface UploadObservabilityService extends ObservabilityService {
  readonly metrics: {
    uploadCreated: Effect.Effect<void>;
    uploadCompleted: Effect.Effect<void>;
    uploadFailed: Effect.Effect<void>;
    chunkUploaded: Effect.Effect<void>;
  };
}

/**
 * Upload observability service tag
 */
export class UploadObservability extends Context.Tag("UploadObservability")<
  UploadObservability,
  UploadObservabilityService
>() {}

/**
 * Flow observability service for flow execution operations
 */
export interface FlowObservabilityService extends ObservabilityService {
  readonly metrics: {
    flowStarted: Effect.Effect<void>;
    flowCompleted: Effect.Effect<void>;
    flowFailed: Effect.Effect<void>;
    nodeExecuted: Effect.Effect<void>;
  };
}

/**
 * Flow observability service tag
 */
export class FlowObservability extends Context.Tag("FlowObservability")<
  FlowObservability,
  FlowObservabilityService
>() {}

// ============================================================================
// Layer Factories
// ============================================================================

/**
 * Create a base observability layer
 */
export const makeObservabilityLayer = (
  serviceName: string,
  enabled = true,
): Layer.Layer<Observability> =>
  Layer.succeed(Observability, {
    serviceName,
    enabled,
  });

/**
 * Create a storage observability layer
 */
export const makeStorageObservabilityLayer = (
  storageType: string,
  metrics: StorageMetrics,
  enabled = true,
): Layer.Layer<StorageObservability> =>
  Layer.succeed(StorageObservability, {
    serviceName: `uploadista-${storageType}-store`,
    storageType,
    metrics,
    enabled,
  });

/**
 * Create an upload observability layer
 */
export const makeUploadObservabilityLayer = (
  enabled = true,
): Layer.Layer<UploadObservability> =>
  Layer.succeed(UploadObservability, {
    serviceName: "uploadista-upload-server",
    enabled,
    metrics: {
      uploadCreated: Effect.void,
      uploadCompleted: Effect.void,
      uploadFailed: Effect.void,
      chunkUploaded: Effect.void,
    },
  });

/**
 * Create a flow observability layer
 */
export const makeFlowObservabilityLayer = (
  enabled = true,
): Layer.Layer<FlowObservability> =>
  Layer.succeed(FlowObservability, {
    serviceName: "uploadista-flow-engine",
    enabled,
    metrics: {
      flowStarted: Effect.void,
      flowCompleted: Effect.void,
      flowFailed: Effect.void,
      nodeExecuted: Effect.void,
    },
  });

// ============================================================================
// No-op Layers (for testing and opt-out)
// ============================================================================

/**
 * No-op observability layer (disabled)
 */
export const ObservabilityDisabled = makeObservabilityLayer(
  "uploadista-disabled",
  false,
);

/**
 * No-op storage observability layer
 */
export const StorageObservabilityDisabled = (storageType: string) =>
  makeStorageObservabilityLayer(
    storageType,
    {} as StorageMetrics, // No-op metrics
    false,
  );

/**
 * No-op upload observability layer
 */
export const UploadObservabilityDisabled = makeUploadObservabilityLayer(false);

/**
 * No-op flow observability layer
 */
export const FlowObservabilityDisabled = makeFlowObservabilityLayer(false);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if observability is enabled in the current context
 */
export const isObservabilityEnabled = Effect.gen(function* () {
  const observability = yield* Effect.serviceOption(Observability);
  return Option.match(observability, {
    onNone: () => false,
    onSome: (obs) => obs.enabled,
  });
});

/**
 * Execute an effect only if observability is enabled
 */
export const whenObservabilityEnabled = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<Option.Option<A>, E, R | Observability> =>
  Effect.gen(function* () {
    const enabled = yield* isObservabilityEnabled;
    if (enabled) {
      const result = yield* effect;
      return Option.some(result);
    }
    return Option.none();
  });
