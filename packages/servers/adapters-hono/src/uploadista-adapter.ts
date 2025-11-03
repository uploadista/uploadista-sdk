import type { UploadistaError } from "@uploadista/core";
import { type Flow } from "@uploadista/core/flow";
import {
  type BaseEventEmitterService,
  type BaseKvStoreService,
  type DataStoreConfig,
  type EventBroadcasterService,
  type UploadFileDataStore,
  type UploadFileKVStore,
} from "@uploadista/core/types";
import { type GenerateId, GenerateIdLive } from "@uploadista/core/utils";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import {
  type MetricsService,
  
} from "@uploadista/observability";
import {
  type AuthCacheConfig,
  type AuthResult,
  createUploadistaServer,
  
} from "@uploadista/server";
import { Effect, Layer } from "effect";
import type { Context, Env } from "hono";
import type { WSEvents } from "hono/ws";
import type { z } from "zod";
import { honoAdapter } from "./hono-adapter";

import {
  createUploadistaDurableObjectWebSocketRequestHandler,
  type DurableObjectWebSocketHandlerOptions,
} from "./hono-websocket-handler";

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


export type HonoUploadistaAdapter = {
  baseUrl: string;
  handler: (c: Context) => Promise<Response>;
  websocketHandler: (c: Context) => WSEvents;
  durableObjectWebSocketHandler?: (c: Context) => Promise<Response>;
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
 * import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
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
export const createHonoUploadistaAdapter = async <
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
    websocketHandler: server.websocketHandler,
    durableObjectWebSocketHandler,
  } satisfies HonoUploadistaAdapter;
};
