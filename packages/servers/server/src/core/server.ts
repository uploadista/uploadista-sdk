import type { PluginLayer, UploadistaError } from "@uploadista/core";
import {
  deadLetterQueueService,
  type Flow,
  FlowProvider,
  FlowWaitUntil,
  kvCircuitBreakerStoreLayer,
} from "@uploadista/core/flow";
import {
  createDataStoreLayer,
  deadLetterQueueKvStore,
  type UploadFileDataStores,
  type UploadFileKVStore,
} from "@uploadista/core/types";
import { GenerateIdLive } from "@uploadista/core/utils";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { NodeSdkLive, NoOpMetricsServiceLive } from "@uploadista/observability";
import { Effect, Layer, ManagedRuntime } from "effect";
import type { z } from "zod";
import type { StandardResponse } from "../adapter";
import { AuthCacheServiceLive } from "../cache";
import { handleFlowError } from "../http-utils";
import { createFlowEngineLayer, createUploadEngineLayer } from "../layer-utils";
import { AuthContextServiceLive } from "../service";
import type { AuthContext } from "../types";
import { UsageHookServiceLive } from "../usage-hooks/service";
import { handleUploadistaRequest } from "./http-handlers/http-handlers";
import type { ExtractFlowPluginRequirements } from "./plugin-types";
import type { NotFoundResponse } from "./routes";
import type { UploadistaServer, UploadistaServerConfig } from "./types";

/**
 * Creates the unified Uploadista server with framework-specific adapter.
 *
 * This is the single, unified API for creating an Uploadista server. It handles
 * all server initialization, layer composition, and runtime setup.
 *
 * ## Core Responsibilities
 *
 * The server handles:
 * - Layer composition (upload/flow servers, auth cache, metrics, plugins)
 * - Route parsing and matching
 * - Auth middleware execution with timeout protection
 * - Error handling and response formatting
 * - Effect program execution with optional tracing
 * - Plugin validation and dependency injection
 *
 * ## Plugin Validation
 *
 * The server supports two validation approaches:
 *
 * ### 1. Runtime Validation (Recommended for Most Cases)
 *
 * The server relies on Effect-TS's dependency injection to validate plugins
 * at runtime. If a required plugin is missing, Effect will fail with a clear
 * MissingService error.
 *
 * ```typescript
 * const server = await createUploadistaServer({
 *   flows: getFlowById,
 *   plugins: [sharpImagePlugin, zipPlugin],
 *   dataStore: s3DataStore,
 *   kvStore: redisKvStore,
 *   adapter: honoAdapter({ ... })
 * });
 * // If plugins don't match flow requirements, Effect fails with clear error
 * ```
 *
 * ### 2. Compile-Time Validation (Optional)
 *
 * For IDE feedback during development, use the ValidatePlugins type utility:
 *
 * ```typescript
 * import {
 *   createUploadistaServer,
 *   ValidatePlugins,
 *   ExtractFlowPluginRequirements
 * } from '@uploadista/server';
 *
 * // Extract requirements from flows
 * type Requirements = ExtractFlowPluginRequirements<typeof getFlowById>;
 *
 * // Define plugins
 * const plugins = [sharpImagePlugin, zipPlugin] as const;
 *
 * // Validate at compile time (optional, for IDE feedback)
 * type Validation = ValidatePlugins<typeof plugins, Requirements>;
 * // IDE shows error if plugins don't match requirements
 *
 * const server = await createUploadistaServer({
 *   flows: getFlowById,
 *   plugins,
 *   // ...
 * });
 * ```
 *
 * ### 3. Early Runtime Validation (Optional)
 *
 * For better error messages before server starts:
 *
 * ```typescript
 * import { validatePluginsOrThrow } from '@uploadista/server/core';
 *
 * validatePluginsOrThrow({
 *   plugins: [sharpImagePlugin],
 *   expectedServices: ['ImagePlugin', 'ZipPlugin']
 * });
 * // Throws with helpful error message including import suggestions
 * ```
 *
 * ## Type Safety
 *
 * - Plugin requirements are inferred from flow definitions
 * - Effect-TS ensures dependencies are satisfied at runtime
 * - Type casting is intentional (see inline docs for rationale)
 * - Optional compile-time validation available via type utilities
 *
 * @template TContext - Framework-specific context type
 * @template TResponse - Framework-specific response type
 * @template TWebSocketHandler - WebSocket handler type (if supported)
 * @template TFlows - Flow function type with plugin requirements
 * @template TPlugins - Tuple of plugin layers provided
 *
 * @param config - Server configuration including adapter and business logic
 * @returns Promise resolving to server instance with handler and metadata
 *
 * @example Basic Usage
 * ```typescript
 * import { createUploadistaServer, honoAdapter } from "@uploadista/server";
 * import { sharpImagePlugin } from "@uploadista/flow-images-sharp";
 *
 * const server = await createUploadistaServer({
 *   flows: getFlowById,
 *   plugins: [sharpImagePlugin],
 *   dataStore: { type: "s3", config: { bucket: "uploads" } },
 *   kvStore: redisKvStore,
 *   adapter: honoAdapter({
 *     authMiddleware: async (c) => ({ clientId: "user-123" })
 *   })
 * });
 *
 * // Use with Hono
 * app.all("/uploadista/*", server.handler);
 * ```
 *
 * @example With Compile-Time Validation
 * ```typescript
 * import {
 *   createUploadistaServer,
 *   ValidatePlugins,
 *   ExtractFlowPluginRequirements
 * } from "@uploadista/server";
 *
 * type Requirements = ExtractFlowPluginRequirements<typeof getFlowById>;
 * const plugins = [sharpImagePlugin, zipPlugin] as const;
 * type Validation = ValidatePlugins<typeof plugins, Requirements>;
 *
 * const server = await createUploadistaServer({
 *   flows: getFlowById,
 *   plugins,
 *   // ... rest of config
 * });
 * ```
 *
 * @see ValidatePlugins - Compile-time plugin validation
 * @see ExtractFlowPluginRequirements - Extract requirements from flows
 * @see validatePluginRequirements - Runtime validation helper
 * @see API_DECISION_GUIDE.md - Complete guide for choosing validation approach
 */
