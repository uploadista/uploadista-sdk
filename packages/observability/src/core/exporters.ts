/**
 * OTLP Exporter Configuration for Uploadista SDK.
 *
 * This module provides factory functions for creating OpenTelemetry Protocol (OTLP)
 * exporters that send traces and metrics to observability backends like Grafana,
 * Jaeger, Datadog, and others.
 *
 * Configuration is done via standard OpenTelemetry environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base endpoint URL (default: http://localhost:4318)
 * - OTEL_EXPORTER_OTLP_HEADERS: Headers for authentication (format: key=value,key2=value2)
 * - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: Override endpoint for traces only
 * - OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: Override endpoint for metrics only
 *
 * @module core/exporters
 */

import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

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
 * 2. Signal-specific endpoint (OTEL_EXPORTER_OTLP_TRACES_ENDPOINT or OTEL_EXPORTER_OTLP_METRICS_ENDPOINT)
 * 3. Base endpoint (OTEL_EXPORTER_OTLP_ENDPOINT)
 * 4. Default: http://localhost:4318
 *
 * @param signal - The signal type ('traces' or 'metrics')
 * @param configEndpoint - Optional endpoint from config
 * @returns The resolved endpoint URL
 */
export function getOtlpEndpoint(
  signal: "traces" | "metrics",
  configEndpoint?: string,
): string {
  if (configEndpoint) {
    return configEndpoint;
  }

  if (typeof process !== "undefined") {
    const signalEndpoint =
      signal === "traces"
        ? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
        : process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;

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
