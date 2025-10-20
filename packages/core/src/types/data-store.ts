import { Context, Effect, Layer, type Stream } from "effect";
import { UploadistaError } from "../errors/uploadista-error";
import type { UploadFileKVStore } from "./kv-store";
import type { UploadFile } from "./upload-file";

export type DataStoreWriteOptions = {
  file_id: string;
  stream: Stream.Stream<Uint8Array, UploadistaError>;
  offset: number;
};

export type UploadStrategy = "single" | "parallel";

export type DataStoreCapabilities = {
  supportsParallelUploads: boolean;
  supportsConcatenation: boolean;
  supportsDeferredLength: boolean;
  supportsResumableUploads: boolean;
  supportsTransactionalUploads: boolean;
  maxConcurrentUploads?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  maxParts?: number;
  optimalChunkSize?: number;
  requiresOrderedChunks: boolean;
  requiresMimeTypeValidation?: boolean;
  maxValidationSize?: number;
};

export type DataStore<TData = unknown> = {
  readonly bucket?: string;
  readonly path?: string;
  readonly create: (file: TData) => Effect.Effect<TData, UploadistaError>;
  readonly remove: (file_id: string) => Effect.Effect<void, UploadistaError>;
  readonly read: (
    file_id: string,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
  readonly write: (
    options: DataStoreWriteOptions,
    dependencies: {
      onProgress?: (chunkSize: number) => void;
    },
  ) => Effect.Effect<number, UploadistaError>;
  readonly deleteExpired?: Effect.Effect<number, UploadistaError>;
  readonly getCapabilities: () => DataStoreCapabilities;
  readonly validateUploadStrategy: (
    strategy: UploadStrategy,
  ) => Effect.Effect<boolean, never>;
};

export class UploadFileDataStore extends Context.Tag("UploadFileDataStore")<
  UploadFileDataStore,
  DataStore<UploadFile>
>() {}

export class BufferedUploadFileDataStore extends Context.Tag(
  "BufferedUploadFileDataStore",
)<BufferedUploadFileDataStore, DataStore<UploadFile>>() {}

export type UploadFileDataStoresShape = {
  getDataStore: (
    storageId: string,
    clientId: string | null,
  ) => Effect.Effect<DataStore<UploadFile>, UploadistaError>;
  bufferedDataStore: Effect.Effect<
    DataStore<UploadFile> | undefined,
    UploadistaError
  >;
};

export class UploadFileDataStores extends Context.Tag("UploadFileDataStores")<
  UploadFileDataStores,
  UploadFileDataStoresShape
>() {}

/**
 * Simplified dataStore configuration for adapters.
 * Can be a single store, multiple stores with routing, an Effect that resolves to a store, or a Layer.
 */
export type DataStoreConfig =
  | DataStore<UploadFile>
  | Effect.Effect<DataStore<UploadFile>, never, UploadFileKVStore>
  | {
      stores: Record<
        string,
        | DataStore<UploadFile>
        | Effect.Effect<DataStore<UploadFile>, never, UploadFileKVStore>
      >;
      default?: string;
    }
  | Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>;

export const isDataStore = (
  config: DataStoreConfig,
): config is DataStore<UploadFile> => {
  return "create" in config && "write" in config;
};

/**
 * Creates a Layer from simplified DataStoreConfig.
 * Handles single store, multiple stores, Effects that resolve to stores, or passes through existing Layer.
 */
export const createDataStoreLayer = async (
  config: DataStoreConfig,
): Promise<Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>> => {
  // Already a Layer, return as-is
  if (Layer.isLayer(config)) {
    return config as Layer.Layer<
      UploadFileDataStores,
      never,
      UploadFileKVStore
    >;
  }

  // Check if it's an Effect
  if (Effect.isEffect(config)) {
    return Layer.effect(
      UploadFileDataStores,
      Effect.gen(function* () {
        const dataStore = config as Effect.Effect<
          DataStore<UploadFile>,
          never,
          UploadFileKVStore
        >;
        const resolvedStore = yield* dataStore;
        return {
          getDataStore: (_storageId: string) => Effect.succeed(resolvedStore),
          bufferedDataStore: Effect.succeed(undefined),
        };
      }),
    );
  }

  // Single store (most common case)
  if (isDataStore(config)) {
    const store = config as DataStore<UploadFile>;
    return Layer.succeed(UploadFileDataStores, {
      getDataStore: (_storageId: string) => Effect.succeed(store),
      bufferedDataStore: Effect.succeed(undefined),
    });
  }

  // Multiple stores with routing
  const multiConfig = config as {
    stores: Record<
      string,
      DataStore<UploadFile> | Effect.Effect<DataStore<UploadFile>>
    >;
    default?: string;
  };

  const defaultKey = multiConfig.default || Object.keys(multiConfig.stores)[0];

  // Resolve any Effects in the stores
  const resolvedStores: Record<string, DataStore<UploadFile>> = {};
  for (const [key, storeOrEffect] of Object.entries(multiConfig.stores)) {
    if ("pipe" in storeOrEffect && !("create" in storeOrEffect)) {
      resolvedStores[key] = await Effect.runPromise(
        storeOrEffect as Effect.Effect<DataStore<UploadFile>>,
      );
    } else {
      resolvedStores[key] = storeOrEffect as DataStore<UploadFile>;
    }
  }

  return Layer.succeed(UploadFileDataStores, {
    getDataStore: (storageId: string) => {
      const store =
        resolvedStores[storageId] ||
        (defaultKey ? resolvedStores[defaultKey] : undefined);
      if (store) {
        return Effect.succeed(store);
      }
      return Effect.fail(UploadistaError.fromCode("FILE_NOT_FOUND"));
    },
    bufferedDataStore: Effect.succeed(undefined),
  });
};
