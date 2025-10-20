import { type BaseKvStore, BaseKvStoreService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

// Base memory store that stores raw strings
export function makeMemoryBaseKvStore(): BaseKvStore {
  const data: Map<string, string> = new Map();
  return {
    get: (key: string) => {
      const value = data.get(key);
      return Effect.succeed(value ?? null);
    },
    set: (key: string, value: string) => {
      data.set(key, value);
      return Effect.succeed(void 0);
    },
    delete: (key: string) => {
      data.delete(key);
      return Effect.succeed(void 0);
    },
    list: (keyPrefix: string) => {
      return Effect.succeed(
        Array.from(data.keys()).filter((key) => key.startsWith(keyPrefix)),
      );
    },
  };
}

// Base store layer
export const memoryKvStore = Layer.succeed(
  BaseKvStoreService,
  makeMemoryBaseKvStore(),
);
