import {
  FlowServer,
  type UploadistaError,
  UploadServer,
} from "@uploadista/core";
import { type Flow, FlowProvider } from "@uploadista/core/flow";
import {
  createDataStoreLayer,
  type UploadFileDataStores,
  type UploadFileKVStore,
} from "@uploadista/core/types";
import { GenerateIdLive } from "@uploadista/core/utils";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { NodeSdkLive, NoOpMetricsServiceLive } from "@uploadista/observability";
import { Effect, Layer } from "effect";
import type { z } from "zod";
import type { StandardResponse, WebSocketHandler } from "../adapter";
import { AuthCacheServiceLive } from "../cache";
import { handleFlowError } from "../http-utils";
import { createFlowServerLayer, createUploadServerLayer } from "../layer-utils";
import { AuthContextServiceLive } from "../service";
import type { AuthContext } from "../types";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
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
  TRequest,
  TResponse,
  TWebSocket = unknown,
>(
  {
    flows,
    dataStore,
    kvStore,
    plugins = [],
    eventEmitter,
    eventBroadcaster = memoryEventBroadcaster,
    withTracing = false,
    baseUrl: configBaseUrl = "uploadista",
    generateId = GenerateIdLive,
    metricsLayer,
    bufferedDataStore,
    adapter,
    authCacheConfig,
  }: UploadistaServerConfig<TRequest, TResponse, TWebSocket>,
): Promise<UploadistaServer<TRequest, TResponse, TWebSocket>> => {
  

  // Default eventEmitter to webSocketEventEmitter with the provided eventBroadcaster
  const finalEventEmitter =
    eventEmitter ?? webSocketEventEmitter(eventBroadcaster);

  // Normalize baseUrl (remove trailing slash)
  const baseUrl = configBaseUrl.endsWith("/")
    ? configBaseUrl.slice(0, -1)
    : configBaseUrl;

  // Create flow provider layer from flows function
  const flowProviderLayer = Layer.effect(
    FlowProvider,
    Effect.succeed({
      getFlow: (flowId: string, clientId: string | null) => {
        // Cast the flows function to match FlowProvider expectations
        // The context requirements will be provided at the layer level
        return flows(flowId, clientId) as Effect.Effect<
          Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, unknown>,
          UploadistaError,
          never
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

  const serverLayer = Layer.mergeAll(
    uploadServerLayer,
    flowServerLayer,
    effectiveMetricsLayer,
    authCacheLayer,
    ...plugins,
  );

  /**
   * Main request handler that processes HTTP requests through the adapter.
   * Delegates to adapter's httpHandler if provided, otherwise uses standard flow.
   */
  const handler = async <TRequirements>(req: TRequest) => {
    

    // Fallback: Standard routing logic (for adapters without httpHandler)
    const program = Effect.gen(function* () {
      // Extract standard request from framework-specific request
      const uploadistaRequest = yield* adapter.extractRequest(req, { baseUrl });

      // Run auth middleware if provided
      let authContext: AuthContext | null = null;
      if (adapter.runAuthMiddleware) {
        const authMiddlewareWithTimeout = adapter
          .runAuthMiddleware(req)
          .pipe(
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
          return yield* adapter.sendResponse( errorResponse as any);
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
          return yield* adapter.sendResponse(errorResponse as any);
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
          return yield* adapter.sendResponse(errorResponse as any);
        }

        authContext = authResult;
      }

      // Create auth context layer for this request
      const authContextLayer = AuthContextServiceLive(authContext);

      // Combine auth context, auth cache, metrics layers, and plugins
      // This ensures that flow nodes have access to plugin services
      const authLayer = Layer.mergeAll(
        authContextLayer,
        authCacheLayer,
        effectiveMetricsLayer,
        ...plugins,
      );

      // Check for baseUrl/api/ prefix
      if (uploadistaRequest.type === "not-found") {
        const notFoundResponse: NotFoundResponse = {
          type: "not-found",
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: { error: "Not found" },
        };
        return yield* adapter.sendResponse( notFoundResponse);
      }

      // Handle the request
      const response = yield* handleUploadistaRequest<TRequirements>(
        uploadistaRequest,
      ).pipe(Effect.provide(authLayer));


      return yield* adapter.sendResponse( response);
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
        return adapter.sendResponse( errorResponse as any);
      }),
    );

    // Check the type of the program
    const runnableProgram = program.pipe(
      Effect.provide(serverLayer),
    ) as Effect.Effect<TResponse, never, never>;

    if (withTracing) {
      return Effect.runPromise(
        runnableProgram.pipe(Effect.provide(NodeSdkLive)),
      );
    }
    return Effect.runPromise(runnableProgram);
  };

  // Create WebSocket handler
  const websocketHandler = await Effect.runPromise(
    adapter.webSocketHandler({
        baseUrl,
      })
    .pipe(Effect.provide(serverLayer)),
  )

  return {
    handler,
    websocketHandler,
    baseUrl,
  };
};
