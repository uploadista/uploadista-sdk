import { NodeSdk, WebSdk } from "@effect/opentelemetry";
import { trace } from "@opentelemetry/api";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Context, Effect, Layer, Option, Tracer } from "effect";
import {
  createOtlpTraceExporter,
  getServiceName,
  isOtlpExportEnabled,
  parseResourceAttributes,
} from "./exporters.js";
import type { TraceContext } from "./types.js";

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

// ============================================================================
// Distributed Tracing Context Utilities
// ============================================================================

/**
 * @deprecated Use `captureTraceContextEffect` instead. This synchronous function
 * uses OpenTelemetry's `trace.getActiveSpan()` which may not be synchronized
 * with Effect's span context when using @effect/opentelemetry.
 *
 * @returns TraceContext if there's an active OpenTelemetry span, undefined otherwise
 */
export function captureTraceContext(): TraceContext | undefined {
  const currentSpan = trace.getActiveSpan();
  if (!currentSpan) {
    return undefined;
  }

  const spanContext = currentSpan.spanContext();
  return {
    traceId: spanContext.traceId,
    spanId: spanContext.spanId,
    traceFlags: spanContext.traceFlags,
  };
}

/**
 * Captures the current Effect trace context for distributed tracing.
 *
 * Uses Effect's `currentSpan` to get the active span, which is more reliable
 * than OpenTelemetry's `trace.getActiveSpan()` when using @effect/opentelemetry
 * because Effect manages its own span context that may not be synchronized
 * with OpenTelemetry's global context.
 *
 * Use this to save the trace context (traceId, spanId, traceFlags) for later
 * use in distributed tracing. The captured context can be stored alongside
 * data (e.g., in KV store with upload metadata) and restored later using
 * `createExternalSpan` and passing it to `Effect.withSpan`'s `parent` option.
 *
 * @returns Effect yielding TraceContext if there's an active span, undefined otherwise
 *
 * @example
 * ```typescript
 * // Capture context during upload creation
 * const createUpload = Effect.gen(function* () {
 *   const traceContext = yield* captureTraceContextEffect;
 *
 *   const file: UploadFile = {
 *     id: uploadId,
 *     traceContext, // Store for later
 *     // ...
 *   };
 *   yield* kvStore.set(uploadId, file);
 * }).pipe(Effect.withSpan("upload-create", { ... }));
 * ```
 */
export const captureTraceContextEffect: Effect.Effect<
  TraceContext | undefined
> = Effect.gen(function* () {
  const spanOption = yield* Effect.currentSpan.pipe(Effect.option);
  return Option.match(spanOption, {
    onNone: () => undefined,
    onSome: (span) => ({
      traceId: span.traceId,
      spanId: span.spanId,
      traceFlags: span.sampled ? 1 : 0,
    }),
  });
});

/**
 * Creates an ExternalSpan from a stored trace context.
 *
 * Use this to create a parent span reference that can be passed to
 * `Effect.withSpan`'s `parent` option for distributed tracing.
 *
 * **Important:** The parent must be passed directly to `Effect.withSpan`'s
 * options, not provided as a service afterward.
 *
 * @param traceContext - Previously captured trace context
 * @returns ExternalSpan that can be used as a parent in Effect.withSpan
 *
 * @example
 * ```typescript
 * // Create parent span from stored trace context
 * const parentSpan = file.traceContext
 *   ? createExternalSpan(file.traceContext)
 *   : undefined;
 *
 * // Pass parent directly to withSpan
 * const chunkEffect = Effect.gen(function* () {
 *   // ... chunk upload logic
 * }).pipe(
 *   Effect.withSpan("upload-chunk", {
 *     attributes: { ... },
 *     parent: parentSpan,  // Link to original trace
 *   })
 * );
 * ```
 */
export function createExternalSpan(traceContext: TraceContext) {
  return Tracer.externalSpan({
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    sampled: traceContext.traceFlags === 1,
  });
}

/**
 * @deprecated Use `createExternalSpan` instead and pass the result to
 * `Effect.withSpan`'s `parent` option directly. This function doesn't
 * work correctly because Effect.withSpan reads the parent at construction
 * time, not from the provided service.
 *
 * @example
 * ```typescript
 * // Instead of:
 * withParentContext(traceContext)(effect.pipe(Effect.withSpan(...)))
 *
 * // Do this:
 * const parent = createExternalSpan(traceContext);
 * effect.pipe(Effect.withSpan("name", { parent }))
 * ```
 */
export function withParentContext(traceContext: TraceContext) {
  return <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
    const externalSpan = Tracer.externalSpan({
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      sampled: traceContext.traceFlags === 1,
    });

    return effect.pipe(
      Effect.provideService(Tracer.ParentSpan, externalSpan),
    );
  };
}

/**
 * Checks if there's an active trace context.
 *
 * Useful for conditional logic based on whether tracing is active.
 *
 * @returns true if there's an active span with valid trace context
 *
 * @example
 * ```typescript
 * if (hasActiveTraceContext()) {
 *   console.log("Tracing is active");
 * }
 * ```
 */
export function hasActiveTraceContext(): boolean {
  const span = trace.getActiveSpan();
  if (!span) return false;

  const ctx = span.spanContext();
  // Check if the trace ID is valid (not all zeros)
  return ctx.traceId !== "00000000000000000000000000000000";
}
