import { Context, Effect, Layer, type Stream } from "effect";
import { UploadistaError } from "../errors/uploadista-error";
import type { UploadFileKVStore } from "./kv-store";
import type { UploadFile } from "./upload-file";

/**
 * Options for writing data to a DataStore.
 *
 * @property file_id - Unique identifier for the file being written
 * @property stream - Stream of byte chunks to write to storage
 * @property offset - Byte offset where writing should begin (for resumable uploads)
 */
export type DataStoreWriteOptions = {
  file_id: string;
  stream: Stream.Stream<Uint8Array, UploadistaError>;
  offset: number;
};

/**
 * Upload strategy type indicating how chunks are uploaded.
 *
 * - `single`: Upload file in a single request (traditional upload)
 * - `parallel`: Upload file chunks in parallel (for large files)
 */
export type UploadStrategy = "single" | "parallel";

/**
 * Capabilities and constraints of a DataStore implementation.
 *
 * This type describes what features a storage backend supports and what
 * limitations it has. Use this to determine the optimal upload strategy
 * and validate client requests.
 *
 * @property supportsParallelUploads - Can upload chunks in parallel (e.g., S3 multipart)
 * @property supportsConcatenation - Can concatenate multiple uploads into one file
 * @property supportsDeferredLength - Can start upload without knowing final size
 * @property supportsResumableUploads - Can resume interrupted uploads from last offset
 * @property supportsTransactionalUploads - Guarantees atomic upload success/failure
 * @property maxConcurrentUploads - Maximum parallel upload parts (if parallel supported)
 * @property minChunkSize - Minimum size in bytes for each chunk (except last)
 * @property maxChunkSize - Maximum size in bytes for each chunk
 * @property maxParts - Maximum number of parts in a multipart upload
 * @property optimalChunkSize - Recommended chunk size for best performance
 * @property requiresOrderedChunks - Must receive chunks in sequential order
 * @property requiresMimeTypeValidation - Validates file MIME type matches declaration
 * @property maxValidationSize - Maximum file size for MIME type validation
 *
 * @example
 * ```typescript
 * const capabilities = dataStore.getCapabilities();
 *
 * if (capabilities.supportsParallelUploads && fileSize > 10_000_000) {
 *   // Use parallel upload for large files
 *   const chunkSize = capabilities.optimalChunkSize || 5_242_880; // 5MB default
 *   uploadInParallel(file, chunkSize);
 * } else {
 *   // Use single upload
 *   uploadAsSingleChunk(file);
 * }
 * ```
 */
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

/**
 * Core interface for all storage backend implementations.
 *
 * DataStore abstracts file storage operations across different backends
 * (S3, Azure Blob, GCS, local filesystem, etc.). All storage adapters
 * must implement this interface.
 *
 * @template TData - The data type stored (typically UploadFile)
 *
 * @property bucket - Optional storage bucket or container name
 * @property path - Optional base path prefix for all stored files
 * @property create - Creates a new file record in storage
 * @property remove - Deletes a file from storage
 * @property read - Reads complete file contents as bytes
 * @property write - Writes data stream to storage at specified offset
 * @property deleteExpired - Optional cleanup of expired files
 * @property getCapabilities - Returns storage backend capabilities
 * @property validateUploadStrategy - Validates if strategy is supported
 *
 * @example
 * ```typescript
 * // Implement a custom DataStore
 * const myDataStore: DataStore<UploadFile> = {
 *   bucket: "my-uploads",
 *   path: "files/",
 *
 *   create: (file) => Effect.gen(function* () {
 *     // Store file metadata
 *     yield* saveMetadata(file);
 *     return file;
 *   }),
 *
 *   write: ({ file_id, stream, offset }, { onProgress }) => Effect.gen(function* () {
 *     // Write chunks to storage
 *     let bytesWritten = offset;
 *     yield* Stream.runForEach(stream, (chunk) => Effect.sync(() => {
 *       writeChunk(file_id, chunk, bytesWritten);
 *       bytesWritten += chunk.byteLength;
 *       onProgress?.(chunk.byteLength);
 *     }));
 *     return bytesWritten;
 *   }),
 *
 *   read: (file_id) => Effect.gen(function* () {
 *     // Read complete file
 *     const data = yield* readFromStorage(file_id);
 *     return data;
 *   }),
 *
 *   remove: (file_id) => Effect.gen(function* () {
 *     yield* deleteFromStorage(file_id);
 *   }),
 *
 *   getCapabilities: () => ({
 *     supportsParallelUploads: true,
 *     supportsConcatenation: false,
 *     supportsDeferredLength: true,
 *     supportsResumableUploads: true,
 *     supportsTransactionalUploads: false,
 *     maxConcurrentUploads: 10,
 *     optimalChunkSize: 5_242_880, // 5MB
 *     requiresOrderedChunks: false,
 *   }),
 *
 *   validateUploadStrategy: (strategy) =>
 *     Effect.succeed(strategy === "parallel" || strategy === "single"),
 * };
 * ```
 */
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
  readonly deleteExpired?: () => Effect.Effect<number, UploadistaError>;
  readonly getCapabilities: () => DataStoreCapabilities;
  readonly validateUploadStrategy: (
    strategy: UploadStrategy,
  ) => Effect.Effect<boolean, never>;
};

