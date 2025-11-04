import type { UploadistaError } from "@uploadista/core";
import type { Flow } from "@uploadista/core/flow";
import type {
  BaseEventEmitterService,
  BaseKvStoreService,
  DataStoreConfig,
  EventBroadcasterService,
  UploadFileDataStore,
  UploadFileKVStore,
} from "@uploadista/core/types";
import type { GenerateId } from "@uploadista/core/utils";
import type { Effect, Layer } from "effect";
import type { z } from "zod";
import type { ServerAdapter } from "../adapter";
import type { AuthCacheConfig } from "../cache";

/**
 * Function type for retrieving flows based on flow ID and client ID.
 *
 * This function is called by the core server when a flow needs to be executed.
 * It should return an Effect that resolves to the requested Flow or fails with
 * an UploadistaError if the flow is not found or not authorized.
 *
 * @param flowId - The unique identifier of the flow to retrieve
 * @param clientId - The authenticated client ID (null if not authenticated)
 * @returns Effect that produces the Flow or fails with an error
 *
 * @example
 * ```typescript
 * const flows: FlowsFunction = (flowId, clientId) =>
 *   Effect.gen(function* () {
 *     if (flowId === "image-resize") {
 *       return imageResizeFlow;
 *     }
 *     return yield* Effect.fail(
 *       new UploadistaError({ code: "FLOW_NOT_FOUND", status: 404 })
 *     );
 *   });
 * ```
 */
export type FlowsFunction = (
  flowId: string,
  clientId: string | null,
) => Effect.Effect<
  Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, unknown>,
  UploadistaError,
  unknown
>;

/**
 * Configuration for creating the unified Uploadista server.
 *
 * This configuration is framework-agnostic and contains all the business logic
 * configuration. Framework-specific details are provided via the `adapter` field.
 *
 * @template TRequest - Framework-specific request type
 * @template TResponse - Framework-specific response type
 * @template TWebSocket - Framework-specific WebSocket type (optional)
 *
 * @example
 * ```typescript
 * import { createUploadistaServer, honoAdapter } from "@uploadista/server";
 *
 * const config: UploadistaServerConfig<Context, Context, WSEvents> = {
 *   // Core business logic configuration
 *   flows: getFlowById,
 *   dataStore: { type: "s3", config: { bucket: "my-bucket" } },
 *   kvStore: redisKvStore,
 *   baseUrl: "/uploadista",
 *
 *   // Framework-specific adapter
 *   adapter: honoAdapter({
 *     authMiddleware: async (c) => {
 *       // Hono-specific auth logic
 *       return { clientId: "user-123" };
 *     },
 *   }),
 * };
 *
 * const server = await createUploadistaServer(config);
 * ```
 */
export interface UploadistaServerConfig<
  TRequest,
  TResponse,
  TWebSocket = unknown,
