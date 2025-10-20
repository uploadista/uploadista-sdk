import { Effect, Metric } from "effect";
import type { StorageMetrics } from "./metrics.js";

// ============================================================================
// Storage Observability Utility Functions
// ============================================================================

// Generic upload metrics wrapper
export const withUploadMetrics = <A, E, R>(
  metrics: StorageMetrics,
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tap(() =>
      metrics.uploadRequestsTotal.pipe(Metric.tagged("upload_id", uploadId))(
        Effect.succeed(1),
      ),
    ),
    Effect.tapError(() =>
      metrics.uploadErrorsTotal.pipe(Metric.tagged("upload_id", uploadId))(
        Effect.succeed(1),
      ),
    ),
    Effect.tap(() =>
      metrics.uploadSuccessTotal.pipe(Metric.tagged("upload_id", uploadId))(
        Effect.succeed(1),
      ),
    ),
  );

// Generic API call metrics wrapper
export const withApiMetrics = <A, E, R>(
  metrics: StorageMetrics,
  operation: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tap(() =>
      metrics.apiCallsTotal.pipe(Metric.tagged("operation", operation))(
        Effect.succeed(1),
      ),
    ),
  );

// Generic timing metrics wrapper
export const withTimingMetrics = <A, E, R>(
  metric: Metric.Metric.Histogram<number>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const startTime = yield* Effect.sync(() => Date.now());
    const result = yield* effect;
    const endTime = yield* Effect.sync(() => Date.now());
    const duration = (endTime - startTime) / 1000; // Convert to seconds

    yield* metric(Effect.succeed(duration));

    return result;
  });

// File size tracking
export const trackFileSize = <A, E, R>(
  metrics: StorageMetrics,
  fileSize: number,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tap(() => metrics.fileSizeHistogram(Effect.succeed(fileSize))),
  );

// Part size tracking
export const trackPartSize = <A, E, R>(
  metrics: StorageMetrics,
  partSize: number,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tap(() => metrics.partSizeHistogram(Effect.succeed(partSize))),
  );

// Active uploads tracking
export const withActiveUploadTracking = <A, E, R>(
  metrics: StorageMetrics,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  effect.pipe(
    Effect.tap(() => metrics.activeUploadsGauge(Effect.succeed(1))),
    Effect.ensuring(metrics.activeUploadsGauge(Effect.succeed(-1))),
  );

// Throughput calculation and tracking
export const withThroughputTracking = <A, E, R>(
  metrics: StorageMetrics,
  bytes: number,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const startTime = yield* Effect.sync(() => Date.now());
    const result = yield* effect;
    const endTime = yield* Effect.sync(() => Date.now());
    const durationSeconds = (endTime - startTime) / 1000;
    const throughputBps = durationSeconds > 0 ? bytes / durationSeconds : 0;

    yield* metrics.uploadThroughputGauge(Effect.succeed(throughputBps));

    return result;
  });

// Combined metrics wrapper for common upload operations
export const withStorageOperationMetrics = <A, E, R>(
  metrics: StorageMetrics,
  operation: string,
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
  fileSize?: number,
): Effect.Effect<A, E, R> => {
  let wrappedEffect = effect.pipe(
    (eff) => withApiMetrics(metrics, operation, eff),
    (eff) => withUploadMetrics(metrics, uploadId, eff),
    (eff) => withTimingMetrics(metrics.uploadDurationHistogram, eff),
    (eff) => withActiveUploadTracking(metrics, eff),
  );

  if (fileSize !== undefined) {
    wrappedEffect = wrappedEffect.pipe(
      (eff) => trackFileSize(metrics, fileSize, eff),
      (eff) => withThroughputTracking(metrics, fileSize, eff),
    );
  }

  return wrappedEffect;
};
