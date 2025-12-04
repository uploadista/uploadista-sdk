/**
 * Full Observability SDK Layers for Uploadista SDK.
 *
 * This module provides combined Effect Layers that enable all three pillars
 * of observability (Traces, Metrics, Logs) with a single import.
 *
 * Configuration is done via standard OpenTelemetry environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base endpoint URL (default: http://localhost:4318)
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers for authentication
 * - OTEL_SERVICE_NAME: Service name (default: uploadista)
 * - UPLOADISTA_OBSERVABILITY_ENABLED: Set to "false" to disable (default: true)
 *
 * @module core/full-observability
 */

import { Effect, Layer } from "effect";
import type { MetricsSdkConfig } from "./exporters.js";
import { getServiceName } from "./exporters.js";
import {
  createOtlpLogsNodeSdkLayer,
  createOtlpLogsWebSdkLayer,
  createOtlpLogsWorkersSdkLayer,
  type LogsLayerConfig,
  OtlpLogsNodeSdkLive,
  OtlpLogsWebSdkLive,
  OtlpLogsWorkersSdkLive,
} from "./logs-sdk.js";
import {
  createOtlpMetricsNodeSdkLayer,
  createOtlpMetricsWebSdkLayer,
  createOtlpMetricsWorkersSdkLayer,
  OtlpMetricsNodeSdkLive,
  OtlpMetricsWebSdkLive,
  OtlpMetricsWorkersSdkLive,
} from "./metrics-sdk.js";
import {
  createOtlpNodeSdkLayer,
  createOtlpWebSdkLayer,
  createOtlpWorkersSdkLayer,
  OtlpNodeSdkLive,
  type OtlpSdkConfig,
  OtlpWebSdkLive,
  OtlpWorkersSdkLive,
} from "./tracing.js";

// ============================================================================
// Combined Configuration
// ============================================================================

/**
 * Configuration for full observability SDK.
 */
export interface FullObservabilityConfig {
  /** Service name for all telemetry. Defaults to OTEL_SERVICE_NAME or "uploadista" */
  serviceName?: string;
  /** Additional resource attributes */
  resourceAttributes?: Record<string, string>;
  /** Traces-specific configuration */
  traces?: Omit<OtlpSdkConfig, "serviceName" | "resourceAttributes">;
  /** Metrics-specific configuration */
  metrics?: Omit<MetricsSdkConfig, "serviceName">;
  /** Logs-specific configuration */
  logs?: Omit<LogsLayerConfig, "serviceName">;
}

// ============================================================================
// Combined SDK Layers
// ============================================================================

/**
 * Node.js Full Observability SDK Layer.
 *
 * Combines traces, metrics, and logs export into a single layer.
 * Use this for easy setup of complete observability.
 *
 * @example
 * ```typescript
 * import { OtlpFullObservabilityNodeSdkLive } from "@uploadista/observability";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 *   // All three pillars are now active:
 *   // - Traces via Effect.withSpan
 *   // - Metrics via OtelMeter
 *   // - Logs via OtelLogger
 *   yield* Effect.log("This goes to OTLP!");
 * }).pipe(Effect.provide(OtlpFullObservabilityNodeSdkLive));
 * ```
 */
export const OtlpFullObservabilityNodeSdkLive = Layer.mergeAll(
  OtlpNodeSdkLive,
  OtlpMetricsNodeSdkLive,
  OtlpLogsNodeSdkLive,
);

/**
 * Creates a customized Full Observability Node.js SDK Layer.
 *
 * @param config - Configuration for all three pillars
 * @returns Combined Effect Layer
 *
 * @example
 * ```typescript
 * const customObservability = createOtlpFullObservabilityNodeSdkLayer({
 *   serviceName: "my-upload-service",
 *   traces: { maxQueueSize: 1024 },
 *   metrics: { exportIntervalMillis: 30000 },
 *   logs: { minSeverity: SeverityNumber.WARN },
 * });
 * ```
 */
export function createOtlpFullObservabilityNodeSdkLayer(
  config: FullObservabilityConfig = {},
) {
  const serviceName = config.serviceName ?? getServiceName("uploadista");
  const resourceAttributes = config.resourceAttributes;

  return Layer.mergeAll(
    createOtlpNodeSdkLayer({
      serviceName,
      resourceAttributes,
      ...config.traces,
    }),
    createOtlpMetricsNodeSdkLayer({
      serviceName,
      ...config.metrics,
    }),
    createOtlpLogsNodeSdkLayer({
      serviceName,
      ...config.logs,
    }),
  );
}

/**
 * Browser Full Observability SDK Layer.
 *
 * Combines traces, metrics, and logs export for browser environments.
 *
 * @example
 * ```typescript
 * import { OtlpFullObservabilityWebSdkLive } from "@uploadista/observability";
 *
 * const program = myEffect.pipe(Effect.provide(OtlpFullObservabilityWebSdkLive));
 * ```
 */
