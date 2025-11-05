import type { PluginLayer, UploadistaError } from "@uploadista/core";
import { type Flow, FlowProvider, FlowWaitUntil } from "@uploadista/core/flow";
import {
  createDataStoreLayer,
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
import { createFlowServerLayer, createUploadServerLayer } from "../layer-utils";
import type { FlowRequirementsOf } from "../plugins-typing";
import { AuthContextServiceLive } from "../service";
import type { AuthContext } from "../types";
import { handleUploadistaRequest } from "./http-handlers/http-handlers";
import type { NotFoundResponse } from "./routes";
import type { UploadistaServer, UploadistaServerConfig } from "./types";

/**
 * Creates the unified Uploadista server with framework-specific adapter.
 *
 * This function composes all layers (upload server, flow server, auth, metrics)
 * and returns a handler that works with any framework via the provided adapter.
 *
 * The core server handles:
 * - Route parsing and matching
 * - Auth middleware execution with timeout protection
 * - Layer composition (upload/flow servers, auth cache, metrics)
 * - Error handling and response formatting
 * - Effect program execution with optional tracing
 *
 * @param config - Server configuration including adapter and business logic
 * @returns Object with handler function, optional WebSocket handler, and base URL
 *
 * @example
 * ```typescript
 * import { createUploadistaServer, honoAdapter } from "@uploadista/server";
 *
 * const server = await createUploadistaServer({
 *   flows: getFlowById,
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
  baseUrl: configBaseUrl = "uploadista",
  generateId = GenerateIdLive,
  metricsLayer,
  bufferedDataStore,
  adapter,
  authCacheConfig,
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

  type FlowReq = FlowRequirementsOf<TFlows>;

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
  const uploadServerLayer = createUploadServerLayer({
    kvStore,
    eventEmitter: finalEventEmitter,
    dataStore: dataStoreLayer,
    bufferedDataStore,
    generateId,
  });

  // Create flow server layer
  const flowServerLayer = createFlowServerLayer({
    kvStore,
    eventEmitter: finalEventEmitter,
    flowProvider: flowProviderLayer,
    uploadServer: uploadServerLayer,
  });

  // Create auth cache layer (always present, even if auth is not enabled)
  const authCacheLayer = AuthCacheServiceLive(authCacheConfig);

  // Metrics layer (defaults to NoOp if not provided)
  const effectiveMetricsLayer = metricsLayer ?? NoOpMetricsServiceLive;

  // Merge all server layers including plugins
  // Plugins may have requirements that are provided at runtime or by other plugins
  const serverLayerRaw = Layer.mergeAll(
    uploadServerLayer,
    flowServerLayer,
    effectiveMetricsLayer,
    authCacheLayer,
    ...plugins,
  );

  // Type assertion to handle plugin requirements
  // Plugins are typed with 'any' requirements to allow flexibility
  // The actual requirements will be satisfied at the layer composition level

  const serverLayer = serverLayerRaw as unknown as Layer.Layer<
    // biome-ignore lint/suspicious/noExplicitAny: Necessary to bridge Effect's strict typing with dynamic plugin system
    any,
    never,
    never
  >;

  // Create a shared managed runtime from the server layer
  // This ensures all requests use the same layer instances (including event broadcaster)
  // ManagedRuntime properly handles scoped resources and provides convenient run methods

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
      const authContextLayer = AuthContextServiceLive(authContext);

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

      // Combine auth context, auth cache, metrics layers, plugins, and waitUntil
      // This ensures that flow nodes have access to all required services
      const requestContextLayer = Layer.mergeAll(
        authContextLayer,
        authCacheLayer,
        effectiveMetricsLayer,
        ...plugins,
        ...waitUntilLayers,
      );

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

    // Use the shared managed runtime instead of creating a new one per request
    if (withTracing) {
      return managedRuntime.runPromise(
        program.pipe(Effect.provide(NodeSdkLive)),
      );
    }
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
