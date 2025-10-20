import { UploadistaError } from "@uploadista/core/errors";
import { type BaseKvStore, BaseKvStoreService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import type { Redis as IoRedis } from "ioredis";

export type IoRedisKvStoreConfig = {
  redis: IoRedis;
};

// Base IORedis KV store that stores raw strings
export function makeIoRedisBaseKvStore({
  redis,
}: IoRedisKvStoreConfig): BaseKvStore {
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
        let cursor = "0";

        do {
          const [next, batch] = yield* _(
            Effect.tryPromise({
              try: () =>
                redis.scan(cursor, "MATCH", `${keyPrefix}*`, "COUNT", "20"),
              catch: (cause) =>
                UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
            }),
          );

          cursor = next;
          for (const key of batch) {
            keys.add(key.replace(keyPrefix, ""));
          }
        } while (cursor !== "0");

        return Array.from(keys);
      }),
  };
}

// Base store layer
export const ioRedisKvStore = (config: IoRedisKvStoreConfig) =>
  Layer.succeed(BaseKvStoreService, makeIoRedisBaseKvStore(config));
