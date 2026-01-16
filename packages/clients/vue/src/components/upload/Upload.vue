<script setup lang="ts">
import type { UploadFile } from "@uploadista/core/types";
import { computed, provide } from "vue";
import {
  type MultiUploadState,
  type UploadItem,
  useMultiUpload,
} from "../../composables/useMultiUpload";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";

/**
 * Props for the Upload root component.
 */
export interface UploadProps {
  /** Whether to allow multiple file uploads (default: false) */
  multiple?: boolean;
  /** Maximum concurrent uploads (default: 3, only used in multi mode) */
  maxConcurrent?: number;
  /** Whether to auto-start uploads when files are received (default: true) */
  autoStart?: boolean;
  /** Metadata to attach to uploads */
  metadata?: Record<string, string>;
}

const props = withDefaults(defineProps<UploadProps>(), {
  multiple: false,
  maxConcurrent: 3,
  autoStart: true,
});

const emit = defineEmits<{
  /** Called when a single file upload succeeds (single mode) */
  success: [result: UploadFile];
  /** Called when an upload fails */
  error: [error: Error, item?: UploadItem];
  /** Called when all uploads complete (multi mode) */
  complete: [
    results: { successful: UploadItem[]; failed: UploadItem[]; total: number },
  ];
  /** Called when an individual upload starts */
  uploadStart: [item: UploadItem];
  /** Called on upload progress */
  progress: [
    item: UploadItem,
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ];
}>();

const multiUpload = useMultiUpload({
  maxConcurrent: props.maxConcurrent,
  metadata: props.metadata,
  onUploadStart: (item) => emit("uploadStart", item),
  onUploadProgress: (item, progress, bytesUploaded, totalBytes) =>
    emit("progress", item, progress, bytesUploaded, totalBytes),
  onUploadSuccess: (_item, result) => {
    // In single mode, call success directly
    if (!props.multiple) {
      emit("success", result);
    }
  },
  onUploadError: (item, error) => {
    emit("error", error, item);
  },
  onComplete: (results) => emit("complete", results),
});

const handleFilesReceived = (files: File[]) => {
  if (!props.multiple) {
    // Single mode: clear existing and add new file
    multiUpload.clearAll();
  }
  multiUpload.addFiles(files);
  if (props.autoStart) {
    // Use setTimeout to ensure state is updated before starting
    setTimeout(() => multiUpload.startAll(), 0);
  }
};

/**
 * Context value provided by the Upload component root.
 * Contains all upload state and actions.
 */
export interface UploadContextValue {
  /** Whether in multi-file mode */
  mode: "single" | "multi";
  /** Current multi-upload state (aggregate) */
  state: MultiUploadState;
  /** All upload items */
  items: readonly UploadItem[];
  /** Whether auto-start is enabled */
  autoStart: boolean;

  /** Add files to the upload queue */
  addFiles: (files: File[]) => void;
  /** Remove an item from the queue */
  removeItem: (id: string) => void;
  /** Start all pending uploads */
  startAll: () => void;
  /** Abort a specific upload by ID */
  abortUpload: (id: string) => void;
  /** Abort all active uploads */
  abortAll: () => void;
  /** Retry a specific failed upload by ID */
  retryUpload: (id: string) => void;
  /** Retry all failed uploads */
  retryFailed: () => void;
  /** Clear all completed uploads */
  clearCompleted: () => void;
  /** Clear all items and reset state */
  clearAll: () => void;

  /** Internal handler for files received from drop zone */
  handleFilesReceived: (files: File[]) => void;
}

// Create computed context value that updates reactively
// Cast items to mutable array for context (the readonly is enforced at the composable level)
const contextValue = computed<UploadContextValue>(() => ({
  mode: props.multiple ? "multi" : "single",
  state: multiUpload.state.value,
  items: multiUpload.items.value as UploadItem[],
  autoStart: props.autoStart,
  addFiles: multiUpload.addFiles,
  removeItem: multiUpload.removeItem,
  startAll: multiUpload.startAll,
  abortUpload: multiUpload.abortUpload,
  abortAll: multiUpload.abortAll,
  retryUpload: multiUpload.retryUpload,
  retryFailed: multiUpload.retryFailed,
  clearCompleted: multiUpload.clearCompleted,
  clearAll: multiUpload.clearAll,
  handleFilesReceived,
}));

// Provide context for child components
provide(UPLOAD_CONTEXT_KEY, contextValue);

// Expose to parent via defineExpose for programmatic access
defineExpose(contextValue);
</script>

<template>
  <slot />
</template>