/**
 * Effect-TS context tag for UploadFile DataStore.
 *
 * Use this tag to access the primary DataStore in an Effect context.
 * This is the standard storage backend for uploaded files.
 *
 * @example
 * ```typescript
 * const uploadEffect = Effect.gen(function* () {
 *   const dataStore = yield* UploadFileDataStore;
 *   const file = yield* dataStore.create(uploadFile);
 *   return file;
 * });
 * ```
 */
export class UploadFileDataStore extends Context.Tag("UploadFileDataStore")<
  UploadFileDataStore,
  DataStore<UploadFile>
>() {}

/**
 * Effect-TS context tag for buffered/temporary DataStore.
 *
 * This is an optional storage backend used for temporary or intermediate files
 * during flow processing. Not all implementations provide a buffered store.
 *
 * @example
 * ```typescript
 * const processEffect = Effect.gen(function* () {
 *   const bufferedStore = yield* BufferedUploadFileDataStore;
 *   // Store intermediate processing results
 *   const tempFile = yield* bufferedStore.create(intermediateFile);
 *   return tempFile;
 * });
 * ```
 */
export class BufferedUploadFileDataStore extends Context.Tag(
  "BufferedUploadFileDataStore",
)<BufferedUploadFileDataStore, DataStore<UploadFile>>() {}

/**
 * Service interface for managing multiple DataStore instances.
 *
 * This allows routing files to different storage backends based on
 * storageId (e.g., different S3 buckets, Azure containers, or storage tiers).
 *
 * @property getDataStore - Retrieves the appropriate DataStore for a given storage ID
 * @property bufferedDataStore - Optional temporary storage for intermediate files
 */
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

/**
 * Effect-TS context tag for the DataStore routing service.
 *
 * Provides access to multiple DataStore instances with routing logic.
 *
 * @example
 * ```typescript
 * const uploadEffect = Effect.gen(function* () {
 *   const dataStores = yield* UploadFileDataStores;
 *   // Route to specific storage based on storageId
 *   const dataStore = yield* dataStores.getDataStore("s3-production", clientId);
 *   const file = yield* dataStore.create(uploadFile);
 *   return file;
 * });
 * ```
 */
export class UploadFileDataStores extends Context.Tag("UploadFileDataStores")<
  UploadFileDataStores,
  UploadFileDataStoresShape
>() {}

/**
 * Simplified DataStore configuration for easy setup.
 *
 * This type allows flexible configuration:
 * - Single DataStore instance
 * - Multiple named stores with routing
 * - Effect that resolves to a DataStore
 * - Pre-built Effect Layer
 *
 * @example
 * ```typescript
 * // Single store
 * const config: DataStoreConfig = s3DataStore;
 *
 * // Multiple stores with routing
 * const config: DataStoreConfig = {
 *   stores: {
 *     "s3-prod": s3ProdStore,
 *     "s3-dev": s3DevStore,
 *     "local": localFileStore,
 *   },
 *   default: "s3-prod"
 * };
 *
 * // Effect that creates a store
 * const config: DataStoreConfig = Effect.gen(function* () {
 *   const kvStore = yield* UploadFileKVStore;
 *   return s3Store(kvStore);
 * });
 *
 * // Pre-built Layer
 * const config: DataStoreConfig = Layer.succeed(UploadFileDataStores, {...});
 * ```
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

/**
 * Type guard to check if a value is a DataStore instance.
 *
 * @param config - The value to check
 * @returns True if the value is a DataStore
 *
 * @example
 * ```typescript
 * if (isDataStore(config)) {
 *   const capabilities = config.getCapabilities();
 * }
 * ```
 */
export const isDataStore = (
  config: DataStoreConfig,
): config is DataStore<UploadFile> => {
  return "create" in config && "write" in config;
};

/**
 * Creates an Effect Layer from simplified DataStoreConfig.
 *
 * This function converts any DataStoreConfig format into a proper Effect Layer
 * that can be provided to the UploadFileDataStores context tag.
 *
 * It handles:
 * - Single DataStore: Wraps in a Layer that always returns that store
 * - Multiple stores: Creates routing logic with optional default
 * - Effect<DataStore>: Executes the Effect and wraps the result
 * - Layer: Returns as-is
 *
 * @param config - The DataStore configuration
 * @returns A Layer that provides UploadFileDataStores service
 *
 * @example
 * ```typescript
 * // Create from single store
 * const layer = await createDataStoreLayer(s3DataStore);
 *
 * // Create from multiple stores
 * const layer = await createDataStoreLayer({
 *   stores: {
 *     "production": s3Store,
 *     "development": localStore,
 *   },
 *   default: "development"
 * });
 *
 * // Use the layer
 * const program = Effect.gen(function* () {
 *   const stores = yield* UploadFileDataStores;
 *   const store = yield* stores.getDataStore("production", null);
 *   return store;
 * }).pipe(Effect.provide(layer));
 * ```
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
