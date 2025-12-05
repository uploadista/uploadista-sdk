import { Effect, Layer, Stream } from "effect";
import type { UploadistaError } from "../errors";
import type { InputFile, UploadFile, WebSocketConnection } from "../types";
import {
  DEFAULT_STREAMING_CONFIG,
  type DataStoreCapabilities,
  type StreamingConfig,
} from "../types/data-store";
import { UploadServer } from "../upload";

/**
 * Mock UploadServer implementation for testing.
 *
 * Provides a complete in-memory implementation of all UploadServer methods
 * suitable for unit and integration tests.
 *
 * @example
 * ```typescript
 * import { TestUploadServer } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const server = yield* UploadServer;
 *   const upload = yield* server.createUpload(inputFile, "client-123");
 *   return upload;
 * }).pipe(Effect.provide(TestUploadServer));
 * ```
 */
export const TestUploadServer = Layer.succeed(
  UploadServer,
  UploadServer.of({
    read: (fileId: string, _clientId: string | null) =>
      Effect.sync(() => {
        // Generate mock file data based on fileId
        const text = `Content of file ${fileId}`;
        return new TextEncoder().encode(text);
      }),
    readStream: (
      fileId: string,
      _clientId: string | null,
      config?: StreamingConfig,
    ) =>
      Effect.sync(() => {
        const effectiveConfig = { ...DEFAULT_STREAMING_CONFIG, ...config };
        // Generate mock file data based on fileId
        const text = `Content of file ${fileId}`;
        const fullData = new TextEncoder().encode(text);

        // Split data into chunks based on chunkSize
        const chunkSize = effectiveConfig.chunkSize;
        const chunks: Uint8Array[] = [];
        for (let i = 0; i < fullData.length; i += chunkSize) {
          chunks.push(fullData.slice(i, i + chunkSize));
        }

        // Return as a stream of chunks
        return Stream.fromIterable(chunks);
      }),
    uploadStream: (
      file: Omit<InputFile, "size"> & { size?: number; sizeHint?: number },
      _clientId: string | null,
      stream: Stream.Stream<Uint8Array, UploadistaError>,
    ) =>
      Effect.gen(function* () {
        // Collect stream to calculate total size
        const chunks: Uint8Array[] = [];
        yield* Stream.runForEach(stream, (chunk) =>
          Effect.sync(() => {
            chunks.push(chunk);
          }),
        );

        const totalSize = chunks.reduce((acc, chunk) => acc + chunk.length, 0);

        // Parse existing metadata
        const existingMetadata =
          typeof file.metadata === "string"
            ? JSON.parse(file.metadata)
            : file.metadata || {};

        // Extract extension from fileName
        const extension = file.fileName
          ? file.fileName.split(".").pop()
          : existingMetadata.extension;

        // Create new UploadFile with final size
        const uploadId = `stream-uploaded-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        return {
          id: uploadId,
          offset: totalSize,
          size: totalSize,
          storage: {
            id: file.storageId,
            type: "memory",
          },
          metadata: {
            ...existingMetadata,
            mimeType: file.type,
            type: file.type,
            "content-type": file.type,
            fileName: file.fileName,
            originalName: file.fileName,
            name: file.fileName,
            extension,
          },
          url: `http://test-storage/${uploadId}`,
          creationDate: new Date().toISOString(),
        } satisfies UploadFile;
      }),
    upload: (file, _clientId, stream) =>
      Effect.gen(function* () {
        // Read stream to completion
        const reader = stream.getReader();
        let totalSize = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = yield* Effect.promise(() => reader.read());
          if (done) break;
          if (value) {
            chunks.push(value);
            totalSize += value.byteLength;
          }
        }

        // Parse existing metadata
        const existingMetadata =
          typeof file.metadata === "string"
            ? JSON.parse(file.metadata)
            : file.metadata || {};

        // Extract extension from fileName
        const extension = file.fileName
          ? file.fileName.split(".").pop()
          : existingMetadata.extension;

        // Create new UploadFile with merged metadata
        return {
          id: `uploaded-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          offset: totalSize,
          size: totalSize,
          storage: {
            id: file.storageId,
            type: "memory",
          },
          metadata: {
            ...existingMetadata,
            // Update with InputFile type and fileName
            mimeType: file.type,
            type: file.type,
            "content-type": file.type,
            fileName: file.fileName,
            originalName: file.fileName,
            name: file.fileName,
            extension,
          },
          creationDate: new Date().toISOString(),
        } satisfies UploadFile;
      }),
    delete: (_fileId: string, _clientId: string | null) => Effect.void,
    createUpload: (file: InputFile, _clientId: string | null) =>
      Effect.succeed({
        id: `uploaded-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        offset: 0,
        size: 0,
        storage: { id: file.storageId, type: "memory" },
        metadata:
          typeof file.metadata === "string"
            ? JSON.parse(file.metadata)
            : file.metadata,
      } satisfies UploadFile),
    uploadChunk: (
      uploadId: string,
      _clientId: string | null,
      chunk: ReadableStream,
    ) =>
      Effect.gen(function* () {
        // Read stream to completion
        const reader = chunk.getReader();
        let totalSize = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = yield* Effect.promise(() => reader.read());
          if (done) break;
          if (value) {
            chunks.push(value);
            totalSize += value.byteLength;
          }
        }
        return {
          id: uploadId,
          offset: totalSize,
          size: totalSize,
          storage: { id: "test-storage", type: "memory" },
          metadata: { mimeType: "application/octet-stream", extension: "bin" },
          creationDate: new Date().toISOString(),
        } satisfies UploadFile;
      }),
    getCapabilities: (_storageId: string, _clientId: string | null) =>
      Effect.succeed({
        supportsParallelUploads: true,
        supportsConcatenation: true,
        supportsDeferredLength: true,
        supportsResumableUploads: true,
        supportsTransactionalUploads: false,
        supportsStreamingRead: true,
        supportsStreamingWrite: true,
        maxConcurrentUploads: 10,
        minChunkSize: 5 * 1024 * 1024, // 5MB
        maxChunkSize: 100 * 1024 * 1024, // 100MB
        maxParts: 10000,
        optimalChunkSize: 10 * 1024 * 1024, // 10MB
        requiresOrderedChunks: false,
        requiresMimeTypeValidation: false,
      } satisfies DataStoreCapabilities),
    uploadFromUrl: (
      inputFile: InputFile,
      _clientId: string | null,
      url: string,
    ) =>
      Effect.succeed({
        id: `uploaded-from-url-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        offset: 0,
        size: 0,
        storage: { id: inputFile.storageId, type: "memory" },
        metadata:
          typeof inputFile.metadata === "string"
            ? JSON.parse(inputFile.metadata)
            : inputFile.metadata,
        url,
        creationDate: new Date().toISOString(),
      } satisfies UploadFile),
    getUpload: (uploadId: string) =>
      Effect.succeed({
        id: uploadId,
        offset: 0,
        size: 1024,
        storage: {
          id: "test-storage",
          type: "memory",
        },
        metadata: {
          mimeType: "text/plain",
          originalName: `file-${uploadId}.txt`,
          extension: "txt",
        },
        creationDate: new Date().toISOString(),
      } satisfies UploadFile),
    subscribeToUploadEvents: (
      _uploadId: string,
      _connection: WebSocketConnection,
    ) => Effect.void,
    unsubscribeFromUploadEvents: (_uploadId: string) => Effect.void,
  }),
);