export const createUploadistaServer = async <
  TContext,
  TResponse,
  TWebSocketHandler = unknown,
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<
    // biome-ignore lint/suspicious/noExplicitAny: Flow requirements can be any plugin services
    Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, any>,
    UploadistaError,
    // biome-ignore lint/suspicious/noExplicitAny: Flow return type allows any requirements
    any
    // biome-ignore lint/suspicious/noExplicitAny: Generic type constraint allows any flow function type with any requirements
  > = any,
  TPlugins extends readonly PluginLayer[] = readonly PluginLayer[],
>({
  flows,
  dataStore,
  kvStore,
  // Default to an empty plugin list while preserving the generic type
  plugins = [] as unknown as TPlugins,
  eventEmitter,
  eventBroadcaster = memoryEventBroadcaster,
  withTracing = false,
  observabilityLayer,
  baseUrl: configBaseUrl = "uploadista",
  generateId = GenerateIdLive,
  metricsLayer,
  bufferedDataStore,
  adapter,
  authCacheConfig,
  circuitBreaker = true,
  deadLetterQueue = false,
  healthCheck,
  usageHooks,
}: UploadistaServerConfig<
  TContext,
  TResponse,
  TWebSocketHandler,
  TFlows,
  TPlugins
>): Promise<UploadistaServer<TContext, TResponse, TWebSocketHandler>> => {
  // Default eventEmitter to webSocketEventEmitter with the provided eventBroadcaster
  const finalEventEmitter =
    eventEmitter ?? webSocketEventEmitter(eventBroadcaster);

  // Normalize baseUrl (remove trailing slash)
  const baseUrl = configBaseUrl.endsWith("/")
    ? configBaseUrl.slice(0, -1)
    : configBaseUrl;

  type FlowReq = ExtractFlowPluginRequirements<TFlows>;

  // Create flow provider layer from flows function
  const flowProviderLayer = Layer.effect(
    FlowProvider,
    Effect.succeed({
      getFlow: (flowId: string, clientId: string | null) => {
        // Cast the flows function to match FlowProvider expectations
        // The context requirements will be provided at the layer level
        return flows(flowId, clientId) as Effect.Effect<
          Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, FlowReq>,
          UploadistaError
        >;
      },
    }),
  );

  // Validate that eventEmitter is provided (required for upload/flow servers)
  if (!finalEventEmitter) {
    throw new Error(
      "eventEmitter is required. Provide an event emitter layer in the configuration.",
    );
  }

  // Create data store layer
  const dataStoreLayer: Layer.Layer<
    UploadFileDataStores,
    never,
    UploadFileKVStore
  > = await createDataStoreLayer(dataStore);

  // Create upload server layer
  const uploadEngineLayer = createUploadEngineLayer({
    kvStore,
    eventEmitter: finalEventEmitter,
    dataStore: dataStoreLayer,
    bufferedDataStore,
    generateId,
  });

  // Create flow server layer
  const flowEngineLayer = createFlowEngineLayer({
    kvStore,
    eventEmitter: finalEventEmitter,
    flowProvider: flowProviderLayer,
    uploadEngine: uploadEngineLayer,
  });

  // Create auth cache layer (always present, even if auth is not enabled)
  const authCacheLayer = AuthCacheServiceLive(authCacheConfig);

  // Metrics layer (defaults to NoOp if not provided)
  const effectiveMetricsLayer = metricsLayer ?? NoOpMetricsServiceLive;

  // Create circuit breaker store layer if enabled (uses the provided kvStore)
  const circuitBreakerStoreLayer = circuitBreaker
    ? kvCircuitBreakerStoreLayer.pipe(Layer.provide(kvStore))
    : null;

  // Create dead letter queue layer if enabled (uses the provided kvStore)
  // The DLQ layer provides both the KV store wrapper and the service
  const dlqLayer = deadLetterQueue
    ? deadLetterQueueService.pipe(
        Layer.provide(deadLetterQueueKvStore),
        Layer.provide(kvStore),
      )
    : null;

  // Create usage hook layer (defaults to no-op if not configured)
  const usageHookLayer = UsageHookServiceLive(usageHooks);

  /**
   * Merge all server layers including plugins.
   *
   * This combines the core server infrastructure (upload server, flow server,
   * metrics, auth cache, circuit breaker, dead letter queue, usage hooks)
   * with user-provided plugin layers.
   */
  const serverLayerRaw = Layer.mergeAll(
    uploadEngineLayer,
    flowEngineLayer,
    effectiveMetricsLayer,
    authCacheLayer,
    usageHookLayer,
    ...plugins,
    ...(circuitBreakerStoreLayer ? [circuitBreakerStoreLayer] : []),
    ...(dlqLayer ? [dlqLayer] : []),
  );

  /**
   * Determine the tracing layer to use.
   * This must be included in the runtime layer (not per-request) so that the
   * BatchSpanProcessor can aggregate spans across requests and flush them properly.
   */
  const tracingLayer = withTracing ? (observabilityLayer ?? NodeSdkLive) : null;

  /**
   * Type Casting Rationale for Plugin System
   *
   * The type assertion below is intentional and safe. This is not a bug or workaround,
   * but follows Effect-TS's design for dynamic dependency injection.
   *
   * ## Why Type Casting is Necessary
   *
   * 1. **Plugin Requirements are Dynamic**
   *    Different flows require different plugins (ImagePlugin, ZipPlugin, etc.).
   *    These requirements are only known when flows are loaded at runtime.
   *    Flow A might need ImagePlugin, Flow B might need ZipPlugin.
   *
   * 2. **TypeScript's Static Limitation**
   *    TypeScript cannot statically verify that all possible flow combinations
   *    will have their requirements satisfied. The plugin array is typed as
   *    `readonly PluginLayer[]` which could be any combination of plugins.
   *
   * 3. **Effect-TS Runtime Resolution**
   *    Effect-TS is designed to resolve service requirements at runtime using
   *    its dependency injection system. When a flow executes and accesses a service:
   *
   *    ```typescript
   *    const imagePlugin = yield* ImagePlugin;
   *    ```
   *
   *    Effect checks if ImagePlugin exists in the provided layer context.
   *    If missing, Effect fails with a clear MissingService error.
   *
   * 4. **Layer Composition Guarantees**
   *    Layer.mergeAll() combines all layers. At runtime, Effect ensures that
   *    when a service is requested, it's either:
   *    - Provided by one of the merged layers, OR
   *    - Results in a MissingService error with the service name
   *
   * ## Safety Guarantees
   *
   * This pattern is safe because:
   *
   * 1. **Runtime Validation** (Optional but Recommended)
   *    We provide validatePluginRequirements() that checks plugins before
   *    server initialization, giving excellent error messages early.
   *
   * 2. **Effect's Built-in Validation**
   *    If runtime validation is skipped, Effect will fail during flow execution
   *    with a MissingService error containing the service identifier.
   *
   * 3. **Optional Compile-Time Validation**
   *    Developers can use ValidatePlugins<> type utility for IDE feedback:
   *
   *    ```typescript
   *    type Validation = ValidatePlugins<typeof plugins, Requirements>;
   *    // Shows compile error if plugins don't match requirements
   *    ```
   *
   * 4. **No Silent Failures**
   *    There's no scenario where missing plugins cause silent failures.
   *    Either runtime validation catches it, or Effect fails with clear error.
   *
   * ## This is Effect-TS's Idiomatic Pattern
   *
   * Effect-TS separates compile-time structure from runtime resolution:
   * - Compile-time: Types ensure layer structure is correct
   * - Runtime: Effect resolves actual dependencies and fails if missing
   *
   * The type system provides structure and IDE support, while Effect's
   * runtime handles actual requirement resolution.
   *
   * ## Further Reading
   *
   * - Effect-TS Context Management: https://effect.website/docs/guides/context-management
   * - Runtime Validation: See plugin-validation.ts for helper functions
   * - Type Utilities: See plugin-types.ts for compile-time validation
   *
   * @see validatePluginRequirements - Runtime validation helper
   * @see ValidatePlugins - Compile-time validation type utility
   */
  const serverLayerTyped = serverLayerRaw as unknown as Layer.Layer<
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic plugin requirements require any - see comprehensive explanation above
    any,
    never,
    never
  >;

  /**
   * Final server layer with optional tracing.
   * The tracing layer is merged at runtime level (not per-request) so that:
   * 1. The OpenTelemetry SDK is initialized once for the server
   * 2. The BatchSpanProcessor can aggregate spans across requests
   * 3. Spans are properly flushed when the runtime is disposed
   */
  const serverLayer = tracingLayer
    ? Layer.merge(serverLayerTyped, tracingLayer)
    : serverLayerTyped;

  // Create a shared managed runtime from the server layer
  // This ensures all requests use the same layer instances (including event broadcaster)
  // ManagedRuntime properly handles scoped resources and provides convenient run methods
  // When tracing is enabled, the OpenTelemetry SDK is part of this runtime and will be
  // properly shut down (flushing all pending spans) when dispose() is called

  const managedRuntime = ManagedRuntime.make(serverLayer);

  /**
   * Main request handler that processes HTTP requests through the adapter.
   * Delegates to adapter's httpHandler if provided, otherwise uses standard flow.
   */
  const handler = async <TRequirements>(ctx: TContext) => {
    // Fallback: Standard routing logic (for adapters without httpHandler)
    const program = Effect.gen(function* () {
      // Extract standard request from framework-specific request
      const uploadistaRequest = yield* adapter.extractRequest(ctx, { baseUrl });

      // Run auth middleware if provided
      let authContext: AuthContext | null = null;
      if (adapter.runAuthMiddleware) {
        const authMiddlewareWithTimeout = adapter.runAuthMiddleware(ctx).pipe(
          Effect.timeout("5 seconds"),
          Effect.catchAll(() => {
            // Timeout error
            console.error("Auth middleware timeout exceeded (5 seconds)");
            return Effect.succeed({
              _tag: "TimeoutError" as const,
            } as const);
          }),
          Effect.catchAllCause((cause) => {
            // Other errors
            console.error("Auth middleware error:", cause);
            return Effect.succeed({
              _tag: "AuthError" as const,
              error: cause,
            } as const);
          }),
        );

        const authResult:
          | AuthContext
          | null
          | { _tag: "TimeoutError" }
          | { _tag: "AuthError"; error: unknown } =
          yield* authMiddlewareWithTimeout;

        // Handle timeout
        if (
          authResult &&
          typeof authResult === "object" &&
          "_tag" in authResult &&
          authResult._tag === "TimeoutError"
        ) {
          const errorResponse: StandardResponse = {
            status: 503,
            headers: { "Content-Type": "application/json" },
            body: {
              error: "Authentication service unavailable",
              message:
                "Authentication took too long to respond. Please try again.",
            },
          };
          return yield* adapter.sendResponse(errorResponse, ctx);
        }

        // Handle auth error
        if (
          authResult &&
          typeof authResult === "object" &&
          "_tag" in authResult &&
          authResult._tag === "AuthError"
        ) {
          const errorResponse: StandardResponse = {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: {
              error: "Internal Server Error",
              message: "An error occurred during authentication",
            },
          };
          return yield* adapter.sendResponse(errorResponse, ctx);
        }

        // Handle authentication failure (null result)
        if (authResult === null) {
          const errorResponse: StandardResponse = {
            status: 401,
            headers: { "Content-Type": "application/json" },
            body: {
              error: "Unauthorized",
              message: "Invalid credentials",
            },
          };
          return yield* adapter.sendResponse(errorResponse, ctx);
        }

        authContext = authResult;
      }

      // Create auth context layer for this request
      // If no auth middleware is configured, bypass permission checks (backward compatibility)
      const authContextLayer = AuthContextServiceLive(authContext, {
        bypassAuth: !adapter.runAuthMiddleware,
      });

      // Extract waitUntil callback if available (for Cloudflare Workers)
      // This must be extracted per-request since it comes from the framework context
      // biome-ignore lint/suspicious/noExplicitAny: Layer array needs to accept any service type from waitUntil
      const waitUntilLayers: Layer.Layer<any, never, never>[] = [];
      if (adapter.extractWaitUntil) {
        const waitUntilCallback = adapter.extractWaitUntil(ctx);
        if (waitUntilCallback) {
          waitUntilLayers.push(Layer.succeed(FlowWaitUntil, waitUntilCallback));
        }
      }

      // Combine auth context, auth cache, metrics layers, usage hooks, plugins, circuit breaker, DLQ, and waitUntil
      // This ensures that flow nodes have access to all required services
      const baseRequestContextLayer = Layer.mergeAll(
        authContextLayer,
        authCacheLayer,
        effectiveMetricsLayer,
        usageHookLayer,
        ...plugins,
        ...waitUntilLayers,
      );
      const withCircuitBreakerContext = circuitBreakerStoreLayer
        ? Layer.merge(baseRequestContextLayer, circuitBreakerStoreLayer)
        : baseRequestContextLayer;
      const requestContextLayer = dlqLayer
        ? Layer.merge(withCircuitBreakerContext, dlqLayer)
        : withCircuitBreakerContext;

      // Check for baseUrl/api/ prefix
      if (uploadistaRequest.type === "not-found") {
        const notFoundResponse: NotFoundResponse = {
          type: "not-found",
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "Not found" },
        };
        return yield* adapter.sendResponse(notFoundResponse, ctx);
      }

      // Handle the request
      const response = yield* handleUploadistaRequest<TRequirements>(
        uploadistaRequest,
        { healthCheckConfig: healthCheck },
      ).pipe(Effect.provide(requestContextLayer));

      return yield* adapter.sendResponse(response, ctx);
    }).pipe(
      // Catch all errors and format them appropriately
      Effect.catchAll((error: unknown) => {
        const errorInfo = handleFlowError(error);
        const errorBody: Record<string, unknown> = {
          code: errorInfo.code,
          message: errorInfo.message,
        };
        if (errorInfo.details !== undefined) {
          errorBody.details = errorInfo.details;
        }
        const errorResponse: StandardResponse = {
          status: errorInfo.status,
          headers: { "Content-Type": "application/json" },
          body: errorBody,
        };
        return adapter.sendResponse(errorResponse, ctx);
      }),
    );

    // Use the shared managed runtime which includes all layers (including tracing if enabled)
    // Tracing is now part of the runtime layer, so spans are properly aggregated and flushed
    return managedRuntime.runPromise(program);
  };

  // Create WebSocket handler using the shared managed runtime
  const websocketHandler = await managedRuntime.runPromise(
    adapter.webSocketHandler({
      baseUrl,
    }),
  );

  return {
    handler,
    websocketHandler,
    baseUrl,
    dispose: () => managedRuntime.dispose(),
  };
};
