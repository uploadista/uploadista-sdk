import fs from "node:fs/promises";
import path from "node:path";
import { UploadistaError } from "@uploadista/core/errors";
import { type BaseKvStore, BaseKvStoreService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

export type FileKvStoreOptions = {
  directory: string;
};

// Base Filesystem KV store that stores raw strings
export function makeFileBaseKvStore({
  directory,
}: FileKvStoreOptions): BaseKvStore {
  const resolve = (key: string): string => {
    return path.resolve(directory, `${key}.json`);
  };

  return {
    get: (key: string) =>
      Effect.tryPromise({
        try: () => fs.readFile(resolve(key), "utf8"),
        catch: (cause) => UploadistaError.fromCode("FILE_NOT_FOUND", { cause }),
      }),

    set: (key: string, value: string) =>
      Effect.tryPromise({
        try: () => fs.writeFile(resolve(key), value),
        catch: (cause) =>
          UploadistaError.fromCode("FILE_WRITE_ERROR", { cause }),
      }),

    delete: (key: string) =>
      Effect.tryPromise({
        try: () => fs.rm(resolve(key)),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }),

    list: (keyPrefix: string) =>
      Effect.tryPromise({
        try: () => fs.readdir(directory),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(
        Effect.map((files) => {
          return files
            .filter(
              (file) => file.endsWith(".json") && file.startsWith(keyPrefix),
            )
            .map((file) => path.basename(file, ".json"))
            .sort((a, b) => a.localeCompare(b));
        }),
      ),
  };
}

// Base store layer
export const fileKvStore = (config: FileKvStoreOptions) =>
  Layer.succeed(BaseKvStoreService, makeFileBaseKvStore(config));
