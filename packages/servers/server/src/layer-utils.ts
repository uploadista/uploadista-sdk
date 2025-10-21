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
import type { GenerateId } from "@uploadista/core/utils";
import { Layer } from "effect";

/**
 * Configuration for creating upload server layers.
 * Specifies all dependencies needed by the upload server Effect Layer.
 *
 * @property kvStore - Key-value store for upload metadata
 * @property eventEmitter - Event emitter for upload progress events
 * @property dataStore - File data storage implementation
 * @property bufferedDataStore - Optional buffered storage for performance optimization
 * @property generateId - Optional custom ID generator (uses default if omitted)
 *
 * @example
 * ```typescript
 * import { createUploadServerLayer } from "@uploadista/server";
 *
 * const uploadLayerConfig: UploadServerLayerConfig = {
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   dataStore: s3DataStore,
 * };
 * ```
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
 * Configuration for creating flow server layers.
 * Specifies all dependencies needed by the flow processing server.
 *
 * @property kvStore - Key-value store for flow job metadata
 * @property eventEmitter - Event emitter for flow progress events
 * @property flowProvider - Factory function for creating flows
 * @property uploadServer - Upload server layer (used by flows for uploads)
 *
 * @example
 * ```typescript
 * import { createFlowServerLayer } from "@uploadista/server";
 *
 * const flowLayerConfig: FlowServerLayerConfig = {
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   flowProvider: createFlowsEffect,
 *   uploadServer: uploadServerLayer,
 * };
 * ```
 */
export interface FlowServerLayerConfig {
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  flowProvider: Layer.Layer<FlowProvider>;
  uploadServer: Layer.Layer<UploadServer>;
}

/**
 * Creates the upload server layer with all dependencies composed.
 * This layer handles file uploads with chunked transfer, resumption, and metadata tracking.
 *
 * The created layer includes:
 * - Upload KV store (metadata tracking)
 * - Data store (file storage)
 * - Event emitter (progress notifications)
 * - Optional buffered data store (performance optimization)
 * - Optional custom ID generator
 *
 * @param config - Upload server layer configuration
 * @returns Effect Layer providing UploadServer
 *
 * @example
 * ```typescript
 * import { createUploadServerLayer } from "@uploadista/server";
 * import { Layer } from "effect";
 *
 * const uploadServerLayer = createUploadServerLayer({
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   dataStore: s3DataStore,
 * });
 *
 * // Use in application
 * const app = Layer.provide(appLogic, uploadServerLayer);
 * ```
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
 * Creates the flow server layer with all dependencies composed.
 * This layer handles file processing workflows with multi-stage pipelines.
 *
 * The created layer includes:
 * - Flow job KV store (job metadata and state)
 * - Event emitter (progress notifications)
 * - Flow provider (flow definitions)
 * - Upload server (for uploads within flows)
 *
 * @param config - Flow server layer configuration
 * @returns Effect Layer providing FlowServer
 *
 * @example
 * ```typescript
 * import { createFlowServerLayer } from "@uploadista/server";
 * import { Layer } from "effect";
 *
 * const flowServerLayer = createFlowServerLayer({
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   flowProvider: createFlowsEffect,
 *   uploadServer: uploadServerLayer,
 * });
 *
 * // Use in application
 * const app = Layer.provide(appLogic, flowServerLayer);
 * ```
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
