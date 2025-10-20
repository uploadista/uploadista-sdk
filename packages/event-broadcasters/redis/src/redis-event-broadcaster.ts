import type { RedisClientType } from "@redis/client";
import { UploadistaError } from "@uploadista/core/errors";
import type { EventBroadcaster } from "@uploadista/core/types";
import { EventBroadcasterService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

/**
 * Configuration for Redis event broadcaster
 */
export interface RedisEventBroadcasterConfig {
  /**
   * Redis client for publishing messages
   */
  redis: RedisClientType;
  /**
   * Separate Redis client for subscribing to messages
   * (Redis requires a dedicated connection for pub/sub)
   */
  subscriberRedis: RedisClientType;
}

/**
 * Redis-based event broadcaster for distributed deployments.
 * Uses Redis Pub/Sub to broadcast events across multiple instances.
 * Requires two separate Redis connections (one for pub, one for sub).
 */
export function createRedisEventBroadcaster(
  config: RedisEventBroadcasterConfig,
): EventBroadcaster {
  const { redis, subscriberRedis } = config;

  subscriberRedis.on("error", (error) => {
    console.error(`[Redis] Subscriber Error:`, error);
  });

  redis.on("error", (error) => {
    console.error(`[Redis] Error:`, error);
  });

  return {
    publish: (channel: string, message: string) =>
      Effect.tryPromise({
        try: async () => {
          const result = await redis.publish(channel, message);
          return result;
        },
        catch: (cause) => {
          console.error(`[Redis] Failed to publish to ${channel}:`, cause);
          return UploadistaError.fromCode("UNKNOWN_ERROR", {
            cause,
          });
        },
      }).pipe(Effect.asVoid),

    subscribe: (channel: string, handler: (message: string) => void) =>
      Effect.tryPromise({
        try: async () => {
          await subscriberRedis.subscribe(channel, (message, _channel) => {
            handler(message);
          });
        },
        catch: (cause) => {
          console.error(`[Redis] Failed to subscribe to ${channel}:`, cause);
          return UploadistaError.fromCode("UNKNOWN_ERROR", {
            cause,
          });
        },
      }).pipe(Effect.asVoid),

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
export const redisEventBroadcaster = (config: RedisEventBroadcasterConfig) =>
  Layer.succeed(EventBroadcasterService, createRedisEventBroadcaster(config));
