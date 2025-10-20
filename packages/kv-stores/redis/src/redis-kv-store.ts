import type { RedisArgument, RedisClientType } from "@redis/client";

import { UploadistaError } from "@uploadista/core/errors";
import { type BaseKvStore, BaseKvStoreService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

export interface RedisKvStoreConfig {
  redis: RedisClientType;
}

// Base Redis KV store that stores raw strings
export function makeRedisBaseKvStore({
  redis,
}: RedisKvStoreConfig): BaseKvStore {
  return {
    get: (key: string) =>
      Effect.tryPromise({
        try: () => redis.get(key),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }),

    set: (key: string, value: string) =>
      Effect.tryPromise({
        try: () => redis.set(key, value),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid),

    delete: (key: string) =>
      Effect.tryPromise({
        try: () => redis.del(key),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid),

    list: (keyPrefix: string) =>
      Effect.gen(function* (_) {
        const keys = new Set<string>();
        let cursor: RedisArgument = "0";

        do {
          const result = yield* _(
            Effect.tryPromise({
              try: () =>
                redis.scan(cursor, {
                  MATCH: `${keyPrefix}*`,
                  COUNT: 20,
                }),
              catch: (cause) =>
                UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
            }),
          );

          cursor = result.cursor;
          for (const key of result.keys) {
            keys.add(key.replace(keyPrefix, ""));
          }
        } while (cursor !== "0");

        return Array.from(keys);
      }),
  };
}

// Base store layer
export const redisKvStore = (config: RedisKvStoreConfig) =>
  Layer.succeed(BaseKvStoreService, makeRedisBaseKvStore(config));
