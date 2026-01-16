import { Context, Effect, Layer } from "effect";
import { UploadistaError } from "../errors";
import type { DeadLetterItem, FlowJob } from "../flow";
import type { UploadFile } from "./upload-file";

/**
 * Base key-value store interface for raw string storage.
 *
 * This is the low-level interface that storage adapters implement.
 * It stores raw string values without type safety or serialization.
 *
 * @property get - Retrieves a value by key, returns null if not found
 * @property set - Stores a value with the given key
 * @property delete - Removes a value by key
 * @property list - Optional operation to list all keys with a given prefix
 *
 * @example
 * ```typescript
 * // Implement a BaseKvStore with Redis
 * const redisKvStore: BaseKvStore = {
 *   get: (key) => Effect.tryPromise({
 *     try: () => redis.get(key),
 *     catch: (error) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error })
 *   }),
 *
 *   set: (key, value) => Effect.tryPromise({
 *     try: () => redis.set(key, value),
 *     catch: (error) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error })
 *   }),
 *
 *   delete: (key) => Effect.tryPromise({
 *     try: () => redis.del(key),
 *     catch: (error) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error })
 *   }),
 *
 *   list: (prefix) => Effect.tryPromise({
 *     try: () => redis.keys(`${prefix}*`),
 *     catch: (error) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause: error })
 *   })
 * };
 * ```
 */
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

/**
 * Type-safe key-value store interface with automatic serialization.
 *
 * This wraps a BaseKvStore and handles JSON serialization/deserialization
 * for a specific data type, providing type safety and eliminating the need
 * for manual JSON.stringify/parse calls.
 *
 * @template TData - The type of data stored in this KV store
 *
 * @property get - Retrieves and deserializes a value, fails if not found
 * @property set - Serializes and stores a value
 * @property delete - Removes a value by key
 * @property list - Optional operation to list all keys (without prefix)
 *
 * @example
 * ```typescript
 * // Use a typed KV store
 * const uploadStore: KvStore<UploadFile> = new TypedKvStore(
 *   baseStore,
 *   "uploads:",
 *   jsonSerializer.serialize,
 *   jsonSerializer.deserialize
 * );
 *
 * // Store and retrieve typed data
 * const program = Effect.gen(function* () {
 *   const file: UploadFile = {
 *     id: "file123",
 *     offset: 0,
 *     storage: { id: "s3", type: "s3" }
 *   };
 *
 *   // Automatic serialization
 *   yield* uploadStore.set("file123", file);
 *
 *   // Automatic deserialization with type safety
 *   const retrieved = yield* uploadStore.get("file123");
 *   console.log(retrieved.offset); // TypeScript knows this is a number
 * });
 * ```
 */
export type KvStore<TData> = {
  readonly get: (key: string) => Effect.Effect<TData, UploadistaError>;
  readonly set: (
    key: string,
    value: TData,
  ) => Effect.Effect<void, UploadistaError>;
  readonly delete: (key: string) => Effect.Effect<void, UploadistaError>;
  readonly list?: () => Effect.Effect<Array<string>, UploadistaError>;
};

/**
 * Typed wrapper class that adds serialization to a BaseKvStore.
 *
 * This class implements the KvStore interface by wrapping a BaseKvStore
 * and handling serialization/deserialization for a specific type. It also
 * adds a key prefix to isolate different data types in the same store.
 *
 * @template TData - The type of data to store
 *
 * @example
 * ```typescript
 * // Create a typed store for UploadFile
 * const uploadFileStore = new TypedKvStore<UploadFile>(
 *   baseKvStore,
 *   "uploadista:upload-file:", // All keys will be prefixed
 *   (data) => JSON.stringify(data),
 *   (str) => JSON.parse(str) as UploadFile
 * );
 *
 * // Use the store
 * const effect = Effect.gen(function* () {
 *   const file: UploadFile = { ... };
 *   yield* uploadFileStore.set("abc123", file);
 *   // Internally stores at key "uploadista:upload-file:abc123"
 *
 *   const retrieved = yield* uploadFileStore.get("abc123");
 *   return retrieved;
 * });
 *
 * // Custom serialization for binary data
 * const binaryStore = new TypedKvStore<Uint8Array>(
 *   baseKvStore,
 *   "binary:",
 *   (data) => btoa(String.fromCharCode(...data)), // Base64 encode
 *   (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0)) // Base64 decode
 * );
 * ```
 */
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
      // Get keys with prefix and strip the prefix for use with get/set/delete
      return this.baseStore
        .list(this.keyPrefix)
        .pipe(
          Effect.map((keys) =>
            keys.map((key) =>
              key.startsWith(this.keyPrefix)
                ? key.slice(this.keyPrefix.length)
                : key,
            ),
          ),
        );
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

/**
 * Default JSON serialization helpers.
 *
 * These functions provide standard JSON serialization for use with TypedKvStore.
 * They work with any JSON-serializable type.
 *
 * @example
 * ```typescript
 * const store = new TypedKvStore<MyType>(
 *   baseStore,
 *   "mydata:",
 *   jsonSerializer.serialize,
 *   jsonSerializer.deserialize
 * );
 * ```
 */
export const jsonSerializer = {
  serialize: <T>(data: T): string => JSON.stringify(data),
  deserialize: <T>(str: string): T => JSON.parse(str),
};

