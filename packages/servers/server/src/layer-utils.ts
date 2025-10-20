import type { FlowProvider } from "@uploadista/core/flow";
import { flowServer } from "@uploadista/core/flow";
import {
  type BaseEventEmitterService,
  type BaseKvStoreService,
  flowEventEmitter,
  flowJobKvStore,
  type UploadFileDataStore,
  type UploadFileDataStores,
  type UploadFileKVStore,
  uploadEventEmitter,
  uploadFileKvStore,
} from "@uploadista/core/types";
import { type UploadServer, uploadServer } from "@uploadista/core/upload";
import type { GenerateId } from "@uploadista/core/utils/generate-id";
import { Layer } from "effect";

/**
 * Configuration for creating upload server layers
 */
export interface UploadServerLayerConfig {
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  dataStore: Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>;
  bufferedDataStore?: Layer.Layer<
    UploadFileDataStore,
    never,
    UploadFileKVStore
  >;
  generateId?: Layer.Layer<GenerateId>;
}

/**
 * Configuration for creating flow server layers
 */
export interface FlowServerLayerConfig {
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  flowProvider: Layer.Layer<FlowProvider>;
  uploadServer: Layer.Layer<UploadServer>;
}

/**
 * Creates the upload server layer with all dependencies
 */
export const createUploadServerLayer = ({
  kvStore,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  generateId,
}: UploadServerLayerConfig) => {
  // Set up upload server dependencies
  const uploadFileKVStoreLayer = Layer.provide(uploadFileKvStore, kvStore);
  const uploadDataStoreLayer = Layer.provide(dataStore, uploadFileKVStoreLayer);
  const uploadBufferedDataStoreLayer = bufferedDataStore
    ? Layer.provide(bufferedDataStore, uploadFileKVStoreLayer)
    : Layer.empty;
  const uploadEventEmitterLayer = Layer.provide(
    uploadEventEmitter,
    eventEmitter,
  );

  const uploadServerLayers = Layer.mergeAll(
    uploadDataStoreLayer,
    uploadFileKVStoreLayer,
    uploadEventEmitterLayer,
    ...(generateId ? [generateId] : []),
    uploadBufferedDataStoreLayer,
  );

  return Layer.provide(uploadServer, uploadServerLayers);
};

/**
 * Creates the flow server layer with all dependencies
 */
export const createFlowServerLayer = ({
  kvStore,
  eventEmitter,
  flowProvider,
  uploadServer,
}: FlowServerLayerConfig) => {
  // Set up flow server dependencies
  const flowJobKVStoreLayer = Layer.provide(flowJobKvStore, kvStore);
  const flowEventEmitterLayer = Layer.provide(flowEventEmitter, eventEmitter);

  const flowServerLayers = Layer.mergeAll(
    flowProvider,
    flowEventEmitterLayer,
    flowJobKVStoreLayer,
    uploadServer,
  );

  return Layer.provide(flowServer, flowServerLayers);
};
