/**
 * OTLP Metrics SDK Layers for Uploadista SDK.
 *
 * This module provides Effect Layers that export metrics to OTLP-compatible
 * backends like Grafana Mimir, Prometheus, Datadog, and others.
 *
 * Configuration is done via standard OpenTelemetry environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base endpoint URL (default: http://localhost:4318)
 * - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: Override endpoint for metrics only
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers for authentication
 * - OTEL_SERVICE_NAME: Service name (default: uploadista)
 * - OTEL_METRICS_EXPORT_INTERVAL: Export interval in ms (default: 60000)
 * - UPLOADISTA_OBSERVABILITY_ENABLED: Set to "false" to disable (default: true)
 *
 * @module core/metrics-sdk
 */

import type { Meter } from "@opentelemetry/api";
import type { MeterProvider } from "@opentelemetry/sdk-metrics";
import { Context, Effect, Layer } from "effect";
import {
  createOtlpMeterProvider,
  getServiceName,
  isOtlpExportEnabled,
  type MetricsSdkConfig,
} from "./exporters.js";

// ============================================================================
// Metrics Service
// ============================================================================

/**
 * OpenTelemetry Meter service for recording metrics.
 */
export interface OtelMeterService {
  /** The OpenTelemetry Meter instance */
  readonly meter: Meter;
  /** The MeterProvider for shutdown handling */
  readonly provider: MeterProvider;
}

/**
 * Effect Context tag for the OTEL Meter service.
 */
export class OtelMeter extends Context.Tag("OtelMeter")<
  OtelMeter,
  OtelMeterService
>() {}

// ============================================================================
// Metrics SDK Layers
// ============================================================================

/**
 * Creates a Metrics SDK layer with the given configuration.
 *
 * @param config - Metrics SDK configuration
 * @returns Effect Layer providing OtelMeter service
 */
function createMetricsSdkLayer(config: MetricsSdkConfig = {}) {
  return Layer.scoped(
    OtelMeter,
    Effect.gen(function* () {
      // Check if observability is disabled
      if (!isOtlpExportEnabled()) {
        // Return a no-op meter that doesn't export
        const { MeterProvider } = yield* Effect.promise(
          () => import("@opentelemetry/sdk-metrics"),
        );
        const noopProvider = new MeterProvider();
        return {
          meter: noopProvider.getMeter(getServiceName("uploadista")),
          provider: noopProvider,
        };
      }

      // Create the OTLP MeterProvider
      const provider = createOtlpMeterProvider(config);
      const serviceName = config.serviceName ?? getServiceName("uploadista");
      const meter = provider.getMeter(serviceName);

      // Register shutdown handler
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          try {
            await provider.shutdown();
          } catch (error) {
            // Log but don't throw on shutdown errors
            console.warn("Error shutting down MeterProvider:", error);
          }
        }),
      );

      return { meter, provider };
    }),
  );
}

/**
 * Node.js OTLP Metrics SDK Layer for production use.
 *
 * Exports metrics to an OTLP-compatible endpoint configured via environment variables.
 *
 * @example
 * ```typescript
 * import { OtlpMetricsNodeSdkLive, OtelMeter } from "@uploadista/observability";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   const { meter } = yield* OtelMeter;
 *   const counter = meter.createCounter("uploads_total");
 *   counter.add(1, { storage: "s3" });
 * }).pipe(Effect.provide(OtlpMetricsNodeSdkLive));
 * ```
 */
export const OtlpMetricsNodeSdkLive = createMetricsSdkLayer();

/**
 * Creates a customized OTLP Metrics Node.js SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer
 *
 * @example
 * ```typescript
 * const customMetrics = createOtlpMetricsNodeSdkLayer({
 *   serviceName: "my-upload-service",
 *   exportIntervalMillis: 30000, // Export every 30 seconds
 * });
 * ```
 */
export function createOtlpMetricsNodeSdkLayer(config: MetricsSdkConfig = {}) {
  return createMetricsSdkLayer(config);
}

/**
 * Browser OTLP Metrics SDK Layer for production use.
 *
 * Uses the same OTLP HTTP exporter, suitable for browser environments.
 * Note: Browser environments may have CORS restrictions.
 *
 * @example
 * ```typescript
 * import { OtlpMetricsWebSdkLive } from "@uploadista/observability";
 *
 * const program = myEffect.pipe(Effect.provide(OtlpMetricsWebSdkLive));
 * ```
 */
export const OtlpMetricsWebSdkLive = createMetricsSdkLayer();

/**
 * Creates a customized OTLP Metrics Web SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer for browser environments
 */
export function createOtlpMetricsWebSdkLayer(config: MetricsSdkConfig = {}) {
  return createMetricsSdkLayer(config);
}

/**
 * Cloudflare Workers OTLP Metrics SDK Layer for production use.
 *
 * Pre-configured with Workers-appropriate defaults.
 *
 * @example
 * ```typescript
 * import { OtlpMetricsWorkersSdkLive } from "@uploadista/observability";
 *
 * export default {
 *   async fetch(request, env) {
 *     const program = handleRequest(request).pipe(
 *       Effect.provide(OtlpMetricsWorkersSdkLive)
 *     );
 *     return Effect.runPromise(program);
 *   }
 * };
 * ```
 */
export const OtlpMetricsWorkersSdkLive = createMetricsSdkLayer({
  serviceName: getServiceName("uploadista-workers"),
});

/**
 * Creates a customized OTLP Metrics Workers SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer for Cloudflare Workers
 */
export function createOtlpMetricsWorkersSdkLayer(
  config: MetricsSdkConfig = {},
) {
  return createMetricsSdkLayer({
    serviceName: getServiceName("uploadista-workers"),
    ...config,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Records a counter metric using the OTEL Meter from context.
 *
 * @param name - Counter name
 * @param value - Value to add (default: 1)
 * @param attributes - Optional metric attributes
 * @returns Effect that records the counter
 *
 * @example
 * ```typescript
 * yield* recordCounter("uploads_total", 1, { storage: "s3" });
 * ```
 */
export const recordCounter = (
  name: string,
  value = 1,
  attributes?: Record<string, string | number | boolean>,
) =>
  Effect.gen(function* () {
    const { meter } = yield* OtelMeter;
    const counter = meter.createCounter(name);
    counter.add(value, attributes);
  });

/**
 * Records a histogram metric using the OTEL Meter from context.
 *
 * @param name - Histogram name
 * @param value - Value to record
 * @param attributes - Optional metric attributes
 * @returns Effect that records the histogram
 *
 * @example
 * ```typescript
 * yield* recordHistogram("upload_duration_seconds", 1.5, { storage: "s3" });
 * ```
 */
export const recordHistogram = (
  name: string,
  value: number,
  attributes?: Record<string, string | number | boolean>,
) =>
  Effect.gen(function* () {
    const { meter } = yield* OtelMeter;
    const histogram = meter.createHistogram(name);
    histogram.record(value, attributes);
  });

/**
 * Creates an observable gauge that reports the current value.
 *
 * @param name - Gauge name
 * @param callback - Function that returns the current value
 * @param attributes - Optional metric attributes
 * @returns Effect that registers the gauge
 *
 * @example
 * ```typescript
 * let activeUploads = 0;
 * yield* createGauge("active_uploads", () => activeUploads);
 * ```
 */
export const createGauge = (
  name: string,
  callback: () => number,
  attributes?: Record<string, string | number | boolean>,
) =>
  Effect.gen(function* () {
    const { meter } = yield* OtelMeter;
    meter
      .createObservableGauge(name, {
        description: name,
      })
      .addCallback((result) => {
        result.observe(callback(), attributes);
      });
  });
