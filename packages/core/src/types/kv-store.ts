import { Context, Effect, Layer } from "effect";
import { UploadistaError } from "../errors";
import type { FlowJob } from "../flow";
import type { UploadFile } from "./upload-file";

// Base untyped KV store interface - stores raw strings
export interface BaseKvStore {
  readonly get: (key: string) => Effect.Effect<string | null, UploadistaError>;
  readonly set: (
    key: string,
    value: string,
  ) => Effect.Effect<void, UploadistaError>;
  readonly delete: (key: string) => Effect.Effect<void, UploadistaError>;
  readonly list?: (
    keyPrefix: string,
  ) => Effect.Effect<Array<string>, UploadistaError>;
}

// Typed KV store interface - handles serialization/deserialization
export type KvStore<TData> = {
  readonly get: (key: string) => Effect.Effect<TData, UploadistaError>;
  readonly set: (
    key: string,
    value: TData,
  ) => Effect.Effect<void, UploadistaError>;
  readonly delete: (key: string) => Effect.Effect<void, UploadistaError>;
  readonly list?: () => Effect.Effect<Array<string>, UploadistaError>;
};

// Typed wrapper class that uses a base store with serialization
export class TypedKvStore<TData> implements KvStore<TData> {
  constructor(
    private baseStore: BaseKvStore,
    private keyPrefix: string,
    private serialize: (data: TData) => string,
    private deserialize: (str: string) => TData,
  ) {}

  get = (key: string): Effect.Effect<TData, UploadistaError> =>
    this.baseStore.get(this.keyPrefix + key).pipe(
      Effect.flatMap((value) => {
        if (value === null) {
          return Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", {
              cause: `Key "${key}" not found`,
            }),
          );
        }
        try {
          return Effect.succeed(this.deserialize(value));
        } catch (error) {
          return Effect.fail(
            new UploadistaError({
              code: "VALIDATION_ERROR",
              status: 400,
              body: `Failed to deserialize value for key "${key}"`,
              cause: error,
            }),
          );
        }
      }),
    );

  set = (key: string, value: TData): Effect.Effect<void, UploadistaError> => {
    try {
      const serialized = this.serialize(value);
      return this.baseStore.set(this.keyPrefix + key, serialized);
    } catch (error) {
      return Effect.fail(
        new UploadistaError({
          code: "VALIDATION_ERROR",
          status: 400,
          body: `Failed to serialize value for key "${key}"`,
          cause: error,
        }),
      );
    }
  };

  delete = (key: string): Effect.Effect<void, UploadistaError> =>
    this.baseStore.delete(this.keyPrefix + key);

  list = (): Effect.Effect<Array<string>, UploadistaError> => {
    if (this.baseStore.list) {
      return this.baseStore.list(this.keyPrefix);
    }
    return Effect.fail(
      new UploadistaError({
        code: "UNKNOWN_ERROR",
        status: 501,
        body: "List operation not supported by this store",
      }),
    );
  };
}

// Default JSON serialization helpers
export const jsonSerializer = {
  serialize: <T>(data: T): string => JSON.stringify(data),
  deserialize: <T>(str: string): T => JSON.parse(str),
};

// Context tags
export class BaseKvStoreService extends Context.Tag("BaseKvStore")<
  BaseKvStoreService,
  BaseKvStore
>() {}

export class UploadFileKVStore extends Context.Tag("UploadFileKVStore")<
  UploadFileKVStore,
  KvStore<UploadFile>
>() {}

export const uploadFileKvStore = Layer.effect(
  UploadFileKVStore,
  Effect.gen(function* () {
    const baseStore = yield* BaseKvStoreService;
    return new TypedKvStore<UploadFile>(
      baseStore,
      "uploadista:upload-file:",
      jsonSerializer.serialize,
      jsonSerializer.deserialize,
    );
  }),
);

export class FlowJobKVStore extends Context.Tag("FlowJobKVStore")<
  FlowJobKVStore,
  KvStore<FlowJob>
>() {}

export const flowJobKvStore = Layer.effect(
  FlowJobKVStore,
  Effect.gen(function* () {
    const baseStore = yield* BaseKvStoreService;
    return new TypedKvStore<FlowJob>(
      baseStore,
      "uploadista:flow-job:",
      jsonSerializer.serialize,
      jsonSerializer.deserialize,
    );
  }),
);