> {
  /**
   * Function for retrieving flows by ID.
   *
   * This function is called when a flow execution is requested.
   * It receives the flow ID and client ID (from auth context) and should
   * return an Effect that resolves to the Flow definition.
   *
   * @example
   * ```typescript
   * flows: (flowId, clientId) => Effect.succeed(myFlows[flowId])
   * ```
   */
  flows: FlowsFunction;

  /**
   * Data store configuration for file storage.
   *
   * Specifies where uploaded files should be stored (S3, Azure, GCS, filesystem).
   * The core server creates the appropriate data store layer from this configuration.
   *
   * @example
   * ```typescript
   * dataStore: {
   *   type: "s3",
   *   config: {
   *     bucket: "my-uploads",
   *     region: "us-east-1"
   *   }
   * }
   * ```
   */
  dataStore: DataStoreConfig;

  /**
   * Key-value store layer for metadata storage.
   *
   * Used for storing upload metadata, flow job state, and other persistent data.
   * Can be Redis, Cloudflare KV, in-memory, or any implementation of BaseKvStoreService.
   *
   * @example
   * ```typescript
   * import { redisKvStore } from "@uploadista/kv-store-redis";
   *
   * kvStore: redisKvStore({ url: "redis://localhost:6379" })
   * ```
   */
  kvStore: Layer.Layer<BaseKvStoreService>;

  /**
   * Optional: Plugins to extend functionality.
   *
   * Plugins are Effect layers that add additional capabilities to the upload
   * and flow servers. They are merged into the server layer composition.
   *
   * @example
   * ```typescript
   * plugins: [imageProcessingPlugin, virusScanPlugin]
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: Permissive constraint allows plugin tuples
  plugins?: readonly Layer.Layer<any, never, never>[];

  /**
   * Optional: Event emitter layer for progress notifications.
   *
   * Used to emit upload progress, flow status updates, and other events.
   * Defaults to in-memory event emitter if not provided.
   *
   * @example
   * ```typescript
   * import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
   *
   * eventEmitter: webSocketEventEmitter()
   * ```
   */
  eventEmitter?: Layer.Layer<BaseEventEmitterService>;

  /**
   * Optional: Event broadcaster layer for real-time updates.
   *
   * Used to broadcast events to multiple subscribers (e.g., WebSocket connections).
   * Defaults to in-memory broadcaster if not provided.
   *
   * @example
   * ```typescript
   * import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
   *
   * eventBroadcaster: memoryEventBroadcaster()
   * ```
   */
  eventBroadcaster?: Layer.Layer<EventBroadcasterService>;

  /**
   * Optional: Base URL path for Uploadista endpoints.
   *
   * All Uploadista routes will be prefixed with `{baseUrl}/api/`.
   * For example, with baseUrl="/uploadista", routes become:
   * - POST /uploadista/api/upload
   * - POST /uploadista/api/flow/{flowId}/{storageId}
   *
   * @default "" (no prefix, routes start with /api/)
   */
  baseUrl?: string;

  /**
   * Optional: Custom ID generator layer.
   *
   * Used for generating upload IDs, job IDs, and other unique identifiers.
   * Defaults to built-in ID generator if not provided.
   *
   * @example
   * ```typescript
   * import { nanoidGenerator } from "@uploadista/utils";
   *
   * generateId: nanoidGenerator()
   * ```
   */
  generateId?: Layer.Layer<GenerateId>;

  /**
   * Optional: Enable distributed tracing with OpenTelemetry.
   *
   * When true, Effect programs run with OpenTelemetry tracing enabled,
   * allowing observability into upload and flow execution.
   *
   * @default false
   */
  withTracing?: boolean;

  /**
   * Optional: Metrics layer for observability.
   *
   * Used to collect metrics about upload/flow performance, errors, and usage.
   * Defaults to NoOp metrics if not provided.
   *
   * @example
   * ```typescript
   * import { prometheusMetrics } from "@uploadista/observability";
   *
   * metricsLayer: prometheusMetrics()
   * ```
   */
  // biome-ignore lint/suspicious/noExplicitAny: MetricsService is defined in @uploadista/observability
  metricsLayer?: Layer.Layer<any, never, never>;

  /**
   * Optional: Buffered data store layer for performance optimization.
   *
   * Provides in-memory buffering for frequently accessed data,
   * reducing latency for chunk uploads and reads.
   *
   * @example
   * ```typescript
   * import { bufferedDataStore } from "@uploadista/core/data-store";
   *
   * bufferedDataStore: bufferedDataStore({ maxSize: 1024 * 1024 * 10 })
   * ```
   */
  bufferedDataStore?: Layer.Layer<
    UploadFileDataStore,
    never,
    UploadFileKVStore
  >;

  /**
   * Framework-specific adapter.
   *
   * The adapter provides the bridge between framework-specific request/response
   * types and the standard types used by the core server. Each framework
   * (Hono, Express, Fastify) has its own adapter implementation.
   *
   * @example
   * ```typescript
   * import { honoAdapter } from "@uploadista/adapters-hono";
   *
   * adapter: honoAdapter({
   *   authMiddleware: async (c) => ({ clientId: "user-123" })
   * })
   * ```
   */
  adapter: ServerAdapter<TRequest, TResponse, TWebSocket>;

  /**
   * Optional: Configuration for auth context caching.
   *
   * Caching allows subsequent requests (chunk uploads, flow continuations) to
   * reuse the auth context from the initial request without re-authenticating.
   *
   * @example
   * ```typescript
   * authCacheConfig: {
   *   maxSize: 10000,
   *   ttl: 3600000 // 1 hour
   * }
   * ```
   */
  authCacheConfig?: AuthCacheConfig;
}

/**
 * Return type from createUploadistaServer.
 *
 * Contains the handler function and exposed server layers for framework-specific routing.
 *
 * @template TRequest - Framework-specific request type
 * @template TResponse - Framework-specific response type
 * @template TWebSocket - Framework-specific WebSocket type (optional)
 */
export interface UploadistaServer<
  TRequest,
  TResponse,
  TWebSocketHandler = unknown,
> {
  /**
   * Main request handler that processes HTTP requests through the adapter.
   */
  handler: (req: TRequest) => Promise<TResponse>;

  /**
   * Optional WebSocket handler if the adapter supports WebSocket connections.
   */
  websocketHandler: TWebSocketHandler;

  /**
   * Base URL path for Uploadista endpoints.
   */
  baseUrl: string;
}
