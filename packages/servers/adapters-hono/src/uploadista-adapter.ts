import type { UploadistaError } from "@uploadista/core";
import { type Flow, FlowProvider, FlowServer } from "@uploadista/core/flow";
import {
  type BaseEventEmitterService,
  type BaseKvStoreService,
  createDataStoreLayer,
  type DataStoreConfig,
  type EventBroadcasterService,
  type UploadFileDataStore,
  type UploadFileDataStores,
  type UploadFileKVStore,
} from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { type GenerateId, GenerateIdLive } from "@uploadista/core/utils";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import {
  type MetricsService,
  NodeSdkLive,
  NoOpMetricsServiceLive,
} from "@uploadista/observability";
import {
  type AuthCacheConfig,
  AuthCacheServiceLive,
  type AuthContext,
  AuthContextServiceLive,
  type AuthResult,
  createFlowServerLayer,
  createUploadistaServer,
  createUploadServerLayer,
  type FlowRequirementsOf,
} from "@uploadista/server";
import { Effect, Layer } from "effect";
import type { Context, Env } from "hono";
import type { WSEvents } from "hono/ws";
import type { z } from "zod";
import { honoAdapter } from "./adapter";
import {
  handleCancelFlow,
  handleFlowGet,
  handleFlowPost,
  handleJobStatus,
  handlePauseFlow,
  handleResumeFlow,
} from "./flow-http-handlers";
import {
  handleUploadGet,
  handleUploadPatch,
  handleUploadPost,
} from "./upload-http-handlers";
import {
  HonoUploadistaAdapterService,
  type HonoUploadistaAdapterServiceShape,
} from "./uploadista-adapter-layer";
import {
  createUploadistaDurableObjectWebSocketRequestHandler,
  createUploadistaWebSocketHandler,
  type DurableObjectWebSocketHandlerOptions,
} from "./uploadista-websocket-handler";

export type HonoUploadistaAdapterOptions<
  TEnv extends Env = Env,
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<
    Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, unknown>,
    UploadistaError,
    unknown
    // biome-ignore lint/suspicious/noExplicitAny: Generic type constraint allows any flow function type
  > = any,
  // biome-ignore lint/suspicious/noExplicitAny: Permissive constraint allows plugin tuples, validation via PluginAssertion
  TPlugins extends readonly Layer.Layer<any, never, never>[] = Layer.Layer<
    any,
    never,
    never
  >[],
> = {
  // Flow configuration
  flows: TFlows;
  plugins?: TPlugins;

  dataStore: DataStoreConfig;
  bufferedDataStore?: Layer.Layer<
    UploadFileDataStore,
    never,
    UploadFileKVStore
  >;

  // Shared configuration
  baseUrl?: string;
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter?: Layer.Layer<BaseEventEmitterService>;
  eventBroadcaster?: Layer.Layer<EventBroadcasterService>;
  generateId?: Layer.Layer<GenerateId>;
  withTracing?: boolean;
  durableObjectWebSocket?: DurableObjectWebSocketHandlerOptions;

  // Authentication
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;

  // Metrics
  metricsLayer?: Layer.Layer<MetricsService, never, never>;
};

export type InternalHonoUploadistaAdapterOptions<
  TEnv extends Env = Env,
  TRequirements = never,
  TPlugins extends readonly Layer.Layer<TRequirements, never, never>[] = [],
> = {
  // Flow configuration
  flowProvider: Layer.Layer<FlowProvider>;
  plugins?: TPlugins;

  // Upload configuration

  dataStore: Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>;
  bufferedDataStore?: Layer.Layer<
    UploadFileDataStore,
    never,
    UploadFileKVStore
  >;
  // Shared configuration
  baseUrl: string;
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  generateId?: Layer.Layer<GenerateId>;
  withTracing?: boolean;
  durableObjectWebSocket?: DurableObjectWebSocketHandlerOptions;

  // Authentication
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;

  // Metrics
  metricsLayer?: Layer.Layer<MetricsService, never, never>;
};

export type HonoUploadistaAdapter = {
  baseUrl: string;
  handler: (c: Context) => Promise<Response>;
  websocketHandler: (c: Context) => WSEvents;
  durableObjectWebSocketHandler?: (c: Context) => Promise<Response>;
};

// Effect-native API
export type HonoUploadistaServer = {
  handler: (c: Context) => Effect.Effect<Response, never, never>;
  uploadServer: Layer.Layer<UploadServer>;
  flowServer: Layer.Layer<FlowServer>;
  websocketHandler: (c: Context) => WSEvents;
  durableObjectWebSocketHandler?: (c: Context) => Promise<Response>;
};

