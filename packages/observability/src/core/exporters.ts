/**
 * OTLP Exporter Configuration for Uploadista SDK.
 *
 * This module provides factory functions for creating OpenTelemetry Protocol (OTLP)
 * exporters that send traces, metrics, and logs to observability backends like Grafana,
 * Jaeger, Datadog, and others.
 *
 * Configuration is done via standard OpenTelemetry environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base endpoint URL (default: http://localhost:4318)
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers for authentication (format: key=value,key2=value2)
 * - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: Override endpoint for traces only
 * - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: Override endpoint for metrics only
 * - OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: Override endpoint for logs only
 *
 * @module core/exporters
 */

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

/**
 * Configuration options for OTLP exporters.
 */
export interface OtlpExporterConfig {
  /** Base endpoint URL. Defaults to OTEL_EXPORTER_OTLP_ENDPOINT or http://localhost:4318 */
  endpoint?: string;
  /** Headers to include in requests (for authentication). Defaults to OTEL_EXPORTER_OTLP_HEADERS */
  headers?: Record<string, string>;
  /** Request timeout in milliseconds. Defaults to 5000 */
  timeoutMillis?: number;
}

/**
 * Parses the OTEL_EXPORTER_OTLP_HEADERS environment variable.
 *
 * Format: key=value,key2=value2
 * Example: Authorization=Basic abc123,X-Custom-Header=value
 *
 * @returns Parsed headers as a Record, or undefined if not set
 */
export function parseOtlpHeaders(): Record<string, string> | undefined {
  const headersEnv =
    typeof process !== "undefined"
      ? process.env.OTEL_EXPORTER_OTLP_HEADERS
      : undefined;

  if (!headersEnv) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  const pairs = headersEnv.split(",");

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key && valueParts.length > 0) {
      headers[key.trim()] = valueParts.join("=").trim();
    }
  }

  return Object.keys(headers).length > 0 ? headers : undefined;
}

/**
 * Gets the OTLP endpoint from environment variables with fallback.
 *
 * Checks in order:
 * 1. Provided endpoint parameter
 * 2. Signal-specific endpoint (OTEL_EXPORTER_OTLP_TRACES_ENDPOINT, OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, or OTEL_EXPORTER_OTLP_LOGS_ENDPOINT)
 * 3. Base endpoint (OTEL_EXPORTER_OTLP_ENDPOINT)
 * 4. Default: http://localhost:4318
 *
 * @param signal - The signal type ('traces', 'metrics', or 'logs')
 * @param configEndpoint - Optional endpoint from config
 * @returns The resolved endpoint URL
 */
export function getOtlpEndpoint(
  signal: "traces" | "metrics" | "logs",
  configEndpoint?: string,
): string {
  if (configEndpoint) {
    return configEndpoint;
  }

  if (typeof process !== "undefined") {
    let signalEndpoint: string | undefined;
    switch (signal) {
      case "traces":
        signalEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
        break;
      case "metrics":
        signalEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
        break;
      case "logs":
        signalEndpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
        break;
    }

    if (signalEndpoint) {
      return signalEndpoint;
    }

    if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
      return process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    }
  }

  return "http://localhost:4318";
}

/**
 * Creates an OTLP trace exporter configured from environment variables.
 *
 * The exporter sends traces to an OTLP-compatible endpoint using HTTP/protobuf.
 *
 * @param config - Optional configuration overrides
 * @returns Configured OTLPTraceExporter instance
 *
 * @example
 * ```typescript
 * // Use environment variables
 * const exporter = createOtlpTraceExporter();
 *
 * // Override endpoint
 * const exporter = createOtlpTraceExporter({
 *   endpoint: 'https://otlp.grafana.net'
 * });
 * ```
 */
export function createOtlpTraceExporter(
  config: OtlpExporterConfig = {},
): OTLPTraceExporter {
  const endpoint = getOtlpEndpoint("traces", config.endpoint);
  const headers = config.headers ?? parseOtlpHeaders();
  // Default to 30 seconds to accommodate cloud endpoints like Grafana Cloud
  const timeoutMillis = config.timeoutMillis ?? 30000;

  return new OTLPTraceExporter({
    url: `${endpoint}/v1/traces`,
    headers,
    timeoutMillis,
  });
}

/**
 * Creates an OTLP metric exporter configured from environment variables.
 *
 * The exporter sends metrics to an OTLP-compatible endpoint using HTTP/protobuf.
 *
 * @param config - Optional configuration overrides
 * @returns Configured OTLPMetricExporter instance
 *
 * @example
 * ```typescript
 * // Use environment variables
 * const exporter = createOtlpMetricExporter();
 *
 * // Override endpoint
 * const exporter = createOtlpMetricExporter({
 *   endpoint: 'https://otlp.grafana.net'
 * });
 * ```
 */
