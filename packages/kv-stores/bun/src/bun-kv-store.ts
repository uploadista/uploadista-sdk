import { UploadistaError } from "@uploadista/core/errors";
import { type BaseKvStore, BaseKvStoreService } from "@uploadista/core/types";
import type { RedisClient } from "bun";
import { Effect, Layer } from "effect";

export interface BunKvStoreConfig {
  redis: RedisClient;
}

// Base Bun Redis KV store that stores raw strings
export function makeBunBaseKvStore({ redis }: BunKvStoreConfig): BaseKvStore {
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
        try: () => redis.send("DEL", [key]),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid),

    list: (keyPrefix: string) =>
      Effect.gen(function* (_) {
        const keys = new Set<string>();
        let cursor = "0";

        do {
          const result = yield* _(
            Effect.tryPromise({
              try: () =>
                redis.send("SCAN", [
                  cursor,
                  "MATCH",
                  `${keyPrefix}*`,
                  "COUNT",
                  "20",
                ]) as Promise<[string, string[]]>,
              catch: (cause) =>
                UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
            }),
          );

          cursor = result[0];
          for (const key of result[1]) {
            keys.add(key.replace(keyPrefix, ""));
          }
        } while (cursor !== "0");

        return Array.from(keys);
      }),
  };
}

// Base store layer
export const bunKvStore = (config: BunKvStoreConfig) =>
  Layer.succeed(BaseKvStoreService, makeBunBaseKvStore(config));
