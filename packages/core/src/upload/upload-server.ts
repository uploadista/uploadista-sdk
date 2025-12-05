import { Context, Effect, Layer, Stream } from "effect";
import type { UploadistaError } from "../errors";
import type {
  DataStore,
  DataStoreCapabilities,
  EventEmitter,
  InputFile,
  KvStore,
  Middleware,
  StreamingConfig,
  UploadEvent,
  UploadFile,
  WebSocketConnection,
} from "../types";
import {
  UploadEventEmitter,
  UploadEventType,
  UploadFileDataStores,
  UploadFileKVStore,
} from "../types";
import { GenerateId, type GenerateIdShape } from "../utils/generate-id";
import { createUpload } from "./create-upload";
import { uploadChunk } from "./upload-chunk";
import { arrayBuffer, fetchFile } from "./upload-url";

/**
 * Legacy configuration options for UploadServer.
 *
 * @deprecated Use Effect Layers instead of this configuration object.
 * This type is kept for backward compatibility.
 *
 * @property dataStore - DataStore instance or factory function
 * @property kvStore - KV store for upload metadata
 * @property eventEmitter - Event emitter for upload progress
 * @property generateId - Optional ID generator (defaults to UUID)
 * @property middlewares - Optional request middlewares
 * @property withTracing - Enable Effect tracing for debugging
 */
export type UploadServerOptions = {
  dataStore:
    | ((storageId: string) => Promise<DataStore<UploadFile>>)
    | DataStore<UploadFile>;
  kvStore: KvStore<UploadFile>;
  eventEmitter: EventEmitter<UploadEvent>;
  generateId?: GenerateIdShape;
  middlewares?: Middleware[];
  withTracing?: boolean;
};

/**
 * UploadServer service interface.
 *
 * This is the core upload handling service that provides all file upload operations.
 * It manages upload lifecycle, resumable uploads, progress tracking, and storage integration.
 *
 * All operations return Effect types for composable, type-safe error handling.
 *
 * @property createUpload - Initiates a new upload and returns metadata
 * @property uploadChunk - Uploads a chunk of data for an existing upload
 * @property getCapabilities - Returns storage backend capabilities
 * @property upload - Complete upload in one operation (create + upload data)
 * @property uploadFromUrl - Uploads a file from a remote URL
 * @property getUpload - Retrieves upload metadata by ID
 * @property read - Reads the complete uploaded file data
 * @property delete - Deletes an upload and its data
 * @property subscribeToUploadEvents - Subscribes WebSocket to upload progress events
 * @property unsubscribeFromUploadEvents - Unsubscribes from upload events
 *
 * @example
 * ```typescript
 * // Basic upload flow
 * const program = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *
 *   // 1. Create upload
 *   const inputFile: InputFile = {
 *     storageId: "s3-production",
 *     size: 1024000,
 *     type: "image/jpeg",
 *     fileName: "photo.jpg"
 *   };
 *   const upload = yield* server.createUpload(inputFile, "client123");
 *
 *   // 2. Upload chunks
 *   const chunk = new ReadableStream(...);
 *   const updated = yield* server.uploadChunk(upload.id, "client123", chunk);
 *
 *   // 3. Read the uploaded file
 *   const data = yield* server.read(upload.id, "client123");
 *
 *   return upload;
 * });
 *
 * // Upload with WebSocket progress tracking
 * const uploadWithProgress = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *
 *   // Subscribe to progress events
 *   yield* server.subscribeToUploadEvents(uploadId, websocket);
 *
 *   // Upload (events will be emitted automatically)
 *   const result = yield* server.upload(inputFile, clientId, stream);
 *
 *   // Unsubscribe when done
 *   yield* server.unsubscribeFromUploadEvents(uploadId);
 *
 *   return result;
 * });
 *
 * // Upload from URL
 * const urlUpload = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *
 *   const inputFile: InputFile = {
 *     storageId: "s3-production",
 *     size: 0, // Unknown initially
 *     type: "image/png",
 *     fileName: "remote-image.png"
 *   };
 *
 *   const upload = yield* server.uploadFromUrl(
 *     inputFile,
 *     "client123",
 *     "https://example.com/image.png"
 *   );
 *
 *   return upload;
 * });
 * ```
 */
