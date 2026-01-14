// Event composables
export { isFlowEvent, isUploadEvent } from "./eventUtils";
export type { UseFlowEventsOptions } from "./useFlowEvents";
export { useFlowEvents } from "./useFlowEvents";
export type {
  UploadFailedEventData,
  UploadFileEventData,
  UploadProgressEventData,
  UploadValidationFailedEventData,
  UploadValidationSuccessEventData,
  UploadValidationWarningEventData,
  UseUploadEventsOptions,
} from "./useUploadEvents";
export { useUploadEvents } from "./useUploadEvents";
export { useUploadistaEvents } from "./useUploadistaEvents";

// Plugin

export type { UploadistaPluginOptions } from "./plugin";
export { createUploadistaPlugin, UPLOADISTA_CLIENT_KEY } from "./plugin";
export type {
  DragDropOptions,
  DragDropState,
} from "./useDragDrop";
// Drag and drop composable
export { useDragDrop } from "./useDragDrop";

// Flow composables
// useFlow is the primary composable for flow operations (replaces useFlowUpload)
export type {
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  UseFlowReturn,
} from "./useFlow";
export { useFlow } from "./useFlow";

export { useMultiFlowUpload } from "./useMultiFlowUpload";
export type {
  MultiUploadOptions,
  MultiUploadState,
  UploadItem,
} from "./useMultiUpload";
export { useMultiUpload } from "./useMultiUpload";
export type {
  ChunkMetrics,
  PerformanceInsights,
  UploadInput,
  UploadSessionMetrics,
  UploadState,
  UploadStatus,
} from "./useUpload";
// Upload composables
export { useUpload } from "./useUpload";
export type { UseUploadistaClientReturn } from "./useUploadistaClient";
// Core client composable
export { useUploadistaClient } from "./useUploadistaClient";
export type {
  FileUploadMetrics,
  UseUploadMetricsOptions,
} from "./useUploadMetrics";
// Metrics composable
export { useUploadMetrics } from "./useUploadMetrics";
