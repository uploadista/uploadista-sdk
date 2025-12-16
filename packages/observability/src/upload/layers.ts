import { Effect, Layer, Metric } from "effect";
import {
  makeUploadObservabilityLayer,
  UploadObservability,
} from "../core/layers.js";
import { createUploadEngineMetrics } from "./metrics.js";

// ============================================================================
// Upload Observability Layer Implementation
// ============================================================================

/**
 * Create a live upload observability layer with full metrics
 */
export const makeUploadObservabilityLive = (
  serviceName = "uploadista-upload-server",
): Layer.Layer<UploadObservability> => {
  const metrics = createUploadEngineMetrics();

  return Layer.succeed(UploadObservability, {
    serviceName,
    enabled: true,
    metrics: {
      uploadCreated: Effect.succeed(metrics.uploadCreatedTotal).pipe(
        Effect.flatMap((metric) => Metric.increment(metric)),
      ),
      uploadCompleted: Effect.succeed(metrics.uploadCompletedTotal).pipe(
        Effect.flatMap((metric) => Metric.increment(metric)),
      ),
      uploadFailed: Effect.succeed(metrics.uploadFailedTotal).pipe(
        Effect.flatMap((metric) => Metric.increment(metric)),
      ),
      chunkUploaded: Effect.succeed(metrics.chunkUploadedTotal).pipe(
        Effect.flatMap((metric) => Metric.increment(metric)),
      ),
    },
  });
};

/**
 * Default live upload observability layer
 */
export const UploadObservabilityLive = makeUploadObservabilityLive();

/**
 * No-op upload observability layer (for testing or disabled observability)
 */
export const UploadObservabilityDisabled = makeUploadObservabilityLayer(false);

/**
 * Helper to get upload metrics from context
 */
export const getUploadMetrics = Effect.gen(function* () {
  const obs = yield* UploadObservability;
  return obs.metrics;
});

/**
 * Helper to track upload duration
 */
export const withUploadDuration = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | UploadObservability> => {
  const metrics = createUploadEngineMetrics();
  return Effect.gen(function* () {
    const startTime = Date.now();
    const result = yield* effect;
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    yield* Metric.update(metrics.uploadDurationHistogram, duration);
    return result;
  }).pipe(Effect.withSpan("upload-operation"));
};

/**
 * Helper to track chunk upload duration
 */
export const withChunkDuration = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const metrics = createUploadEngineMetrics();
  return Effect.gen(function* () {
    const startTime = Date.now();
    const result = yield* effect;
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    yield* Metric.update(metrics.chunkUploadDurationHistogram, duration);
    return result;
  }).pipe(Effect.withSpan("chunk-upload"));
};
