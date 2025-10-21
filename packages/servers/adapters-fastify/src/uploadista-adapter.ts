import type * as fastifyWebsocket from "@fastify/websocket";
import type {
  EventBroadcasterService,
  UploadFileDataStores,
  UploadistaError,
} from "@uploadista/core";
import { type Flow, FlowProvider, FlowServer } from "@uploadista/core/flow";
import {
  type BaseEventEmitterService,
  type BaseKvStoreService,
  createDataStoreLayer,
  type DataStoreConfig,
  type UploadFileDataStore,
  type UploadFileKVStore,
} from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { type GenerateId, GenerateIdLive } from "@uploadista/core/utils";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { NodeSdkLive } from "@uploadista/observability";
import {
  type AuthCacheConfig,
  AuthCacheServiceLive,
  type AuthContext,
  AuthContextServiceLive,
  type AuthResult,
  createFlowServerLayer,
  createUploadServerLayer,
  type FlowRequirementsOf,
} from "@uploadista/server";
import { Effect, Layer } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

type WebSocket = fastifyWebsocket.WebSocket;

import {
  type MetricsService,
  NoOpMetricsServiceLive,
} from "@uploadista/observability";
import {
  handleContinueFlow,
  handleFlowGet,
  handleFlowPost,
  handleJobStatus,
} from "./flow-http-handlers";
import {
  handleUploadGet,
  handleUploadPatch,
  handleUploadPost,
} from "./upload-http-handlers";
import {
  FastifyUploadistaAdapterService,
  type FastifyUploadistaAdapterServiceShape,
} from "./uploadista-adapter-layer";
import { createUploadistaWebSocketHandler } from "./uploadista-websocket-handler";

export type FastifyUploadistaAdapterOptions<
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

  // Authentication
  authMiddleware?: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;

  // Metrics
  metricsLayer?: Layer.Layer<MetricsService, never, never>;
};

export type InternalFastifyUploadistaAdapterOptions<
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

  // Authentication
  authMiddleware?: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;

  // Metrics
  metricsLayer?: Layer.Layer<MetricsService, never, never>;
};

export type FastifyUploadistaAdapter = {
  baseUrl: string;
  handler: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  websocketHandler: (socket: WebSocket, request: FastifyRequest) => void;
};

// Effect-native API
export type FastifyUploadistaServer = {
  handler: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Effect.Effect<void, never, never>;
  uploadServer: Layer.Layer<UploadServer>;
  flowServer: Layer.Layer<FlowServer>;
  websocketHandler: (socket: WebSocket, request: FastifyRequest) => void;
};

