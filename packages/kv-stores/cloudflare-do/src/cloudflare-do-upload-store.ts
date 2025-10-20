import { UploadistaError } from "@uploadista/core/errors";
import {
  type KvStore,
  type UploadFile,
  UploadFileKVStore,
} from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import type {
  UploadFileDurableObject,
  UploadFileDurableObjectBranded,
} from "./uploadfile-durable-object";

export type CloudflareDoUploadStoreOptions = {
  durableObject: UploadFileDurableObject<UploadFile>;
};

export function makeCloudflareDoUploadStore<T extends UploadFile>({
  durableObject,
}: CloudflareDoUploadStoreOptions): KvStore<T> {
  function getStub(key: string): UploadFileDurableObjectBranded<T> {
    const id = durableObject.idFromName(key);
    return durableObject.get(
      id,
    ) as unknown as UploadFileDurableObjectBranded<T>;
  }

  return {
    get: (key: string) => {
      const stub = getStub(key);
      return Effect.tryPromise({
        try: () => stub.getUploadFile(),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(
        Effect.flatMap((value) => {
          if (value === undefined) {
            return Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
          }
          return Effect.succeed(value);
        }),
      );
    },

    set: (key: string, value: T) => {
      const stub = getStub(key);
      return Effect.tryPromise({
        try: () => stub.setUploadFile(value),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid);
    },

    delete: (key: string) => {
      const stub = getStub(key);
      return Effect.tryPromise({
        try: () => stub.deleteUploadFile(),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid);
    },
  };
}

export const cloudflareDoUploadStore = (
  config: CloudflareDoUploadStoreOptions,
) => Layer.succeed(UploadFileKVStore, makeCloudflareDoUploadStore(config));
