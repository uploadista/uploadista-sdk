import { NodeSdk, WebSdk } from "@effect/opentelemetry";
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { Context, Effect, Layer } from "effect";

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