/**
 * Effect-TS context tag for the base untyped KV store.
 *
 * This is the low-level store that storage adapter implementations provide.
 * Most application code should use typed stores like UploadFileKVStore instead.
 *
 * @example
 * ```typescript
 * // Provide a base store implementation
 * const baseStoreLayer = Layer.succeed(BaseKvStoreService, redisKvStore);
 *
 * // Use in an Effect
 * const effect = Effect.gen(function* () {
 *   const baseStore = yield* BaseKvStoreService;
 *   yield* baseStore.set("raw-key", "raw-value");
 * });
 * ```
 */
export class BaseKvStoreService extends Context.Tag("BaseKvStore")<
  BaseKvStoreService,
  BaseKvStore
>() {}

/**
 * Effect-TS context tag for the UploadFile typed KV store.
 *
 * This provides type-safe storage for UploadFile metadata. It's the primary
 * way to store and retrieve upload metadata in the system.
 *
 * @example
 * ```typescript
 * const uploadEffect = Effect.gen(function* () {
 *   const kvStore = yield* UploadFileKVStore;
 *
 *   // Store upload metadata
 *   const file: UploadFile = {
 *     id: "upload123",
 *     offset: 0,
 *     storage: { id: "s3", type: "s3" }
 *   };
 *   yield* kvStore.set("upload123", file);
 *
 *   // Retrieve with type safety
 *   const retrieved = yield* kvStore.get("upload123");
 *   return retrieved;
 * });
 * ```
 */
export class UploadFileKVStore extends Context.Tag("UploadFileKVStore")<
  UploadFileKVStore,
  KvStore<UploadFile>
>() {}

/**
 * Effect Layer that creates the UploadFileKVStore from a BaseKvStore.
 *
 * This layer automatically wires up JSON serialization for UploadFile objects
 * with the "uploadista:upload-file:" key prefix.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const kvStore = yield* UploadFileKVStore;
 *   // Use the store...
 * }).pipe(
 *   Effect.provide(uploadFileKvStore),
 *   Effect.provide(baseStoreLayer)
 * );
 * ```
 */
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

/**
 * Effect-TS context tag for the FlowJob typed KV store.
 *
 * This provides type-safe storage for FlowJob metadata, tracking the
 * execution state of flow processing jobs.
 *
 * @example
 * ```typescript
 * const flowEffect = Effect.gen(function* () {
 *   const jobStore = yield* FlowJobKVStore;
 *
 *   // Store job state
 *   const job: FlowJob = {
 *     id: "job123",
 *     flowId: "flow_resize",
 *     status: "running",
 *     tasks: [],
 *     createdAt: new Date(),
 *     updatedAt: new Date()
 *   };
 *   yield* jobStore.set("job123", job);
 *
 *   // Retrieve and check status
 *   const retrieved = yield* jobStore.get("job123");
 *   return retrieved.status;
 * });
 * ```
 */
export class FlowJobKVStore extends Context.Tag("FlowJobKVStore")<
  FlowJobKVStore,
  KvStore<FlowJob>
>() {}

/**
 * Effect Layer that creates the FlowJobKVStore from a BaseKvStore.
 *
 * This layer automatically wires up JSON serialization for FlowJob objects
 * with the "uploadista:flow-job:" key prefix.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const jobStore = yield* FlowJobKVStore;
 *   // Use the store...
 * }).pipe(
 *   Effect.provide(flowJobKvStore),
 *   Effect.provide(baseStoreLayer)
 * );
 * ```
 */
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

/**
 * Effect-TS context tag for the Dead Letter Queue typed KV store.
 *
 * This provides type-safe storage for DeadLetterItem objects, tracking
 * failed flow jobs for retry, debugging, and manual intervention.
 *
 * @example
 * ```typescript
 * const dlqEffect = Effect.gen(function* () {
 *   const dlqStore = yield* DeadLetterQueueKVStore;
 *
 *   // Store a DLQ item
 *   const item: DeadLetterItem = {
 *     id: "dlq_123",
 *     jobId: "job_456",
 *     flowId: "image-pipeline",
 *     storageId: "s3",
 *     clientId: "client_789",
 *     error: { code: "FLOW_NODE_ERROR", message: "Timeout" },
 *     inputs: { input: { uploadId: "upload_abc" } },
 *     nodeResults: {},
 *     retryCount: 0,
 *     maxRetries: 3,
 *     retryHistory: [],
 *     createdAt: new Date(),
 *     updatedAt: new Date(),
 *     status: "pending"
 *   };
 *   yield* dlqStore.set("dlq_123", item);
 *
 *   // Retrieve with type safety
 *   const retrieved = yield* dlqStore.get("dlq_123");
 *   return retrieved.status;
 * });
 * ```
 */
export class DeadLetterQueueKVStore extends Context.Tag(
  "DeadLetterQueueKVStore",
)<DeadLetterQueueKVStore, KvStore<DeadLetterItem>>() {}

/**
 * Effect Layer that creates the DeadLetterQueueKVStore from a BaseKvStore.
 *
 * This layer automatically wires up JSON serialization for DeadLetterItem objects
 * with the "uploadista:dlq:" key prefix.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const dlqStore = yield* DeadLetterQueueKVStore;
 *   // Use the store...
 * }).pipe(
 *   Effect.provide(deadLetterQueueKvStore),
 *   Effect.provide(baseStoreLayer)
 * );
 * ```
 */
export const deadLetterQueueKvStore = Layer.effect(
  DeadLetterQueueKVStore,
  Effect.gen(function* () {
    const baseStore = yield* BaseKvStoreService;
    return new TypedKvStore<DeadLetterItem>(
      baseStore,
      "uploadista:dlq:",
      jsonSerializer.serialize,
      jsonSerializer.deserialize,
    );
  }),
);
