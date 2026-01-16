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
// Re-export types from composables
export type {
  // Upload types - rename to avoid conflict
  ChunkMetrics,
  // Drag and drop types
  DragDropOptions,
  DragDropState,
  // Metrics types
  FileUploadMetrics,
  // Flow types
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  // Multi-upload types - rename to avoid conflict
  MultiUploadOptions,
  MultiUploadState,
  PerformanceInsights,
  UploadFailedEventData,
  UploadFileEventData,
  UploadInput,
  UploadItem as MultiUploadItem,
  // Plugin types
  UploadistaPluginOptions,
  UploadProgressEventData,
  UploadSessionMetrics,
  UploadState,
  UploadStatus as UploadStatusType,
  UploadValidationFailedEventData,
  UploadValidationSuccessEventData,
  UploadValidationWarningEventData,
  // Event types
  UseFlowEventsOptions,
  UseFlowReturn,
  UseUploadEventsOptions,
  // Client types
  UseUploadistaClientReturn,
  UseUploadMetricsOptions,
} from "./composables";
// Re-export composables with explicit types to avoid conflicts
// Types with potential conflicts are renamed for clarity
export {
  // Plugin
  createUploadistaPlugin,
  // Event composables
  isFlowEvent,
  isUploadEvent,
  UPLOADISTA_CLIENT_KEY,
  // Drag and drop
  useDragDrop,
  // Flow composables
  useFlow,
  useFlowEvents,
  // Multi-upload
  useMultiFlowUpload,
  useMultiUpload,
  // Upload composables
  useUpload,
  useUploadEvents,
  // Client
  useUploadistaClient,
  useUploadistaEvents,
  // Metrics
  useUploadMetrics,
} from "./composables";

export * from "./providers";
// Re-export utilities
export * from "./utils";