export const OtlpFullObservabilityWebSdkLive = Layer.mergeAll(
  OtlpWebSdkLive,
  OtlpMetricsWebSdkLive,
  OtlpLogsWebSdkLive,
);

/**
 * Creates a customized Full Observability Web SDK Layer.
 *
 * @param config - Configuration for all three pillars
 * @returns Combined Effect Layer for browser environments
 */
export function createOtlpFullObservabilityWebSdkLayer(
  config: FullObservabilityConfig = {},
) {
  const serviceName = config.serviceName ?? getServiceName("uploadista");
  const resourceAttributes = config.resourceAttributes;

  return Layer.mergeAll(
    createOtlpWebSdkLayer({
      serviceName,
      resourceAttributes,
      ...config.traces,
    }),
    createOtlpMetricsWebSdkLayer({
      serviceName,
      ...config.metrics,
    }),
    createOtlpLogsWebSdkLayer({
      serviceName,
      ...config.logs,
    }),
  );
}

/**
 * Cloudflare Workers Full Observability SDK Layer.
 *
 * Combines traces, metrics, and logs export for Workers environments.
 *
 * @example
 * ```typescript
 * import { OtlpFullObservabilityWorkersSdkLive } from "@uploadista/observability";
 *
 * export default {
 *   async fetch(request, env) {
 *     const program = handleRequest(request).pipe(
 *       Effect.provide(OtlpFullObservabilityWorkersSdkLive)
 *     );
 *     return Effect.runPromise(program);
 *   }
 * };
 * ```
 */
export const OtlpFullObservabilityWorkersSdkLive = Layer.mergeAll(
  OtlpWorkersSdkLive,
  OtlpMetricsWorkersSdkLive,
  OtlpLogsWorkersSdkLive,
);

/**
 * Creates a customized Full Observability Workers SDK Layer.
 *
 * @param config - Configuration for all three pillars
 * @returns Combined Effect Layer for Cloudflare Workers
 */
export function createOtlpFullObservabilityWorkersSdkLayer(
  config: FullObservabilityConfig = {},
) {
  const serviceName =
    config.serviceName ?? getServiceName("uploadista-workers");
  const resourceAttributes = config.resourceAttributes;

  return Layer.mergeAll(
    createOtlpWorkersSdkLayer({
      serviceName,
      resourceAttributes,
      ...config.traces,
    }),
    createOtlpMetricsWorkersSdkLayer({
      serviceName,
      ...config.metrics,
    }),
    createOtlpLogsWorkersSdkLayer({
      serviceName,
      ...config.logs,
    }),
  );
}

// ============================================================================
// Auto-Detection Layer
// ============================================================================

/**
 * Runtime environment types.
 */
export type Environment = "node" | "web" | "workers";

/**
 * Detects the current runtime environment.
 *
 * @returns The detected environment
 */
export function detectEnvironment(): Environment {
  // Check for Node.js
  if (typeof process !== "undefined" && process.versions?.node) {
    return "node";
  }

  // Check for browser (has navigator and window)
  if (typeof navigator !== "undefined" && typeof window !== "undefined") {
    return "web";
  }

  // Default to workers (Cloudflare Workers, Deno Deploy, etc.)
  return "workers";
}

/**
 * Auto-detecting Full Observability SDK Layer.
 *
 * Automatically selects the appropriate layer based on runtime environment.
 *
 * @example
 * ```typescript
 * import { OtlpAutoSdkLive } from "@uploadista/observability";
 *
 * // Works in Node.js, Browser, or Workers automatically
 * const program = myEffect.pipe(Effect.provide(OtlpAutoSdkLive));
 * ```
 */
export const OtlpAutoSdkLive = Layer.unwrapEffect(
  Effect.sync(() => {
    const env = detectEnvironment();
    switch (env) {
      case "node":
        return OtlpFullObservabilityNodeSdkLive;
      case "web":
        return OtlpFullObservabilityWebSdkLive;
      case "workers":
        return OtlpFullObservabilityWorkersSdkLive;
    }
  }),
);

/**
 * Creates an auto-detecting Full Observability SDK Layer with custom config.
 *
 * @param config - Configuration for all three pillars
 * @returns Auto-detecting combined Effect Layer
 */
export function createOtlpAutoSdkLayer(config: FullObservabilityConfig = {}) {
  return Layer.unwrapEffect(
    Effect.sync(() => {
      const env = detectEnvironment();
      switch (env) {
        case "node":
          return createOtlpFullObservabilityNodeSdkLayer(config);
        case "web":
          return createOtlpFullObservabilityWebSdkLayer(config);
        case "workers":
          return createOtlpFullObservabilityWorkersSdkLayer(config);
      }
    }),
  );
}