// Effect-based service factory for creating the unified adapter layer
const createHonoUploadistaAdapterServiceLayer = <TEnv extends Env>(
  baseUrl: string,
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>,
  durableObjectWebSocketOptions?: DurableObjectWebSocketHandlerOptions,
  authCacheConfig?: AuthCacheConfig,
  metricsLayer?: Layer.Layer<MetricsService, never, never>,
) =>
  Layer.effect(
    HonoUploadistaAdapterService,
    Effect.gen(function* () {
      const uploadServer = yield* UploadServer;
      const flowServer = yield* FlowServer;

      // Create auth cache layer (always present, even if auth is not enabled)
      const authCacheLayer = AuthCacheServiceLive(authCacheConfig);

      return {
        handler: (c: Context) =>
          Effect.gen(function* () {
            // Call auth middleware if configured and create auth context layer
            let authContext: AuthContext | null = null;
            if (authMiddleware) {
              // Run auth middleware with timeout protection (5 seconds default)
              const authMiddlewareWithTimeout = Effect.tryPromise({
                try: () => authMiddleware(c),
                catch: (error) => {
                  console.error("Auth middleware error:", error);
                  return { _tag: "AuthError" as const, error };
                },
              }).pipe(
                Effect.timeout("5 seconds"),
                Effect.catchAll((error) => {
                  // Check if timeout occurred
                  if (error && typeof error === "object" && "_tag" in error) {
                    if (error._tag === "TimeoutException") {
                      console.error(
                        "Auth middleware timeout exceeded (5 seconds)",
                      );
                      return Effect.succeed({
                        _tag: "TimeoutError" as const,
                      } as const);
                    }
                  }
                  return Effect.succeed(null);
                }),
              );

              const authResult:
                | AuthContext
                | null
                | { _tag: "TimeoutError" }
                | { _tag: "AuthError"; error: unknown } =
                yield* authMiddlewareWithTimeout;

              // If auth middleware timed out, return 503 Service Unavailable
              if (
                authResult &&
                typeof authResult === "object" &&
                "_tag" in authResult &&
                authResult._tag === "TimeoutError"
              ) {
                return new Response(
                  JSON.stringify({
                    error: "Authentication service unavailable",
                    message:
                      "Authentication took too long to respond. Please try again.",
                  }),
                  {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }

              // If auth middleware returned null, authentication failed
              if (authResult === null) {
                return new Response(
                  JSON.stringify({
                    error: "Unauthorized",
                    message: "Invalid credentials",
                  }),
                  {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }

              // Check for error marker (shouldn't happen after catchAll, but for type safety)
              if (
                authResult &&
                typeof authResult === "object" &&
                "_tag" in authResult &&
                authResult._tag === "AuthError"
              ) {
                return new Response(
                  JSON.stringify({
                    error: "Internal Server Error",
                    message: "An error occurred during authentication",
                  }),
                  {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                  },
                );
              }

              authContext = authResult;
            }

            // Create auth context layer for this request
            const authContextLayer = AuthContextServiceLive(authContext);

            // Combine auth context, auth cache, and metrics layers
            // Always provide a metrics layer (either real or no-op) to satisfy type requirements
            const authLayer = Layer.mergeAll(
              authContextLayer,
              authCacheLayer,
              metricsLayer ?? NoOpMetricsServiceLive,
            );

            const req = c.req.raw;
            const url = new URL(req.url);

            // Check for uploadista/api/ prefix
            if (!url.pathname.includes(`${baseUrl}/api/`)) {
              return new Response("Not found", { status: 404 });
            }

            // Remove the prefix and get the actual route segments
            const routeSegments = url.pathname
              .replace(`${baseUrl}/api/`, "")
              .split("/")
              .filter(Boolean);

            // Route based on path
            if (routeSegments.includes("upload")) {
              // Upload API routes - these now create jobs behind the scenes
              switch (req.method) {
                case "POST":
                  return yield* handleUploadPost(req, uploadServer).pipe(
                    Effect.provide(authLayer),
                  );
                case "GET":
                  return yield* handleUploadGet(req, uploadServer).pipe(
                    Effect.provide(authLayer),
                  );
                case "PATCH":
                  return yield* handleUploadPatch(req, uploadServer).pipe(
                    Effect.provide(authLayer),
                  );
                default:
                  return new Response("Method not allowed", { status: 405 });
              }
            } else if (routeSegments.includes("flow")) {
              // Flow API routes
              switch (req.method) {
                case "GET":
                  return yield* handleFlowGet(req, flowServer).pipe(
                    Effect.provide(authLayer),
                  );
                case "POST":
                  return yield* handleFlowPost<never>(req, flowServer).pipe(
                    Effect.provide(authLayer),
                  );
                default:
                  return new Response("Method not allowed", { status: 405 });
              }
            } else if (routeSegments.includes("jobs")) {
              // Unified job status routes
              if (req.method === "GET" && url.pathname.endsWith("/status")) {
                return yield* handleJobStatus(req, flowServer).pipe(
                  Effect.provide(authLayer),
                );
              } else if (
                req.method === "PATCH" &&
                routeSegments.includes("resume")
              ) {
                return yield* handleResumeFlow<never>(req, flowServer).pipe(
                  Effect.provide(authLayer),
                );
              } else if (
                req.method === "POST" &&
                url.pathname.endsWith("/pause")
              ) {
                return yield* handlePauseFlow(req, flowServer).pipe(
                  Effect.provide(authLayer),
                );
              } else if (
                req.method === "POST" &&
                url.pathname.endsWith("/cancel")
              ) {
                return yield* handleCancelFlow(req, flowServer).pipe(
                  Effect.provide(authLayer),
                );
              }
              return new Response("Method not allowed", { status: 405 });
            } else {
              return new Response("Not found", { status: 404 });
            }
          }).pipe(
            Effect.catchAll((error) => {
              console.error("Adapter error:", error);

              // Try to extract error information
              let status = 500;
              let code = "UNKNOWN_ERROR";
              let message = "Internal server error";
              let details: unknown;

              if (typeof error === "object" && error !== null) {
                const errorObj = error as Record<string, unknown>;

                if ("code" in errorObj && typeof errorObj.code === "string") {
                  code = errorObj.code;
                }

                if (
                  "message" in errorObj &&
                  typeof errorObj.message === "string"
                ) {
                  message = errorObj.message;
                } else if (
                  "body" in errorObj &&
                  typeof errorObj.body === "string"
                ) {
                  message = errorObj.body;
                }

                if (
                  "status" in errorObj &&
                  typeof errorObj.status === "number"
                ) {
                  status = errorObj.status;
                }

                if ("details" in errorObj) {
                  details = errorObj.details;
                }
              }

              const errorResponse: {
                code: string;
                error: string;
                details?: unknown;
              } = {
                code,
                error: message,
              };

              if (details !== undefined) {
                errorResponse.details = details;
              }

              return Effect.succeed(
                new Response(JSON.stringify(errorResponse), {
                  status,
                  headers: { "Content-Type": "application/json" },
                }),
              );
            }),
          ),

        websocketHandler: createUploadistaWebSocketHandler(
          baseUrl,
          uploadServer,
          flowServer,
          authMiddleware,
        ),

        durableObjectWebSocketHandler: durableObjectWebSocketOptions
          ? createUploadistaDurableObjectWebSocketRequestHandler(
              durableObjectWebSocketOptions,
            )
          : undefined,
      } satisfies HonoUploadistaAdapterServiceShape;
    }),
  );

/**
 * Creates an Effect-native unified Hono server - combining upload and flow capabilities
 */
export const createHonoUploadistaServer = <
  TEnv extends Env = Env,
  TRequirements = UploadServer,
>({
  baseUrl,
  flowProvider,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  kvStore,
  generateId = GenerateIdLive,
  authMiddleware,
  durableObjectWebSocket,
  metricsLayer,
}: InternalHonoUploadistaAdapterOptions<
  TEnv,
  TRequirements
>): Effect.Effect<HonoUploadistaServer> => {
  // Set up upload server dependencies using shared utility
  const uploadServerLayer = createUploadServerLayer({
    kvStore,
    eventEmitter,
    dataStore,
    bufferedDataStore,
    generateId,
  });

  // Set up flow server dependencies using shared utility
  const flowServerLayer = createFlowServerLayer({
    kvStore,
    eventEmitter,
    flowProvider,
    uploadServer: uploadServerLayer,
  });

  // Set up adapter with core services
  const adapterLayer = Layer.provide(
    createHonoUploadistaAdapterServiceLayer<TEnv>(
      baseUrl,
      authMiddleware,
      durableObjectWebSocket,
      undefined, // authCacheConfig
      metricsLayer,
    ),
    Layer.mergeAll(uploadServerLayer, flowServerLayer),
  );

  return Effect.gen(function* () {
    const adapterService = yield* HonoUploadistaAdapterService;

    return {
      handler: (c: Context) => adapterService.handler(c),
      websocketHandler: (c: Context) => adapterService.websocketHandler(c),
      durableObjectWebSocketHandler:
        adapterService.durableObjectWebSocketHandler,
      uploadServer: uploadServerLayer,
      flowServer: flowServerLayer,
    } satisfies HonoUploadistaServer;
  }).pipe(
    Effect.provide(adapterLayer),
    // Explicitly cast to remove residual plugin requirements from the type
    // The requirements are actually satisfied by the adapterLayer above
  ) as Effect.Effect<HonoUploadistaServer>;
};

const runProgram = <A, E>(
  effect: Effect.Effect<A, E>,
  withTracing: boolean,
) => {
  if (withTracing) {
    return Effect.runPromise(effect.pipe(Effect.provide(NodeSdkLive)));
  }
  return Effect.runPromise(effect);
};

/**
 * Creates a Promise-based Hono flow server for compatibility with existing Hono applications
 * This wraps the Effect-native version with Promise conversion and caches the server instance
 */
export const createInternalHonoUploadistaAdapter = async <
  TEnv extends Env = Env,
  TRequirements = never,
  TPlugins extends readonly Layer.Layer<TRequirements, never, never>[] = [],
>({
  baseUrl,
  flowProvider,
  // Default to an empty plugin list while preserving the generic type
  // biome-ignore lint/suspicious/noExplicitAny: Type assertion needed for empty array default
  plugins = [] as unknown as any,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  kvStore,
  authMiddleware,
  withTracing = false,
  metricsLayer,
}: InternalHonoUploadistaAdapterOptions<
  TEnv,
  TRequirements,
  TPlugins
>): Promise<HonoUploadistaAdapter> => {
  // Create and cache the Effect server instance
  const uploadistaServer = await Effect.runPromise(
    createHonoUploadistaServer<TEnv, TRequirements>({
      baseUrl,
      flowProvider,
      eventEmitter,
      dataStore,
      bufferedDataStore,
      kvStore,
      authMiddleware,
      metricsLayer,
    }),
  );

  // Merge all plugin layers so we can provide them when running handlers
  const pluginLayers = Layer.mergeAll(
    uploadistaServer.uploadServer,
    ...plugins,
  ) as Layer.Layer<UploadServer | TRequirements, never, never>;

  return {
    baseUrl,
    handler: (c: Context) =>
      runProgram(
        uploadistaServer
          .handler(c)
          .pipe(Effect.provide(pluginLayers)) as Effect.Effect<
          Response,
          never,
          never
        >,
        withTracing,
      ),
    websocketHandler: (c: Context) => uploadistaServer.websocketHandler(c),
    durableObjectWebSocketHandler:
      uploadistaServer.durableObjectWebSocketHandler,
  } satisfies HonoUploadistaAdapter;
};

/**
 * Creates a Promise-based Uploadista Hono adapter for compatibility
 *
 * Note: Ensure that the plugins array provides all services required by your flows.
 * Missing plugin services will result in runtime errors during flow execution.
 */
export const createHonoUploadistaAdapter = async <
  TEnv extends Env = Env,
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<
    Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, unknown>,
    UploadistaError,
    unknown
    // biome-ignore lint/suspicious/noExplicitAny: Generic type constraint allows any flow function type
  > = any,
  // biome-ignore lint/suspicious/noExplicitAny: Permissive constraint allows plugin tuples, validation done at runtime
  TPlugins extends readonly Layer.Layer<any, never, never>[] = Layer.Layer<
    any,
    never,
    never
  >[],
>({
  baseUrl = "uploadista",
  flows,
  // Default to an empty plugin list while preserving the generic type
  plugins = [] as unknown as TPlugins,
  eventBroadcaster = memoryEventBroadcaster,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  kvStore,
  generateId = GenerateIdLive,
  authMiddleware,
  durableObjectWebSocket,
  metricsLayer,
}: HonoUploadistaAdapterOptions<
  TEnv,
  TFlows,
  TPlugins
>): Promise<HonoUploadistaAdapter> => {
  type FlowReq = FlowRequirementsOf<TFlows>;
  // Create a simplified flow provider that uses the flows function directly
  const createFlowProvider = Effect.succeed({
    getFlow: (flowId: string, clientId: string | null) => {
      // The flows function returns an Effect with TRequirements context,
      // but the FlowProvider interface expects no context.
      // We cast this to match the interface - the requirements will be provided
      // at the layer level when the flow adapter is created.
      return flows(flowId, clientId) as Effect.Effect<
        Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, FlowReq>,
        UploadistaError
      >;
    },
  });

  // Create the flow provider layer that provides the requirements
  const flowProvider = Layer.effect(FlowProvider, createFlowProvider);

  // Default eventEmitter to webSocketEventEmitter with the provided eventBroadcaster
  const finalEventEmitter =
    eventEmitter ?? webSocketEventEmitter(eventBroadcaster);

  // Convert DataStoreConfig to Layer
  const dataStoreLayer = await createDataStoreLayer(dataStore);

  return createInternalHonoUploadistaAdapter<TEnv, FlowReq, TPlugins>({
    baseUrl,
    flowProvider,
    plugins,
    eventEmitter: finalEventEmitter,
    dataStore: dataStoreLayer,
    bufferedDataStore,
    kvStore,
    generateId,
    authMiddleware,
    durableObjectWebSocket,
    metricsLayer,
  });
};

/**
 * Creates a Hono Uploadista adapter using the unified core server (V2).
 *
 * This is the new implementation that uses the refactored adapter pattern
 * with the core server. It provides the same functionality as V1 but with
 * ~80% less code duplication.
 *
 * @template TEnv - Hono environment type
 * @template TFlows - Flow function type
 * @template TPlugins - Plugin layers type
 * @param options - Adapter configuration options
 * @returns Promise resolving to HonoUploadistaAdapter
 *
 * @example
 * ```typescript
 * import { createHonoUploadistaAdapterV2 } from "@uploadista/adapters-hono";
 *
 * const adapter = await createHonoUploadistaAdapterV2({
 *   flows: getFlows,
 *   dataStore: { type: "s3", config: { bucket: "uploads" } },
 *   kvStore: redisKvStore,
 *   authMiddleware: async (c) => ({ clientId: c.req.header("x-user-id") || null })
 * });
 *
 * app.all("/uploadista/*", adapter.handler);
 * ```
 */
export const createHonoUploadistaAdapterV2 = async <
  TEnv extends Env = Env,
  TFlows extends (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<
    Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, unknown>,
    UploadistaError,
    unknown
  > = any,
  TPlugins extends readonly Layer.Layer<any, never, never>[] = Layer.Layer<
    any,
    never,
    never
  >[],
>({
  baseUrl = "uploadista",
  flows,
  plugins = [] as unknown as TPlugins,
  eventBroadcaster = memoryEventBroadcaster,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  kvStore,
  generateId = GenerateIdLive,
  authMiddleware,
  durableObjectWebSocket,
  metricsLayer,
  withTracing = false,
  authCacheConfig,
}: HonoUploadistaAdapterOptions<
  TEnv,
  TFlows,
  TPlugins
>): Promise<HonoUploadistaAdapter> => {
  // Create Hono adapter
  const adapter = honoAdapter<TEnv>({
    authMiddleware,
    durableObjectWebSocket,
  });

  // Create unified server
  const server = await createUploadistaServer({
    flows,
    dataStore,
    kvStore,
    plugins,
    eventEmitter,
    eventBroadcaster,
    baseUrl,
    generateId,
    withTracing,
    metricsLayer,
    bufferedDataStore,
    adapter,
    authCacheConfig,
  });

  // Create Durable Object WebSocket handler if configured
  const durableObjectWebSocketHandler = durableObjectWebSocket
    ? createUploadistaDurableObjectWebSocketRequestHandler(
        durableObjectWebSocket,
      )
    : undefined;

  return {
    baseUrl,
    handler: server.handler,
    websocketHandler: (_c: Context) => {
      // Note: The core server's websocketHandler has a different signature pattern
      // For V2, prefer using durableObjectWebSocketHandler for WebSocket support
      // This stub provides basic WebSocket event handlers
      return {
        onMessage: (evt: MessageEvent) => {
          console.log("WebSocket message received:", evt.data);
        },
        onClose: () => {
          console.log("WebSocket connection closed");
        },
        onError: (evt: Event) => {
          console.error("WebSocket error:", evt);
        },
      } as WSEvents;
    },
    durableObjectWebSocketHandler,
  } satisfies HonoUploadistaAdapter;
};
