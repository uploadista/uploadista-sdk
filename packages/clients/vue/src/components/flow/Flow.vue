<script setup lang="ts">
import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { provide } from "vue";
import {
  type FlowInputMetadata,
  type UseFlowReturn,
  useFlow,
} from "../../composables/useFlow";

/**
 * Props for the Flow root component.
 */
export interface FlowProps {
  /** Flow ID to execute */
  flowId: string;
  /** Storage ID for file uploads */
  storageId: string;
  /** Optional output node ID to wait for */
  outputNodeId?: string;
  /** Optional metadata to include with the flow execution */
  metadata?: Record<string, string>;
}

const props = defineProps<FlowProps>();

const emit = defineEmits<{
  /** Called when flow completes successfully */
  success: [outputs: TypedOutput[]];
  /** Called when flow fails */
  error: [error: Error];
  /** Called on upload progress */
  progress: [
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ];
  /** Called when flow completes with all outputs */
  flowComplete: [outputs: TypedOutput[]];
  /** Called when upload is aborted */
  abort: [];
}>();

// Build options from props and emit handlers
const options: FlowUploadOptions = {
  flowConfig: {
    flowId: props.flowId,
    storageId: props.storageId,
    outputNodeId: props.outputNodeId,
    metadata: props.metadata,
  },
  onSuccess: (outputs) => emit("success", outputs),
  onError: (error) => emit("error", error),
  onProgress: (uploadId, bytesUploaded, totalBytes) =>
    emit("progress", uploadId, bytesUploaded, totalBytes),
  onFlowComplete: (outputs) => emit("flowComplete", outputs),
  onAbort: () => emit("abort"),
};

const flow = useFlow(options);

// Re-export types for convenience
export type {
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
};

/**
 * Context value provided by the Flow component root.
 * Contains all flow state and actions.
 */
export interface FlowContextValue {
  /** Current upload state */
  state: UseFlowReturn["state"];
  /** Discovered input nodes metadata (null until discovery completes) */
  inputMetadata: UseFlowReturn["inputMetadata"];
  /** Current input values set via setInput() */
  inputs: UseFlowReturn["inputs"];
  /** Per-input execution state for multi-input flows */
  inputStates: UseFlowReturn["inputStates"];

  /** Set an input value for a specific node */
  setInput: UseFlowReturn["setInput"];
  /** Execute the flow with current inputs */
  execute: UseFlowReturn["execute"];
  /** Upload a single file through the flow */
  upload: UseFlowReturn["upload"];
  /** Abort the current upload */
  abort: UseFlowReturn["abort"];
  /** Pause the current upload */
  pause: UseFlowReturn["pause"];
  /** Resume a paused upload */
  resume: UseFlowReturn["resume"];
  /** Reset the upload state and clear all inputs */
  reset: UseFlowReturn["reset"];

  /** Whether an upload or flow execution is in progress */
  isUploading: UseFlowReturn["isUploading"];
  /** Whether the file is currently being uploaded */
  isUploadingFile: UseFlowReturn["isUploadingFile"];
  /** Whether the flow is currently processing */
  isProcessing: UseFlowReturn["isProcessing"];
  /** Whether the hook is discovering flow inputs */
  isDiscoveringInputs: UseFlowReturn["isDiscoveringInputs"];
}

// Create the context value
const contextValue: FlowContextValue = {
  state: flow.state,
  inputMetadata: flow.inputMetadata,
  inputs: flow.inputs,
  inputStates: flow.inputStates,
  setInput: flow.setInput,
  execute: flow.execute,
  upload: flow.upload,
  abort: flow.abort,
  pause: flow.pause,
  resume: flow.resume,
  reset: flow.reset,
  isUploading: flow.isUploading,
  isUploadingFile: flow.isUploadingFile,
  isProcessing: flow.isProcessing,
  isDiscoveringInputs: flow.isDiscoveringInputs,
};

// Provide context for child components
provide("flowContext", contextValue);

// Also expose to parent via defineExpose for programmatic access
defineExpose(contextValue);
</script>

<template>
  <slot />
</template>
