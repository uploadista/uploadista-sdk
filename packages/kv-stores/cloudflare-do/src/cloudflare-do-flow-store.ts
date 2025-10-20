import { UploadistaError } from "@uploadista/core/errors";
import type { FlowJob } from "@uploadista/core/flow";
import { type KvStore, FlowJobKVStore } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import type {
  FlowJobDurableObject,
  FlowJobDurableObjectBranded,
} from "./flowjob-durable-object";

export type CloudflareDoFlowStoreOptions = {
  durableObject: FlowJobDurableObject<FlowJob>;
};

export function makeCloudflareDoFlowStore<T extends FlowJob>({
  durableObject,
}: CloudflareDoFlowStoreOptions): KvStore<T> {
  function getStub(key: string): FlowJobDurableObjectBranded<T> {
    const id = durableObject.idFromName(key);
    return durableObject.get(id) as unknown as FlowJobDurableObjectBranded<T>;
  }

  return {
    get: (key: string) => {
      const stub = getStub(key);
      return Effect.tryPromise({
        try: () => stub.getFlowJob(),
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
        try: () => stub.setFlowJob(value),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid);
    },

    delete: (key: string) => {
      const stub = getStub(key);
      return Effect.tryPromise({
        try: () => stub.deleteFlowJob(),
        catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
      }).pipe(Effect.asVoid);
    },
  };
}

// Legacy function for backward compatibility
export const cloudflareDoFlowStore = makeCloudflareDoFlowStore;

export const cloudflareDoFlowJobKvStore = (
  config: CloudflareDoFlowStoreOptions,
) => Layer.succeed(FlowJobKVStore, makeCloudflareDoFlowStore(config));
