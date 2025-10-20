import { Context, Effect, Layer } from "effect";
import type { UploadistaError } from "../errors";
import type {
  DataStore,
  DataStoreCapabilities,
  EventEmitter,
  InputFile,
  KvStore,
  Middleware,
  UploadEvent,
  UploadFile,
  WebSocketConnection,
} from "../types";
import {
  UploadEventEmitter,
  UploadFileDataStores,
  UploadFileKVStore,
} from "../types";
import { GenerateId, type GenerateIdShape } from "../utils/generate-id";
import { createUpload } from "./create-upload";
import { uploadChunk } from "./upload-chunk";
import { arrayBuffer, fetchFile } from "./upload-url";

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

// Effect-based UploadServer type
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
  read: (
    uploadId: string,
    clientId: string | null,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
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
export class UploadServer extends Context.Tag("UploadServer")<
  UploadServer,
  UploadServerShape
>() {}

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

export const uploadServer = Layer.effect(UploadServer, createUploadServer());
