import type {
  KVNamespace,
  KVNamespaceListResult,
} from "@cloudflare/workers-types";
import { UploadistaError } from "@uploadista/core/errors";

import { type BaseKvStore, BaseKvStoreService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

export type CloudflareKvStoreConfig = {
  kv: KVNamespace<string>;
};

// Base CloudFlare KV store that stores raw strings
export function makeCloudflareBaseKvStore({
  kv,
}: CloudflareKvStoreConfig): BaseKvStore {
  return {
    get: (key: string) =>
      Effect.tryPromise({
        try: () => kv.get(key),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }),

    set: (key: string, value: string) =>
      Effect.tryPromise({
        try: () => kv.put(key, value),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid),

    delete: (key: string) =>
      Effect.tryPromise({
        try: () => kv.delete(key),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid),

    list: (keyPrefix: string) =>
      Effect.gen(function* (_) {
        const keys = new Set<string>();
        let cursor: string | null = null;

        do {
          const result: KVNamespaceListResult<unknown, string> = yield* _(
            Effect.tryPromise({
              try: () =>
                kv.list({
                  prefix: keyPrefix,
                  limit: 20,
                  cursor,
                }),
              catch: (cause) =>
                UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
            }),
          );

          cursor = result.list_complete ? null : result.cursor;
          for (const key of result.keys) {
            const unprefixedKey = key.name.replace(keyPrefix, "");
            keys.add(unprefixedKey);
          }
        } while (cursor);

        return Array.from(keys);
      }),
  };
}

// Base store layer
export const cloudflareKvStore = (config: CloudflareKvStoreConfig) =>
  Layer.succeed(BaseKvStoreService, makeCloudflareBaseKvStore(config));
