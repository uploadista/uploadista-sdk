import { UploadistaError } from "@uploadista/core/errors";
import type { EventBroadcaster } from "@uploadista/core/types";
import { EventBroadcasterService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import type { Redis } from "ioredis";

/**
 * Configuration for Redis event broadcaster
 */
export interface IoRedisEventBroadcasterConfig {
  /**
   * Redis client for publishing messages
   */
  redis: Redis;
  /**
   * Separate Redis client for subscribing to messages
   * (Redis requires a dedicated connection for pub/sub)
   */
  subscriberRedis: Redis;
}

/**
 * Redis-based event broadcaster for distributed deployments.
 * Uses Redis Pub/Sub to broadcast events across multiple instances.
 * Requires two separate Redis connections (one for pub, one for sub).
 */
export function createIoRedisEventBroadcaster(
  config: IoRedisEventBroadcasterConfig,
): EventBroadcaster {
  const { redis, subscriberRedis } = config;

  return {
    publish: (channel: string, message: string) =>
      Effect.tryPromise({
        try: () => redis.publish(channel, message),
        catch: (cause) =>
          UploadistaError.fromCode("UNKNOWN_ERROR", {
            cause,
          }),
      }).pipe(Effect.asVoid),

    subscribe: (channel: string, handler: (message: string) => void) =>
      Effect.try({
        try: () => {
          subscriberRedis.subscribe(channel);
          subscriberRedis.on("message", (ch: string, msg: string) => {
            if (ch === channel) {
              handler(msg);
            }
          });
        },
        catch: (cause) =>
          UploadistaError.fromCode("UNKNOWN_ERROR", {
            cause,
          }),
      }),

    unsubscribe: (channel: string) =>
      Effect.tryPromise({
        try: () => subscriberRedis.unsubscribe(channel),
        catch: (cause) =>
          UploadistaError.fromCode("UNKNOWN_ERROR", {
            cause,
          }),
      }).pipe(Effect.asVoid),
  };
}

/**
 * Layer factory for Redis event broadcaster
 */
export const ioRedisEventBroadcaster = (
  config: IoRedisEventBroadcasterConfig,
) =>
  Layer.succeed(EventBroadcasterService, createIoRedisEventBroadcaster(config));
