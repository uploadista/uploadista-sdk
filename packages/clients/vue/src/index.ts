/**
 * Uploadista Vue Client
 *
 * Vue 3 composables and components for file uploads with the Uploadista platform.
 *
 * @example
 * ```typescript
 * import { createUploadistaPlugin } from '@uploadista/vue'
 * import { UploadZone, FlowUploadZone } from '@uploadista/vue'
 *
 * // Install plugin in your Vue app
 * const app = createApp(App)
 * app.use(createUploadistaPlugin({
 *   client: uploadClient
 * }))
 * ```
 */

// Re-export all components
export * from "./components";

// Re-export composables with explicit types to avoid conflicts
// Types with potential conflicts are renamed for clarity
export {
  // Event composables
  isFlowEvent,
  isUploadEvent,
  useUploadistaEvents,
  useFlowEvents,
  useUploadEvents,
  // Plugin
  createUploadistaPlugin,
  UPLOADISTA_CLIENT_KEY,
  // Drag and drop
  useDragDrop,
  // Flow composables
  useFlow,
  // Multi-upload
  useMultiFlowUpload,
  useMultiUpload,
  // Upload composables
  useUpload,
  // Client
  useUploadistaClient,
  // Metrics
  useUploadMetrics,
} from "./composables";

// Re-export types from composables
export type {
  // Event types
  UseFlowEventsOptions,
  UploadFailedEventData,
  UploadFileEventData,
  UploadProgressEventData,
  UploadValidationFailedEventData,
  UploadValidationSuccessEventData,
  UploadValidationWarningEventData,
  UseUploadEventsOptions,
  // Plugin types
  UploadistaPluginOptions,
  // Drag and drop types
  DragDropOptions,
  DragDropState,
  // Flow types
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  UseFlowReturn,
  // Multi-upload types - rename to avoid conflict
  MultiUploadOptions,
  MultiUploadState,
  UploadItem as MultiUploadItem,
  // Upload types - rename to avoid conflict
  ChunkMetrics,
  PerformanceInsights,
  UploadInput,
  UploadSessionMetrics,
  UploadState,
  UploadStatus as UploadStatusType,
  // Client types
  UseUploadistaClientReturn,
  // Metrics types
  FileUploadMetrics,
  UseUploadMetricsOptions,
} from "./composables";

export * from "./providers";
// Re-export utilities
export * from "./utils";
