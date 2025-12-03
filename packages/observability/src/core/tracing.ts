import { NodeSdk, WebSdk } from "@effect/opentelemetry";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Context, Effect, Layer } from "effect";
import {
  createOtlpTraceExporter,
  getServiceName,
  isOtlpExportEnabled,
  parseResourceAttributes,
} from "./exporters.js";

// ============================================================================
// Universal Tracing (Environment-agnostic)
// ============================================================================

// Generic service tag for tracing context
export const TracingService = Context.GenericTag<{ serviceName: string }>(
  "TracingService",
);

// Create a tracing layer using Effect's native tracing (works in all environments)
export const createTracingLayer = (options?: { serviceName?: string }) => {
  const serviceName = options?.serviceName ?? "uploadista-storage";

  // Return a layer that provides tracing service context
  return Layer.succeed(TracingService, { serviceName });
};

// Storage-specific tracing layers
export const createStorageTracingLayer = (storageType: string) =>
  createTracingLayer({
    serviceName: `uploadista-${storageType}-store`,
  });

// Utility to add storage context to spans
export const withStorageSpan =
  <A, E, R>(
    operation: string,
    storageType: string,
    attributes?: Record<string, unknown>,
  ) =>
  (effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.withSpan(`${storageType}-${operation}`, {
        attributes: {
          "storage.type": storageType,
          operation: operation,
          ...attributes,
        },
      }),
    );

// Set up tracing with the OpenTelemetry SDK
export const WebSdkLive = WebSdk.layer(() => ({
  resource: { serviceName: "uploadista-storage" },
  // Export span data to the console
  spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
}));

export const NodeSdkLive = NodeSdk.layer(() => ({
  resource: { serviceName: "uploadista-storage" },
  // Export span data to the console
  spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
}));

// Cloudflare Workers SDK (uses WebSdk as base)
export const WorkersSdkLive = WebSdk.layer(() => ({
  resource: { serviceName: "uploadista-storage-workers" },
  // Export span data to the console in Workers environment
  spanProcessor: new BatchSpanProcessor(new ConsoleSpanExporter()),
}));

// ============================================================================
// OTLP Export Layers (Production)
// ============================================================================

/**
 * Configuration options for OTLP SDK layers.
 */
export interface OtlpSdkConfig {
  /** Service name for traces. Defaults to OTEL_SERVICE_NAME or "uploadista" */
  serviceName?: string;
  /** Additional resource attributes to include in all spans */
  resourceAttributes?: Record<string, string>;
  /** Maximum queue size for batch processor. Defaults to 512 */
  maxQueueSize?: number;
  /** Maximum export batch size. Defaults to 512 */
  maxExportBatchSize?: number;
  /** Schedule delay in milliseconds. Defaults to 5000 */
  scheduledDelayMillis?: number;
  /** Export timeout in milliseconds. Defaults to 5000 */
  exportTimeoutMillis?: number;
}

/**
 * Creates a BatchSpanProcessor with OTLP exporter and graceful degradation.
 *
 * The processor is configured with:
 * - Configurable queue limits to prevent memory issues
 * - Export timeouts to prevent blocking
 * - Error handling that drops data rather than failing requests
 *
 * @param config - Optional configuration
 * @returns Configured BatchSpanProcessor
 */
function createOtlpSpanProcessor(config: OtlpSdkConfig = {}): SpanProcessor {
  const exporter = createOtlpTraceExporter();

  return new BatchSpanProcessor(exporter, {
    maxQueueSize: config.maxQueueSize ?? 512,
    maxExportBatchSize: config.maxExportBatchSize ?? 512,
    scheduledDelayMillis: config.scheduledDelayMillis ?? 5000,
    // Default to 30 seconds to accommodate cloud endpoints like Grafana Cloud
    exportTimeoutMillis: config.exportTimeoutMillis ?? 30000,
  });
}

/**
 * Creates resource configuration from environment and config.
 */
function createResourceConfig(config: OtlpSdkConfig = {}): {
  serviceName: string;
  [key: string]: string;
} {
  const serviceName = config.serviceName ?? getServiceName("uploadista");
  const envAttributes = parseResourceAttributes();
  const configAttributes = config.resourceAttributes ?? {};

  return {
    serviceName,
    ...envAttributes,
    ...configAttributes,
  };
}

