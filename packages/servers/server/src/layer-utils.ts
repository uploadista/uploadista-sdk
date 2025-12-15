import type { FlowProvider } from "@uploadista/core/flow";
import { flowEngine } from "@uploadista/core/flow";
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
import { type UploadEngine, uploadEngine } from "@uploadista/core/upload";
import type { GenerateId } from "@uploadista/core/utils";
import { Layer } from "effect";

/**
 * Configuration for creating upload engine layers.
 * Specifies all dependencies needed by the upload engine Effect Layer.
 *
 * @property kvStore - Key-value store for upload metadata
 * @property eventEmitter - Event emitter for upload progress events
 * @property dataStore - File data storage implementation
 * @property bufferedDataStore - Optional buffered storage for performance optimization
 * @property generateId - Optional custom ID generator (uses default if omitted)
 *
 * @example
 * ```typescript
 * import { createUploadEngineLayer } from "@uploadista/server";
 *
 * const uploadLayerConfig: UploadEngineLayerConfig = {
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   dataStore: s3DataStore,
 * };
 * ```
 */
export interface UploadEngineLayerConfig {
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
 * @property uploadEngine - Upload engine layer (used by flows for uploads)
 *
 * @example
 * ```typescript
 * import { createFlowServerLayer } from "@uploadista/server";
 *
 * const flowLayerConfig: FlowServerLayerConfig = {
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   flowProvider: createFlowsEffect,
 *   uploadEngine: uploadEngineLayer,
 * };
 * ```
 */
export interface FlowServerLayerConfig {
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  flowProvider: Layer.Layer<FlowProvider>;
  uploadEngine: Layer.Layer<UploadEngine>;
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
 * @returns Effect Layer providing UploadEngine
 *
 * @example
 * ```typescript
 * import { createUploadEngineLayer } from "@uploadista/server";
 * import { Layer } from "effect";
 *
 * const uploadEngineLayer = createUploadEngineLayer({
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter,
 *   dataStore: s3DataStore,
 * });
 *
 * // Use in application
 * const app = Layer.provide(appLogic, uploadEngineLayer);
 * ```
 */
export const createUploadEngineLayer = ({
  kvStore,
  eventEmitter,
  dataStore,
  bufferedDataStore,
  generateId,
}: UploadEngineLayerConfig) => {
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

  const uploadEngineLayers = Layer.mergeAll(
    uploadDataStoreLayer,
    uploadFileKVStoreLayer,
    uploadEventEmitterLayer,
    ...(generateId ? [generateId] : []),
    uploadBufferedDataStoreLayer,
  );

  return Layer.provide(uploadEngine, uploadEngineLayers);
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
 *   uploadEngine: uploadEngineLayer,
 * });
 *
 * // Use in application
 * const app = Layer.provide(appLogic, flowServerLayer);
 * ```
 */
export const createFlowEngineLayer = ({
  kvStore,
  eventEmitter,
  flowProvider,
  uploadEngine,
}: FlowServerLayerConfig) => {
  // Set up flow server dependencies
  const flowJobKVStoreLayer = Layer.provide(flowJobKvStore, kvStore);
  const flowEventEmitterLayer = Layer.provide(flowEventEmitter, eventEmitter);

  const flowEngineLayers = Layer.mergeAll(
    flowProvider,
    flowEventEmitterLayer,
    flowJobKVStoreLayer,
    uploadEngine,
  );

  return Layer.provide(flowEngine, flowEngineLayers);
};