export function createOtlpMetricExporter(
  config: OtlpExporterConfig = {},
): OTLPMetricExporter {
  const endpoint = getOtlpEndpoint("metrics", config.endpoint);
  const headers = config.headers ?? parseOtlpHeaders();
  // Default to 30 seconds to accommodate cloud endpoints like Grafana Cloud
  const timeoutMillis = config.timeoutMillis ?? 30000;

  return new OTLPMetricExporter({
    url: `${endpoint}/v1/metrics`,
    headers,
    timeoutMillis,
  });
}

/**
 * Checks if observability is enabled via environment variable.
 *
 * Reads UPLOADISTA_OBSERVABILITY_ENABLED environment variable.
 * Defaults to true if not set.
 *
 * @returns true if observability should be enabled
 */
export function isOtlpExportEnabled(): boolean {
  if (typeof process !== "undefined") {
    const enabled = process.env.UPLOADISTA_OBSERVABILITY_ENABLED;
    if (enabled !== undefined) {
      return enabled.toLowerCase() !== "false" && enabled !== "0";
    }
  }
  return true;
}

/**
 * Gets the service name from environment variables.
 *
 * Reads OTEL_SERVICE_NAME environment variable.
 * Defaults to "uploadista" if not set.
 *
 * @param defaultName - Default service name if not configured
 * @returns The service name to use
 */
export function getServiceName(defaultName = "uploadista"): string {
  if (typeof process !== "undefined" && process.env.OTEL_SERVICE_NAME) {
    return process.env.OTEL_SERVICE_NAME;
  }
  return defaultName;
}

/**
 * Parses resource attributes from OTEL_RESOURCE_ATTRIBUTES environment variable.
 *
 * Format: key=value,key2=value2
 * Example: tenant.id=abc123,deployment.environment=production
 *
 * @returns Parsed attributes as a Record, or empty object if not set
 */
export function parseResourceAttributes(): Record<string, string> {
  if (typeof process === "undefined") {
    return {};
  }

  const attrsEnv = process.env.OTEL_RESOURCE_ATTRIBUTES;
  if (!attrsEnv) {
    return {};
  }

  const attrs: Record<string, string> = {};
  const pairs = attrsEnv.split(",");

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key && valueParts.length > 0) {
      attrs[key.trim()] = valueParts.join("=").trim();
    }
  }

  return attrs;
}

// ============================================================================
// Logs Exporter
// ============================================================================

/**
 * Creates an OTLP log exporter configured from environment variables.
 *
 * The exporter sends logs to an OTLP-compatible endpoint using HTTP/protobuf.
 *
 * @param config - Optional configuration overrides
 * @returns Configured OTLPLogExporter instance
 *
 * @example
 * ```typescript
 * // Use environment variables
 * const exporter = createOtlpLogExporter();
 *
 * // Override endpoint
 * const exporter = createOtlpLogExporter({
 *   endpoint: 'https://otlp.grafana.net'
 * });
 * ```
 */
export function createOtlpLogExporter(
  config: OtlpExporterConfig = {},
): OTLPLogExporter {
  const endpoint = getOtlpEndpoint("logs", config.endpoint);
  const headers = config.headers ?? parseOtlpHeaders();
  // Default to 30 seconds to accommodate cloud endpoints like Grafana Cloud
  const timeoutMillis = config.timeoutMillis ?? 30000;

  return new OTLPLogExporter({
    url: `${endpoint}/v1/logs`,
    headers,
    timeoutMillis,
  });
}

// ============================================================================
// Metrics SDK Configuration
// ============================================================================

/**
 * Configuration for metrics export.
 */
export interface MetricsSdkConfig extends OtlpExporterConfig {
  /** Service name for metrics. Defaults to OTEL_SERVICE_NAME or "uploadista" */
  serviceName?: string;
  /** Export interval in milliseconds. Defaults to OTEL_METRICS_EXPORT_INTERVAL or 60000 */
  exportIntervalMillis?: number;
  /** Export timeout in milliseconds. Defaults to 30000 */
  exportTimeoutMillis?: number;
}

/**
 * Gets the metrics export interval from environment or config.
 *
 * @param configInterval - Optional interval from config
 * @returns Export interval in milliseconds
 */
