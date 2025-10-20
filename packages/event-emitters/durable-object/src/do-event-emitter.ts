import { UploadistaError } from "@uploadista/core/errors";
import {
  type EventEmitter,
  type UploadEvent,
  UploadEventEmitter,
} from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import type {
  EventEmitterDurableObject,
  EventEmitterDurableObjectBranded,
} from "./event-emitter-durable-object";

export type UploadEventEmitterDurableObjectStoreConfig = {
  durableObject: EventEmitterDurableObject<UploadEvent>;
};

export function makeEventEmitterDurableObjectStore<T>({
  durableObject,
}: UploadEventEmitterDurableObjectStoreConfig): EventEmitter<T> {
  function getStub(key: string) {
    const id = durableObject.idFromName(key);
    return durableObject.get(
      id,
    ) as unknown as EventEmitterDurableObjectBranded<T>;
  }

  return {
    emit: (key: string, event: T) => {
      const stub = getStub(key);
      return Effect.tryPromise({
        try: async () => {
          await stub.emit(event);
          return;
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
    subscribe: (key: string, connection) => {
      return Effect.tryPromise({
        try: async () => {
          const stub = getStub(key);
          await stub.subscribe(connection);
          return;
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
    unsubscribe: (key: string) => {
      return Effect.tryPromise({
        try: async () => {
          const stub = getStub(key);
          await stub.unsubscribe();
          return;
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
  };
}

export const uploadEventEmitterDurableObjectStore = (
  config: UploadEventEmitterDurableObjectStoreConfig,
) =>
  Layer.succeed(
    UploadEventEmitter,
    makeEventEmitterDurableObjectStore<UploadEvent>(config),
  );