// Effect-based service factory for creating the unified adapter layer
const createFastifyUploadistaAdapterServiceLayer = (
  baseUrl: string,
  authMiddleware?: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<AuthResult>,
  authCacheConfig?: AuthCacheConfig,
  metricsLayer?: Layer.Layer<MetricsService, never, never>,
) =>
  Layer.effect(
    FastifyUploadistaAdapterService,
    Effect.gen(function* () {
      const uploadServer = yield* UploadServer;
      const flowServer = yield* FlowServer;

      // Create auth cache layer (always present, even if auth is not enabled)
      const authCacheLayer = AuthCacheServiceLive(authCacheConfig);

      return {
        handler: (req: FastifyRequest, reply: FastifyReply) =>
          Effect.gen(function* () {
            // Call auth middleware if configured and create auth context layer
            let authContext: AuthContext | null = null;
            if (authMiddleware) {
              // Run auth middleware with timeout protection (5 seconds default)
              const authMiddlewareWithTimeout = Effect.tryPromise({
                try: () => authMiddleware(req, reply),
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
                reply.status(503).send({
                  error: "Authentication service unavailable",
                  message:
                    "Authentication took too long to respond. Please try again.",
                });
                return;
              }

              // If auth middleware returned null, authentication failed
              if (authResult === null) {
                reply.status(401).send({
                  error: "Unauthorized",
                  message: "Invalid credentials",
                });
                return;
              }

              // Check for error marker (shouldn't happen after catchAll, but for type safety)
              if (
                authResult &&
                typeof authResult === "object" &&
                "_tag" in authResult &&
                authResult._tag === "AuthError"
              ) {
                reply.status(500).send({
                  error: "Internal Server Error",
                  message: "An error occurred during authentication",
                });
                return;
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

            const url = new URL(req.url, `http://${req.hostname}`);

            // Check for uploadista/api/ prefix
            if (!url.pathname.includes(`${baseUrl}/api/`)) {
              reply.status(404).send({ error: "Not found" });
              return;
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
                  return yield* handleUploadPost(req, reply, uploadServer).pipe(
                    Effect.provide(authLayer),
                  );
                case "GET":
                  return yield* handleUploadGet(req, reply, uploadServer).pipe(
                    Effect.provide(authLayer),
                  );
                case "PATCH":
                  return yield* handleUploadPatch(
                    req,
                    reply,
                    uploadServer,
                  ).pipe(Effect.provide(authLayer));
                default:
                  reply.status(405).send({ error: "Method not allowed" });
                  return;
              }
            } else if (routeSegments.includes("flow")) {
              // Flow API routes
              switch (req.method) {
                case "GET":
                  return yield* handleFlowGet(req, reply, flowServer).pipe(
                    Effect.provide(authLayer),
                  );
                case "POST":
                  return yield* handleFlowPost<never>(
                    req,
                    reply,
                    flowServer,
                  ).pipe(Effect.provide(authLayer));
                default:
                  reply.status(405).send({ error: "Method not allowed" });
                  return;
              }
            } else if (routeSegments.includes("jobs")) {
              // Unified job status routes
              if (req.method === "GET" && url.pathname.endsWith("/status")) {
                return yield* handleJobStatus(req, reply, flowServer).pipe(
                  Effect.provide(authLayer),
                );
              } else if (
                req.method === "PATCH" &&
                routeSegments.includes("continue")
              ) {
                return yield* handleContinueFlow<never>(
                  req,
                  reply,
                  flowServer,
                ).pipe(Effect.provide(authLayer));
              }
              reply.status(405).send({ error: "Method not allowed" });
              return;
            } else {
              reply.status(404).send({ error: "Not found" });
              return;
            }
          }).pipe(
            Effect.catchAll(() =>
              Effect.sync(() => {
                reply.status(500).send({ error: "Internal server error" });
              }),
            ),
          ),

        websocketHandler: createUploadistaWebSocketHandler(
          baseUrl,
          uploadServer,
          flowServer,
        ),
      } satisfies FastifyUploadistaAdapterServiceShape;
    }),
  );

/**
 * Creates an Effect-native unified Fastify server - combining upload and flow capabilities
 */
export const createFastifyUploadistaServer = <TRequirements = UploadServer>({
  baseUrl,
  flowProvider,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  kvStore,
  generateId = GenerateIdLive,
  authMiddleware,
  authCacheConfig,
  metricsLayer,
}: InternalFastifyUploadistaAdapterOptions<TRequirements>): Effect.Effect<FastifyUploadistaServer> => {
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

  // Set up adapter
  const adapterLayer = Layer.provide(
    createFastifyUploadistaAdapterServiceLayer(
      baseUrl,
      authMiddleware,
      authCacheConfig,
      metricsLayer,
    ),
    Layer.mergeAll(uploadServerLayer, flowServerLayer),
  );

  return Effect.gen(function* () {
    const adapterService = yield* FastifyUploadistaAdapterService;

    return {
      handler: (req: FastifyRequest, reply: FastifyReply) =>
        adapterService.handler(req, reply),
      websocketHandler: (socket: WebSocket, request: FastifyRequest) =>
        adapterService.websocketHandler(socket, request),
      uploadServer: uploadServerLayer,
      flowServer: flowServerLayer,
    } satisfies FastifyUploadistaServer;
  }).pipe(Effect.provide(adapterLayer));
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
 * Creates a Promise-based Fastify adapter for compatibility with existing Fastify applications
 * This wraps the Effect-native version with Promise conversion and caches the server instance
 */
export const createInternalFastifyUploadistaAdapter = async <
  TRequirements = UploadServer,
  TPlugins extends readonly Layer.Layer<TRequirements, never, never>[] = [],
>({
  baseUrl,
  flowProvider,
  plugins,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  kvStore,
  withTracing = false,
  authMiddleware,
  authCacheConfig,
  metricsLayer,
}: InternalFastifyUploadistaAdapterOptions<
  TRequirements,
  TPlugins
>): Promise<FastifyUploadistaAdapter> => {
  // Create and cache the Effect server instance
  const uploadistaServer = await Effect.runPromise(
    createFastifyUploadistaServer<TRequirements>({
      baseUrl,
      flowProvider,
      eventEmitter,
      dataStore,
      bufferedDataStore,
      kvStore,
      authMiddleware,
      authCacheConfig,
      metricsLayer,
    }),
  );

  // Merge all plugin layers so we can provide them when running handlers
  const pluginLayers = Layer.mergeAll(
    uploadistaServer.uploadServer,
    ...(plugins ?? []),
  ) as Layer.Layer<UploadServer | TRequirements, never, never>;

  return {
    baseUrl,
    handler: (req: FastifyRequest, reply: FastifyReply) => {
      return runProgram(
        uploadistaServer.handler(req, reply).pipe(Effect.provide(pluginLayers)),
        withTracing,
      ).catch((error) => {
        console.error("Fastify adapter error:", error);
        reply.status(500).send({ error: "Internal server error" });
      });
    },
    websocketHandler: (socket: WebSocket, request: FastifyRequest) =>
      uploadistaServer.websocketHandler(socket, request),
  } satisfies FastifyUploadistaAdapter;
};

/**
 * Creates a Promise-based Uploadista Fastify adapter for compatibility
 *
 * Note: Ensure that the plugins array provides all services required by your flows.
 * Missing plugin services will result in runtime errors during flow execution.
 */
export const createFastifyUploadistaAdapter = async <
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
  eventEmitter,
  eventBroadcaster = memoryEventBroadcaster,
  dataStore,
  bufferedDataStore,
  kvStore,
  generateId = GenerateIdLive,
  authMiddleware,
  authCacheConfig,
  metricsLayer,
}: FastifyUploadistaAdapterOptions<
  TFlows,
  TPlugins
>): Promise<FastifyUploadistaAdapter> => {
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

  return createInternalFastifyUploadistaAdapter<FlowReq, TPlugins>({
    baseUrl,
    flowProvider,
    plugins,
    eventEmitter: finalEventEmitter,
    dataStore: dataStoreLayer,
    bufferedDataStore,
    kvStore,
    generateId,
    authMiddleware,
    authCacheConfig,
    metricsLayer,
  });
};
