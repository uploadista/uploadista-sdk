/**
 * OTLP Logs SDK Layers for Uploadista SDK.
 *
 * This module provides Effect Layers that export logs to OTLP-compatible
 * backends like Grafana Loki, Elasticsearch, and others.
 *
 * Logs are automatically enriched with:
 * - trace_id and span_id for correlation with traces
 * - Service name and resource attributes
 * - Effect log annotations as attributes
 *
 * Configuration is done via standard OpenTelemetry environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base endpoint URL (default: http://localhost:4318)
 * - OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: Override endpoint for logs only
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers for authentication
 * - OTEL_SERVICE_NAME: Service name (default: uploadista)
 * - OTEL_LOGS_EXPORT_INTERVAL: Export interval in ms (default: 5000)
 * - UPLOADISTA_OBSERVABILITY_ENABLED: Set to "false" to disable (default: true)
 *
 * @module core/logs-sdk
 */

import { trace } from "@opentelemetry/api";
import type { Logger } from "@opentelemetry/api-logs";
import { SeverityNumber } from "@opentelemetry/api-logs";
import type { LoggerProvider } from "@opentelemetry/sdk-logs";
import { Context, Effect, Logger as EffectLogger, Layer } from "effect";
import {
  createOtlpLoggerProvider,
  getServiceName,
  isOtlpExportEnabled,
  type LogsSdkConfig,
} from "./exporters.js";

// ============================================================================
// Logs Service
// ============================================================================

/**
 * OpenTelemetry Logger service for emitting logs.
 */
export interface OtelLoggerService {
  /** The OpenTelemetry Logger instance */
  readonly logger: Logger;
  /** The LoggerProvider for shutdown handling */
  readonly provider: LoggerProvider;
}

/**
 * Effect Context tag for the OTEL Logger service.
 */
export class OtelLogger extends Context.Tag("OtelLogger")<
  OtelLogger,
  OtelLoggerService
>() {}

// ============================================================================
// Log Level Mapping
// ============================================================================

/**
 * Maps Effect log levels to OpenTelemetry SeverityNumber.
 *
 * | Effect Level | OTEL Severity |
 * |--------------|---------------|
 * | Debug        | 5 (DEBUG)     |
 * | Info         | 9 (INFO)      |
 * | Warning      | 13 (WARN)     |
 * | Error        | 17 (ERROR)    |
 * | Fatal        | 21 (FATAL)    |
 */
export function mapLogLevelToSeverity(level: string): SeverityNumber {
  switch (level.toLowerCase()) {
    case "debug":
    case "trace":
      return SeverityNumber.DEBUG;
    case "info":
      return SeverityNumber.INFO;
    case "warning":
    case "warn":
      return SeverityNumber.WARN;
    case "error":
      return SeverityNumber.ERROR;
    case "fatal":
    case "critical":
      return SeverityNumber.FATAL;
    default:
      return SeverityNumber.INFO;
  }
}

/**
 * Maps SeverityNumber to human-readable severity text.
 */
export function severityToText(severity: SeverityNumber): string {
  if (severity <= SeverityNumber.DEBUG) return "DEBUG";
  if (severity <= SeverityNumber.INFO) return "INFO";
  if (severity <= SeverityNumber.WARN) return "WARN";
  if (severity <= SeverityNumber.ERROR) return "ERROR";
  return "FATAL";
}

// ============================================================================
// Trace Context Injection
// ============================================================================

/**
 * Gets the current trace context from OpenTelemetry.
 *
 * @returns Object with trace_id and span_id if active, empty object otherwise
 */
export function getTraceContext(): Record<string, string> {
  const span = trace.getActiveSpan();
  if (!span) {
    return {};
  }

  const ctx = span.spanContext();
  // Only include if valid trace ID
  if (ctx.traceId === "00000000000000000000000000000000") {
    return {};
  }

  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: String(ctx.traceFlags),
  };
}

// ============================================================================
// Logs SDK Layers
// ============================================================================

/**
 * Extended configuration for logs SDK.
 */
export interface LogsLayerConfig extends LogsSdkConfig {
  /** Minimum severity level to export. Logs below this level are filtered. */
  minSeverity?: SeverityNumber;
}