export function getMetricsExportInterval(configInterval?: number): number {
  if (configInterval !== undefined) {
    return configInterval;
  }

  if (
    typeof process !== "undefined" &&
    process.env.OTEL_METRICS_EXPORT_INTERVAL
  ) {
    const interval = Number.parseInt(
      process.env.OTEL_METRICS_EXPORT_INTERVAL,
      10,
    );
    if (!Number.isNaN(interval) && interval > 0) {
      return interval;
    }
  }

  return 60000; // Default: 60 seconds
}

/**
 * Creates an OTLP MeterProvider with PeriodicExportingMetricReader.
 *
 * The MeterProvider is pre-configured with:
 * - OTLP HTTP exporter for metrics
 * - Periodic export based on OTEL_METRICS_EXPORT_INTERVAL (default: 60s)
 * - Graceful error handling (failures logged, not thrown)
 *
 * @param config - Optional configuration
 * @returns Configured MeterProvider instance
 *
 * @example
 * ```typescript
 * const meterProvider = createOtlpMeterProvider();
 * const meter = meterProvider.getMeter("uploadista");
 * const counter = meter.createCounter("uploads_total");
 * counter.add(1, { storage: "s3" });
 * ```
 */
export function createOtlpMeterProvider(
  config: MetricsSdkConfig = {},
): MeterProvider {
  const exporter = createOtlpMetricExporter(config);
  const exportIntervalMillis = getMetricsExportInterval(
    config.exportIntervalMillis,
  );
  const exportTimeoutMillis = config.exportTimeoutMillis ?? 30000;

  const reader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis,
    exportTimeoutMillis,
  });

  return new MeterProvider({
    readers: [reader],
  });
}

// ============================================================================
// Logs SDK Configuration
// ============================================================================

/**
 * Configuration for logs export.
 */
export interface LogsSdkConfig extends OtlpExporterConfig {
  /** Service name for logs. Defaults to OTEL_SERVICE_NAME or "uploadista" */
  serviceName?: string;
  /** Maximum queue size for batch processor. Defaults to 512 */
  maxQueueSize?: number;
  /** Maximum export batch size. Defaults to 512 */
  maxExportBatchSize?: number;
  /** Schedule delay in milliseconds. Defaults to OTEL_LOGS_EXPORT_INTERVAL or 5000 */
  scheduledDelayMillis?: number;
  /** Export timeout in milliseconds. Defaults to 30000 */
  exportTimeoutMillis?: number;
}

/**
 * Gets the logs export interval from environment or config.
 *
 * @param configInterval - Optional interval from config
 * @returns Export interval in milliseconds
 */
export function getLogsExportInterval(configInterval?: number): number {
  if (configInterval !== undefined) {
    return configInterval;
  }

  if (typeof process !== "undefined" && process.env.OTEL_LOGS_EXPORT_INTERVAL) {
    const interval = Number.parseInt(process.env.OTEL_LOGS_EXPORT_INTERVAL, 10);
    if (!Number.isNaN(interval) && interval > 0) {
      return interval;
    }
  }

  return 5000; // Default: 5 seconds
}

/**
 * Creates an OTLP LoggerProvider with BatchLogRecordProcessor.
 *
 * The LoggerProvider is pre-configured with:
 * - OTLP HTTP exporter for logs
 * - Batch processing with configurable queue and batch sizes
 * - Graceful error handling (failures logged, not thrown)
 *
 * @param config - Optional configuration
 * @returns Configured LoggerProvider instance
 *
 * @example
 * ```typescript
 * const loggerProvider = createOtlpLoggerProvider();
 * const logger = loggerProvider.getLogger("uploadista");
 * logger.emit({
 *   severityNumber: SeverityNumber.INFO,
 *   body: "Upload completed",
 *   attributes: { uploadId: "123" },
 * });
 * ```
 */
export function createOtlpLoggerProvider(
  config: LogsSdkConfig = {},
): LoggerProvider {
  const exporter = createOtlpLogExporter(config);
  const scheduledDelayMillis = getLogsExportInterval(
    config.scheduledDelayMillis,
  );

  const processor = new BatchLogRecordProcessor(exporter, {
    maxQueueSize: config.maxQueueSize ?? 512,
    maxExportBatchSize: config.maxExportBatchSize ?? 512,
    scheduledDelayMillis,
    exportTimeoutMillis: config.exportTimeoutMillis ?? 30000,
  });

  // Create provider and add processor
  // Note: Different OTEL SDK versions have different APIs
  // This approach works with both older and newer versions
  const loggerProvider = new LoggerProvider();
  // Use type assertion to handle API variations across versions
  (
    loggerProvider as unknown as {
      addLogRecordProcessor(processor: unknown): void;
    }
  ).addLogRecordProcessor(processor);

  return loggerProvider;
}

export { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
export { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
export {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
// Re-export types for convenience
export {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
