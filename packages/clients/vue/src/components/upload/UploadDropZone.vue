<script setup lang="ts">
import { computed, inject, ref } from "vue";
import { type DragDropState, useDragDrop } from "../../composables/useDragDrop";
import type { UploadContextValue } from "./Upload.vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";

/**
 * Props for UploadDropZone component.
 */
export interface UploadDropZoneProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Maximum number of files (only in multi mode) */
  maxFiles?: number;
}

/**
 * Slot props for UploadDropZone component.
 */
export interface UploadDropZoneSlotProps {
  /** Whether files are being dragged over */
  isDragging: boolean;
  /** Whether drag is over the zone */
  isOver: boolean;
  /** Validation errors */
  errors: readonly string[];
  /** Drag event handlers to bind to the drop zone element */
  dragHandlers: {
    onDragenter: (event: DragEvent) => void;
    onDragover: (event: DragEvent) => void;
    onDragleave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
  /** Input props for the hidden file input */
  inputProps: {
    type: "file";
    multiple: boolean;
    accept: string | undefined;
  };
  /** Handler for input change event */
  onInputChange: (event: Event) => void;
  /** Open file picker programmatically */
  openFilePicker: () => void;
  /** Current drag-drop state */
  dragDropState: DragDropState;
}

const props = defineProps<UploadDropZoneProps>();

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error("UploadDropZone must be used within an <Upload> component.");
}

const inputRef = ref<HTMLInputElement>();

const dragDrop = useDragDrop({
  onFilesReceived: (files) => uploadContext.value.handleFilesReceived(files),
  accept: props.accept
    ? props.accept.split(",").map((t) => t.trim())
    : undefined,
  maxFileSize: props.maxFileSize,
  maxFiles: uploadContext.value.mode === "multi" ? props.maxFiles : 1,
  multiple: uploadContext.value.mode === "multi",
});

const openFilePicker = () => {
  inputRef.value?.click();
};

const slotProps = computed<UploadDropZoneSlotProps>(() => ({
  isDragging: dragDrop.state.value.isDragging,
  isOver: dragDrop.state.value.isOver,
  errors: dragDrop.state.value.errors,
  dragHandlers: {
    onDragenter: dragDrop.onDragEnter,
    onDragover: dragDrop.onDragOver,
    onDragleave: dragDrop.onDragLeave,
    onDrop: dragDrop.onDrop,
  },
  inputProps: dragDrop.inputProps.value,
  onInputChange: dragDrop.onInputChange,
  openFilePicker,
  dragDropState: dragDrop.state.value,
}));

defineExpose({ inputRef });
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default slot content if none provided -->
  </slot>
</template>