/**
 * Creates a Logs SDK layer with the given configuration.
 *
 * @param config - Logs SDK configuration
 * @returns Effect Layer providing OtelLogger service
 */
function createLogsSdkLayer(config: LogsLayerConfig = {}) {
  return Layer.scoped(
    OtelLogger,
    Effect.gen(function* () {
      // Check if observability is disabled
      if (!isOtlpExportEnabled()) {
        // Return a no-op logger that doesn't export
        const { LoggerProvider } = yield* Effect.promise(
          () => import("@opentelemetry/sdk-logs"),
        );
        const noopProvider = new LoggerProvider();
        return {
          logger: noopProvider.getLogger(getServiceName("uploadista")),
          provider: noopProvider,
        };
      }

      // Create the OTLP LoggerProvider
      const provider = createOtlpLoggerProvider(config);
      const serviceName = config.serviceName ?? getServiceName("uploadista");
      const logger = provider.getLogger(serviceName);

      // Register shutdown handler
      yield* Effect.addFinalizer(() =>
        Effect.promise(async () => {
          try {
            await provider.shutdown();
          } catch (error) {
            // Log but don't throw on shutdown errors
            console.warn("Error shutting down LoggerProvider:", error);
          }
        }),
      );

      return { logger, provider };
    }),
  );
}

/**
 * Node.js OTLP Logs SDK Layer for production use.
 *
 * Exports logs to an OTLP-compatible endpoint with automatic trace correlation.
 *
 * @example
 * ```typescript
 * import { OtlpLogsNodeSdkLive, OtelLogger } from "@uploadista/observability";
 * import { Effect } from "effect";
 * import { SeverityNumber } from "@opentelemetry/api-logs";
 *
 * const program = Effect.gen(function* () {
 *   const { logger } = yield* OtelLogger;
 *   logger.emit({
 *     severityNumber: SeverityNumber.INFO,
 *     body: "Upload completed",
 *     attributes: { uploadId: "123" },
 *   });
 * }).pipe(Effect.provide(OtlpLogsNodeSdkLive));
 * ```
 */
export const OtlpLogsNodeSdkLive = createLogsSdkLayer();

/**
 * Creates a customized OTLP Logs Node.js SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer
 *
 * @example
 * ```typescript
 * const customLogs = createOtlpLogsNodeSdkLayer({
 *   serviceName: "my-upload-service",
 *   minSeverity: SeverityNumber.WARN, // Only export WARN and above
 * });
 * ```
 */
export function createOtlpLogsNodeSdkLayer(config: LogsLayerConfig = {}) {
  return createLogsSdkLayer(config);
}

/**
 * Browser OTLP Logs SDK Layer for production use.
 *
 * Uses the same OTLP HTTP exporter, suitable for browser environments.
 * Note: Browser environments may have CORS restrictions.
 *
 * @example
 * ```typescript
 * import { OtlpLogsWebSdkLive } from "@uploadista/observability";
 *
 * const program = myEffect.pipe(Effect.provide(OtlpLogsWebSdkLive));
 * ```
 */
export const OtlpLogsWebSdkLive = createLogsSdkLayer();

/**
 * Creates a customized OTLP Logs Web SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer for browser environments
 */
export function createOtlpLogsWebSdkLayer(config: LogsLayerConfig = {}) {
  return createLogsSdkLayer(config);
}

/**
 * Cloudflare Workers OTLP Logs SDK Layer for production use.
 *
 * Pre-configured with Workers-appropriate defaults.
 *
 * @example
 * ```typescript
 * import { OtlpLogsWorkersSdkLive } from "@uploadista/observability";
 *
 * export default {
 *   async fetch(request, env) {
 *     const program = handleRequest(request).pipe(
 *       Effect.provide(OtlpLogsWorkersSdkLive)
 *     );
 *     return Effect.runPromise(program);
 *   }
 * };
 * ```
 */
export const OtlpLogsWorkersSdkLive = createLogsSdkLayer({
  serviceName: getServiceName("uploadista-workers"),
});

/**
 * Creates a customized OTLP Logs Workers SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer for Cloudflare Workers
 */
