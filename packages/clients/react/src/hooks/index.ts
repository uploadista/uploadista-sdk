// Event Hooks
export { isFlowEvent, isUploadEvent } from "./event-utils";

// Drag & Drop Hook
export type {
  DragDropOptions,
  DragDropState,
  UseDragDropReturn,
} from "./use-drag-drop";
export { useDragDrop } from "./use-drag-drop";

// Flow Hooks
// useFlow is the primary hook for flow operations (replaces useFlowUpload)
export type {
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  UseFlowReturn,
} from "./use-flow";
export { useFlow } from "./use-flow";
export type { UseFlowEventsOptions } from "./use-flow-events";
export { useFlowEvents } from "./use-flow-events";
export type { UseMultiFlowUploadReturn } from "./use-multi-flow-upload";
export { useMultiFlowUpload } from "./use-multi-flow-upload";

// Upload Hooks
export type {
  MultiUploadOptions,
  MultiUploadState,
  UploadItem,
  UseMultiUploadReturn,
} from "./use-multi-upload";
export { useMultiUpload } from "./use-multi-upload";
export type {
  UploadState,
  UploadStatus,
  UseUploadOptions,
  UseUploadReturn,
} from "./use-upload";
export { useUpload } from "./use-upload";
export type {
  UploadFailedEventData,
  UploadFileEventData,
  UploadProgressEventData,
  UploadValidationFailedEventData,
  UploadValidationSuccessEventData,
  UploadValidationWarningEventData,
  UseUploadEventsOptions,
} from "./use-upload-events";
export { useUploadEvents } from "./use-upload-events";
export type {
  FileUploadMetrics,
  UploadMetrics,
  UseUploadMetricsOptions,
  UseUploadMetricsReturn,
} from "./use-upload-metrics";
export { useUploadMetrics } from "./use-upload-metrics";

// Context Hooks
export type {
  UseUploadistaClientOptions,
  UseUploadistaClientReturn,
} from "./use-uploadista-client";
export { useUploadistaClient } from "./use-uploadista-client";
export { useUploadistaEvents } from "./use-uploadista-events";