export type UploadServerShape = {
  createUpload: (
    inputFile: InputFile,
    clientId: string | null,
  ) => Effect.Effect<UploadFile, UploadistaError>;
  uploadChunk: (
    uploadId: string,
    clientId: string | null,
    chunk: ReadableStream,
  ) => Effect.Effect<UploadFile, UploadistaError>;
  getCapabilities: (
    storageId: string,
    clientId: string | null,
  ) => Effect.Effect<DataStoreCapabilities, UploadistaError>;
  upload: (
    file: InputFile,
    clientId: string | null,
    stream: ReadableStream,
  ) => Effect.Effect<UploadFile, UploadistaError>;
  uploadFromUrl: (
    inputFile: InputFile,
    clientId: string | null,
    url: string,
  ) => Effect.Effect<UploadFile, UploadistaError>;
  getUpload: (uploadId: string) => Effect.Effect<UploadFile, UploadistaError>;
  /**
   * Reads the complete uploaded file data as bytes (buffered mode).
   * For large files, consider using readStream() for memory efficiency.
   */
  read: (
    uploadId: string,
    clientId: string | null,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
  /**
   * Reads file content as a stream of chunks for memory-efficient processing.
   * Falls back to buffered read if the underlying DataStore doesn't support streaming.
   *
   * @param uploadId - The unique identifier of the upload to read
   * @param clientId - Client identifier for multi-tenant routing
   * @param config - Optional streaming configuration (chunk size)
   * @returns An Effect that resolves to a Stream of byte chunks
   *
   * @example
   * ```typescript
   * const server = yield* UploadServer;
   * const stream = yield* server.readStream(uploadId, clientId, { chunkSize: 65536 });
   * // Process stream chunk by chunk with bounded memory
   * yield* Stream.runForEach(stream, (chunk) => processChunk(chunk));
   * ```
   */
  readStream: (
    uploadId: string,
    clientId: string | null,
    config?: StreamingConfig,
  ) => Effect.Effect<Stream.Stream<Uint8Array, UploadistaError>, UploadistaError>;
  /**
   * Uploads file content from a stream with unknown final size.
   * Creates upload with deferred length, streams content to storage,
   * and updates the upload record with final size when complete.
   *
   * Falls back to buffered upload if the underlying DataStore
   * doesn't support streaming writes.
   *
   * @param file - Input file configuration (size is optional)
   * @param clientId - Client identifier for multi-tenant routing
   * @param stream - Effect Stream of byte chunks to upload
   * @returns The completed UploadFile with final size
   *
   * @example
   * ```typescript
   * const server = yield* UploadServer;
   * const result = yield* server.uploadStream(
   *   {
   *     storageId: "s3-production",
   *     type: "image/webp",
   *     uploadLengthDeferred: true,
   *     fileName: "optimized.webp",
   *   },
   *   clientId,
   *   transformedStream,
   * );
   * console.log(`Uploaded ${result.size} bytes`);
   * ```
   */
  uploadStream: (
    file: Omit<InputFile, "size"> & { size?: number; sizeHint?: number },
    clientId: string | null,
    stream: Stream.Stream<Uint8Array, UploadistaError>,
  ) => Effect.Effect<UploadFile, UploadistaError>;
  delete: (
    uploadId: string,
    clientId: string | null,
  ) => Effect.Effect<void, UploadistaError>;
  subscribeToUploadEvents: (
    uploadId: string,
    connection: WebSocketConnection,
  ) => Effect.Effect<void, UploadistaError>;
  unsubscribeFromUploadEvents: (
    uploadId: string,
  ) => Effect.Effect<void, UploadistaError>;
};

/**
 * Effect-TS context tag for the UploadServer service.
 *
 * Use this tag to access the UploadServer in an Effect context.
 * The server must be provided via a Layer or dependency injection.
 *
 * @example
 * ```typescript
 * // Access UploadServer in an Effect
 * const uploadEffect = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *   const upload = yield* server.createUpload(inputFile, clientId);
 *   return upload;
 * });
 *
 * // Provide UploadServer layer
 * const program = uploadEffect.pipe(
 *   Effect.provide(uploadServer),
 *   Effect.provide(uploadFileKvStore),
 *   Effect.provide(dataStoreLayer),
 *   Effect.provide(eventEmitterLayer)
 * );
 * ```
 */
export class UploadServer extends Context.Tag("UploadServer")<
  UploadServer,
  UploadServerShape
>() {}

/**
 * Creates the UploadServer implementation.
 *
 * This function constructs the UploadServer service by composing all required
 * dependencies (KV store, data stores, event emitter, ID generator). It implements
 * all upload operations defined in UploadServerShape.
 *
 * The server automatically handles:
 * - Upload lifecycle management (create, resume, complete)
 * - Progress tracking and event emission
 * - Storage backend routing based on storageId
 * - Error handling with proper UploadistaError types
 *
 * @returns An Effect that yields the UploadServerShape implementation
 *
 * @example
 * ```typescript
 * // Create a custom UploadServer layer
 * const myUploadServer = Layer.effect(
 *   UploadServer,
 *   createUploadServer()
 * );
 *
 * // Use in a program
 * const program = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *   // Use server operations...
 * }).pipe(Effect.provide(myUploadServer));
 * ```
 */
export function createUploadServer() {
  return Effect.gen(function* () {
    const kvStore = yield* UploadFileKVStore;
    const eventEmitter = yield* UploadEventEmitter;
    const generateId = yield* GenerateId;
    const dataStoreService = yield* UploadFileDataStores;

    return {
      upload: (
        inputFile: InputFile,
        clientId: string | null,
        stream: ReadableStream,
      ) =>
        Effect.gen(function* () {
          const fileCreated = yield* createUpload(inputFile, clientId, {
            dataStoreService,
            kvStore,
            eventEmitter,
            generateId,
          });
          return yield* uploadChunk(fileCreated.id, clientId, stream, {
            dataStoreService,
            kvStore,
            eventEmitter,
          });
        }),
      uploadFromUrl: (
        inputFile: InputFile,
        clientId: string | null,
        url: string,
      ) =>
        Effect.gen(function* () {
          const response = yield* fetchFile(url);
          const buffer = yield* arrayBuffer(response);

          // Create a readable stream from the buffer
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(buffer));
              controller.close();
            },
          });

          const fileCreated = yield* createUpload(
            { ...inputFile, size: buffer.byteLength },
            clientId,
            {
              dataStoreService,
              kvStore,
              eventEmitter,
              generateId,
            },
          );
          return yield* uploadChunk(fileCreated.id, clientId, stream, {
            dataStoreService,
            kvStore,
            eventEmitter,
          });
        }),
      createUpload: (inputFile: InputFile, clientId: string | null) =>
        Effect.gen(function* () {
          const fileCreated = yield* createUpload(inputFile, clientId, {
            dataStoreService,
            kvStore,
            eventEmitter,
            generateId,
          });
          return fileCreated;
        }),
      uploadChunk: (
        uploadId: string,
        clientId: string | null,
        chunk: ReadableStream,
      ) =>
        Effect.gen(function* () {
          const file = yield* uploadChunk(uploadId, clientId, chunk, {
            dataStoreService,
            kvStore,
            eventEmitter,
          });
          return file;
        }),
      getUpload: (uploadId: string) =>
        Effect.gen(function* () {
          const file = yield* kvStore.get(uploadId);
          return file;
        }),
      read: (uploadId: string, clientId: string | null) =>
        Effect.gen(function* () {
          const upload = yield* kvStore.get(uploadId);
          const dataStore = yield* dataStoreService.getDataStore(
            upload.storage.id,
            clientId,
          );
          return yield* dataStore.read(uploadId);
        }),
      readStream: (
        uploadId: string,
        clientId: string | null,
        config?: StreamingConfig,
      ) =>
        Effect.gen(function* () {
          const upload = yield* kvStore.get(uploadId);
          const dataStore = yield* dataStoreService.getDataStore(
            upload.storage.id,
            clientId,
          );

          // Check if the DataStore supports streaming reads
          const capabilities = dataStore.getCapabilities();
          if (capabilities.supportsStreamingRead && dataStore.readStream) {
            // Use native streaming
            yield* Effect.logDebug(
              `Using streaming read for file ${uploadId}`,
            );
            return yield* dataStore.readStream(uploadId, config);
          }

          // Fallback: read entire file and convert to stream
          yield* Effect.logDebug(
            `Falling back to buffered read for file ${uploadId} (streaming not supported)`,
          );
          const bytes = yield* dataStore.read(uploadId);

          // Convert buffered bytes to a single-chunk stream
          return Stream.succeed(bytes);
        }),
      uploadStream: (
        file: Omit<InputFile, "size"> & { size?: number; sizeHint?: number },
        clientId: string | null,
        stream: Stream.Stream<Uint8Array, UploadistaError>,
      ) =>
        Effect.gen(function* () {
          // Get the data store for this storage
          const dataStore = yield* dataStoreService.getDataStore(
            file.storageId,
            clientId,
          );

          // Check if the DataStore supports streaming writes
          const capabilities = dataStore.getCapabilities();

          // Generate upload ID
          const uploadId = yield* generateId.generateId();

          if (capabilities.supportsStreamingWrite && dataStore.writeStream) {
            // Use native streaming write - DO NOT call createUpload as it would
            // create an S3 multipart upload that we won't use (writeStream creates its own)
            yield* Effect.logDebug(
              `Using streaming write for file ${uploadId}`,
            );

            // Parse metadata
            const metadata =
              typeof file.metadata === "string"
                ? JSON.parse(file.metadata)
                : file.metadata || {};

            // Convert metadata to Record<string, string> if present
            const stringMetadata = Object.fromEntries(
              Object.entries(metadata).map(([k, v]) => [k, String(v)]),
            );

            // Create initial upload record in KV store (without creating S3 multipart upload)
            const initialUpload: UploadFile = {
              id: uploadId,
              offset: 0,
              size: file.size ?? 0,
              storage: {
                id: file.storageId,
                type: dataStore.getCapabilities().supportsStreamingWrite
                  ? "streaming"
                  : "default",
              },
              metadata,
              creationDate: new Date().toISOString(),
            };
            yield* kvStore.set(uploadId, initialUpload);

            // Emit started event
            yield* eventEmitter.emit(uploadId, {
              type: UploadEventType.UPLOAD_STARTED,
              data: initialUpload,
            });

            const result = yield* dataStore.writeStream(uploadId, {
              stream,
              contentType: file.type,
              sizeHint: file.sizeHint,
              metadata: stringMetadata,
            });

            // Update the upload record with the final size and URL
            const completedUpload: UploadFile = {
              ...initialUpload,
              size: result.size,
              offset: result.size,
              storage: {
                ...initialUpload.storage,
                path: result.path,
              },
              ...(result.url && { url: result.url }),
            };

            yield* kvStore.set(uploadId, completedUpload);

            // Emit completion event
            yield* eventEmitter.emit(uploadId, {
              type: UploadEventType.UPLOAD_COMPLETE,
              data: completedUpload,
            });

            return completedUpload;
          }

          // Fallback: buffer the stream and use regular upload (which calls createUpload + uploadChunk)
          yield* Effect.logWarning(
            `Falling back to buffered upload for file ${uploadId} (streaming write not supported)`,
          );

          // Collect stream into a buffer
          const chunks: Uint8Array[] = [];
          yield* Stream.runForEach(stream, (chunk) =>
            Effect.sync(() => {
              chunks.push(chunk);
            }),
          );

          // Calculate total size
          const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0);

          // Create a combined buffer
          const buffer = new Uint8Array(totalSize);
          let offset = 0;
          for (const chunk of chunks) {
            buffer.set(chunk, offset);
            offset += chunk.length;
          }

          // Create a readable stream from the buffer
          const readableStream = new ReadableStream({
            start(controller) {
              controller.enqueue(buffer);
              controller.close();
            },
          });

          // For fallback, use the regular flow with createUpload + uploadChunk
          const inputFile: InputFile = {
            ...file,
            size: totalSize,
          };

          const uploadFile = yield* createUpload(inputFile, clientId, {
            dataStoreService,
            kvStore,
            eventEmitter,
            generateId: { generateId: () => Effect.succeed(uploadId) },
          });

          // Use regular uploadChunk
          return yield* uploadChunk(uploadId, clientId, readableStream, {
            dataStoreService,
            kvStore,
            eventEmitter,
          });
        }),
      delete: (uploadId: string, clientId: string | null) =>
        Effect.gen(function* () {
          const upload = yield* kvStore.get(uploadId);
          const dataStore = yield* dataStoreService.getDataStore(
            upload.storage.id,
            clientId,
          );
          yield* dataStore.remove(uploadId);
          yield* kvStore.delete(uploadId);
          return;
        }),
      getCapabilities: (storageId: string, clientId: string | null) =>
        Effect.gen(function* () {
          const dataStore = yield* dataStoreService.getDataStore(
            storageId,
            clientId,
          );
          return dataStore.getCapabilities();
        }),
      subscribeToUploadEvents: (
        uploadId: string,
        connection: WebSocketConnection,
      ) =>
        Effect.gen(function* () {
          yield* eventEmitter.subscribe(uploadId, connection);
        }),
      unsubscribeFromUploadEvents: (uploadId: string) =>
        Effect.gen(function* () {
          yield* eventEmitter.unsubscribe(uploadId);
        }),
    } satisfies UploadServerShape;
  });
}

/**
 * Pre-built UploadServer Effect Layer.
 *
 * This layer provides a ready-to-use UploadServer implementation that can be
 * composed with other layers to build a complete upload system.
 *
 * Required dependencies:
 * - UploadFileKVStore: For storing upload metadata
 * - UploadFileDataStores: For routing to storage backends
 * - UploadEventEmitter: For progress events
 * - GenerateId: For creating upload IDs
 *
 * @example
 * ```typescript
 * // Compose a complete upload system
 * const fullUploadSystem = Layer.mergeAll(
 *   uploadServer,
 *   uploadFileKvStore,
 *   dataStoreLayer,
 *   uploadEventEmitter,
 *   generateIdLayer
 * );
 *
 * // Use in application
 * const app = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *   // Perform uploads...
 * }).pipe(Effect.provide(fullUploadSystem));
 * ```
 */
export const uploadServer = Layer.effect(UploadServer, createUploadServer());