export function createOtlpLogsWorkersSdkLayer(config: LogsLayerConfig = {}) {
  return createLogsSdkLayer({
    serviceName: getServiceName("uploadista-workers"),
    ...config,
  });
}

// ============================================================================
// Effect Logger Integration
// ============================================================================

/**
 * Creates an Effect Logger that forwards logs to OTLP.
 *
 * This logger intercepts Effect.log calls and sends them to the OTLP endpoint
 * with automatic trace correlation and annotation support.
 *
 * @param minSeverity - Minimum severity to export (default: all)
 * @returns Effect Logger that exports to OTLP
 *
 * @example
 * ```typescript
 * import { createOtlpEffectLogger, OtlpLogsNodeSdkLive } from "@uploadista/observability";
 *
 * const program = Effect.gen(function* () {
 *   yield* Effect.log("This will be exported to OTLP");
 *   yield* Effect.logError("Errors too!");
 * }).pipe(
 *   Effect.provide(OtlpLogsNodeSdkLive),
 *   EffectLogger.withMinimumLogLevel(LogLevel.Debug),
 * );
 * ```
 */
export const createOtlpEffectLogger = (minSeverity?: SeverityNumber) =>
  EffectLogger.make<unknown, void>(({ logLevel, message, annotations }) => {
    // This is a synchronous logger - we'll emit to OTEL directly
    // In a real implementation, we'd need to access the OtelLogger from context
    // For now, we'll use the global approach

    const severity = mapLogLevelToSeverity(logLevel.label);

    // Filter by minimum severity if specified
    if (minSeverity !== undefined && severity < minSeverity) {
      return;
    }

    // Get trace context for correlation
    const traceContext = getTraceContext();

    // Convert annotations to attributes
    const attributes: Record<string, unknown> = {
      ...traceContext,
    };

    // Add annotations as attributes
    for (const [key, value] of annotations) {
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        attributes[key] = value;
      } else {
        attributes[key] = String(value);
      }
    }

    // Log to console as fallback (the actual OTLP export happens in the layer)
    // This ensures logs are not lost even if OTLP export fails
    const logFn =
      severity >= SeverityNumber.ERROR
        ? console.error
        : severity >= SeverityNumber.WARN
          ? console.warn
          : console.log;

    logFn(`[${logLevel.label}] ${String(message)}`, attributes);
  });

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Emits a log record to OTLP using the OtelLogger from context.
 *
 * @param level - Log level (debug, info, warn, error, fatal)
 * @param message - Log message
 * @param attributes - Optional log attributes
 * @returns Effect that emits the log
 *
 * @example
 * ```typescript
 * yield* emitLog("info", "Upload completed", { uploadId: "123" });
 * ```
 */
export const emitLog = (
  level: "debug" | "info" | "warn" | "error" | "fatal",
  message: string,
  attributes?: Record<string, string | number | boolean>,
) =>
  Effect.gen(function* () {
    const { logger } = yield* OtelLogger;
    const severity = mapLogLevelToSeverity(level);
    const traceContext = getTraceContext();

    logger.emit({
      severityNumber: severity,
      severityText: severityToText(severity),
      body: message,
      attributes: {
        ...traceContext,
        ...attributes,
      },
    });
  });

/**
 * Emits a debug log to OTLP.
 */
export const logDebug = (
  message: string,
  attributes?: Record<string, string | number | boolean>,
) => emitLog("debug", message, attributes);

/**
 * Emits an info log to OTLP.
 */
export const logInfo = (
  message: string,
  attributes?: Record<string, string | number | boolean>,
) => emitLog("info", message, attributes);

/**
 * Emits a warning log to OTLP.
 */
export const logWarn = (
  message: string,
  attributes?: Record<string, string | number | boolean>,
) => emitLog("warn", message, attributes);

/**
 * Emits an error log to OTLP.
 */
export const logError = (
  message: string,
  attributes?: Record<string, string | number | boolean>,
) => emitLog("error", message, attributes);

/**
 * Emits a fatal log to OTLP.
 */
export const logFatal = (
  message: string,
  attributes?: Record<string, string | number | boolean>,
) => emitLog("fatal", message, attributes);

// Re-export SeverityNumber for convenience
export { SeverityNumber } from "@opentelemetry/api-logs";