/**
 * Node.js OTLP SDK Layer for production use.
 *
 * Exports traces to an OTLP-compatible endpoint configured via environment variables:
 * - OTEL_EXPORTER_OTLP_ENDPOINT: Base endpoint (default: http://localhost:4318)
 * - OTEL_EXPORTER_OTLP_HEADERS: Authentication headers
 * - OTEL_SERVICE_NAME: Service name (default: uploadista)
 * - OTEL_RESOURCE_ATTRIBUTES: Additional resource attributes
 * - UPLOADISTA_OBSERVABILITY_ENABLED: Set to "false" to disable (default: true)
 *
 * @example
 * ```typescript
 * import { OtlpNodeSdkLive } from "@uploadista/observability";
 * import { Effect } from "effect";
 *
 * // With default environment configuration
 * const program = myEffect.pipe(Effect.provide(OtlpNodeSdkLive));
 *
 * // Run with:
 * // OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
 * // OTEL_SERVICE_NAME=my-upload-service
 * ```
 */
export const OtlpNodeSdkLive = NodeSdk.layer(() => {
  // Check if observability is disabled
  if (!isOtlpExportEnabled()) {
    // Return no-op configuration (no span processor means no export)
    return {
      resource: createResourceConfig(),
    };
  }

  return {
    resource: createResourceConfig(),
    spanProcessor: createOtlpSpanProcessor(),
  };
});

/**
 * Creates a customized OTLP Node.js SDK Layer.
 *
 * Use this when you need to customize the SDK configuration beyond
 * what environment variables provide.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer
 *
 * @example
 * ```typescript
 * const customSdk = createOtlpNodeSdkLayer({
 *   serviceName: "my-custom-service",
 *   resourceAttributes: {
 *     "tenant.id": "abc123",
 *     "deployment.environment": "production"
 *   },
 *   maxQueueSize: 1024,
 * });
 *
 * const program = myEffect.pipe(Effect.provide(customSdk));
 * ```
 */
export function createOtlpNodeSdkLayer(config: OtlpSdkConfig = {}) {
  return NodeSdk.layer(() => {
    if (!isOtlpExportEnabled()) {
      return {
        resource: createResourceConfig(config),
      };
    }

    return {
      resource: createResourceConfig(config),
      spanProcessor: createOtlpSpanProcessor(config),
    };
  });
}

/**
 * Browser OTLP SDK Layer for production use.
 *
 * Similar to OtlpNodeSdkLive but uses fetch API for browser compatibility.
 * Note: Browser environments may have CORS restrictions.
 *
 * @example
 * ```typescript
 * import { OtlpWebSdkLive } from "@uploadista/observability";
 *
 * const program = myEffect.pipe(Effect.provide(OtlpWebSdkLive));
 * ```
 */
export const OtlpWebSdkLive = WebSdk.layer(() => {
  if (!isOtlpExportEnabled()) {
    return {
      resource: createResourceConfig(),
    };
  }

  return {
    resource: createResourceConfig(),
    spanProcessor: createOtlpSpanProcessor(),
  };
});

/**
 * Creates a customized OTLP Web SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer for browser environments
 */
export function createOtlpWebSdkLayer(config: OtlpSdkConfig = {}) {
  return WebSdk.layer(() => {
    if (!isOtlpExportEnabled()) {
      return {
        resource: createResourceConfig(config),
      };
    }

    return {
      resource: createResourceConfig(config),
      spanProcessor: createOtlpSpanProcessor(config),
    };
  });
}

/**
 * Cloudflare Workers OTLP SDK Layer for production use.
 *
 * Uses the Web SDK under the hood with fetch-based export.
 * Suitable for edge computing environments.
 *
 * @example
 * ```typescript
 * import { OtlpWorkersSdkLive } from "@uploadista/observability";
 *
 * export default {
 *   async fetch(request, env) {
 *     const program = handleRequest(request).pipe(
 *       Effect.provide(OtlpWorkersSdkLive)
 *     );
 *     return Effect.runPromise(program);
 *   }
 * };
 * ```
 */
export const OtlpWorkersSdkLive = WebSdk.layer(() => {
  const config: OtlpSdkConfig = {
    serviceName: getServiceName("uploadista-workers"),
  };

  if (!isOtlpExportEnabled()) {
    return {
      resource: createResourceConfig(config),
    };
  }

  return {
    resource: createResourceConfig(config),
    spanProcessor: createOtlpSpanProcessor(config),
  };
});

/**
 * Creates a customized OTLP Workers SDK Layer.
 *
 * @param config - Custom configuration options
 * @returns Configured Effect Layer for Cloudflare Workers
 */
export function createOtlpWorkersSdkLayer(config: OtlpSdkConfig = {}) {
  return WebSdk.layer(() => {
    const effectiveConfig = {
      serviceName: getServiceName("uploadista-workers"),
      ...config,
    };

    if (!isOtlpExportEnabled()) {
      return {
        resource: createResourceConfig(effectiveConfig),
      };
    }

    return {
      resource: createResourceConfig(effectiveConfig),
      spanProcessor: createOtlpSpanProcessor(effectiveConfig),
    };
  });
}
