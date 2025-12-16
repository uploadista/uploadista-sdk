// ============ FLOW PRIMITIVES (NEW) ============
// Compound component for flow-based uploads
export {
  Flow,
  useFlowContext,
  useFlowInputContext,
} from "./components/flow-primitives";
export type {
  FlowProps,
  FlowContextValue,
  FlowInputContextValue,
  FlowDropZoneProps,
  FlowDropZoneRenderProps,
  FlowInputsProps,
  FlowInputsRenderProps,
  FlowInputProps,
  FlowInputDropZoneProps,
  FlowInputDropZoneRenderProps,
  FlowInputUrlFieldProps,
  FlowInputPreviewProps,
  FlowInputPreviewRenderProps,
  FlowProgressProps,
  FlowProgressRenderProps,
  FlowStatusProps,
  FlowStatusRenderProps,
  FlowErrorProps,
  FlowErrorRenderProps,
  FlowSubmitProps,
  FlowCancelProps,
  FlowResetProps,
} from "./components/flow-primitives";

// ============ FLOW HOOKS ============
// useFlow is the primary hook for flow operations
export type {
  FlowInputMetadata,
  InputExecutionState,
  UseFlowReturn,
  FlowUploadState,
  FlowUploadStatus,
} from "./hooks/use-flow";
export { useFlow } from "./hooks/use-flow";
export type { UseFlowEventsOptions } from "./hooks/use-flow-events";
export { useFlowEvents } from "./hooks/use-flow-events";
export type { UseMultiFlowUploadReturn } from "./hooks/use-multi-flow-upload";
export { useMultiFlowUpload } from "./hooks/use-multi-flow-upload";

// ============ UPLOAD HOOKS ============
export type {
  MultiUploadOptions,
  MultiUploadState,
  UploadItem,
  UseMultiUploadReturn,
} from "./hooks/use-multi-upload";
export { useMultiUpload } from "./hooks/use-multi-upload";
export type {
  UploadState,
  UploadStatus,
  UseUploadOptions,
  UseUploadReturn,
} from "./hooks/use-upload";
export { useUpload } from "./hooks/use-upload";
export type {
  UploadFailedEventData,
  UploadFileEventData,
  UploadProgressEventData,
  UploadValidationFailedEventData,
  UploadValidationSuccessEventData,
  UploadValidationWarningEventData,
  UseUploadEventsOptions,
} from "./hooks/use-upload-events";
export { useUploadEvents } from "./hooks/use-upload-events";
export type {
  FileUploadMetrics,
  UploadMetrics,
  UseUploadMetricsOptions,
  UseUploadMetricsReturn,
} from "./hooks/use-upload-metrics";
export { useUploadMetrics } from "./hooks/use-upload-metrics";

// ============ DRAG & DROP ============
export type {
  DragDropOptions,
  DragDropState,
  UseDragDropReturn,
} from "./hooks/use-drag-drop";
export { useDragDrop } from "./hooks/use-drag-drop";

// ============ UPLOAD PRIMITIVES (NEW) ============
// Compound component for file uploads
export {
  Upload,
  useUploadContext,
  useUploadItemContext,
} from "./components/upload-primitives";
export type {
  UploadProps,
  UploadContextValue,
  UploadItemContextValue,
  UploadDropZoneProps,
  UploadDropZoneRenderProps,
  UploadItemsProps,
  UploadItemsRenderProps,
  UploadItemProps,
  UploadProgressProps,
  UploadProgressRenderProps,
  UploadStatusProps,
  UploadStatusRenderProps,
  UploadErrorProps,
  UploadErrorRenderProps,
  UploadCancelProps,
  UploadRetryProps,
  UploadResetProps,
  UploadStartAllProps,
  UploadClearCompletedProps,
} from "./components/upload-primitives";

// ============ UPLOAD COMPONENTS (LEGACY) ============
export type {
  SimpleUploadListItemProps,
  UploadListProps,
  UploadListRenderProps,
} from "./components/upload-list";
export { SimpleUploadListItem, UploadList } from "./components/upload-list";
export type {
  SimpleUploadZoneProps,
  UploadZoneProps,
  UploadZoneRenderProps,
} from "./components/upload-zone";
export { SimpleUploadZone, UploadZone } from "./components/upload-zone";

// ============ FLOW UPLOAD LIST (for batch uploads) ============
export type {
  FlowUploadListProps,
  FlowUploadListRenderProps,
  SimpleFlowUploadListItemProps,
  SimpleFlowUploadListProps,
} from "./components/flow-upload-list";
export {
  FlowUploadList,
  SimpleFlowUploadList,
  SimpleFlowUploadListItem,
} from "./components/flow-upload-list";

// ============ PROVIDERS & CONTEXTS ============
export {
  UploadistaProvider,
  useUploadistaContext,
} from "./components/uploadista-provider";
export {
  FlowManagerProvider,
  useFlowManagerContext,
} from "./contexts/flow-manager-context";

// ============ EVENT UTILITIES ============
export { isFlowEvent, isUploadEvent } from "./hooks/event-utils";
export type {
  UseUploadistaClientOptions,
  UseUploadistaClientReturn,
} from "./hooks/use-uploadista-client";
export { useUploadistaClient } from "./hooks/use-uploadista-client";
export { useUploadistaEvents } from "./hooks/use-uploadista-events";
