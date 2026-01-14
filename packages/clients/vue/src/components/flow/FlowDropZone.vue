<script setup lang="ts">
import { computed, ref } from "vue";
import { type DragDropState, useDragDrop } from "../../composables/useDragDrop";
import { useFlowContext } from "./useFlowContext";

/**
 * Props for FlowDropZone component.
 */
export interface FlowDropZoneProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
}

const props = withDefaults(defineProps<FlowDropZoneProps>(), {
  accept: undefined,
  maxFileSize: undefined,
});

const flow = useFlowContext();
const inputRef = ref<HTMLInputElement | null>(null);

const dragDrop = useDragDrop({
  onFilesReceived: (files) => {
    const file = files[0];
    if (file) {
      flow.upload(file);
    }
  },
  accept: props.accept
    ? props.accept.split(",").map((t) => t.trim())
    : undefined,
  maxFileSize: props.maxFileSize,
  multiple: false,
});

const openFilePicker = () => {
  inputRef.value?.click();
};

/**
 * Slot props provided to the default slot.
 */
export interface FlowDropZoneSlotProps {
  /** Whether files are being dragged over */
  isDragging: boolean;
  /** Whether drag is over the zone */
  isOver: boolean;
  /** Upload progress (0-100) */
  progress: number;
  /** Current flow status */
  status: string;
  /** Current drag-drop state */
  dragDropState: DragDropState;
  /** Open file picker programmatically */
  openFilePicker: () => void;
  /** Drag event handlers to spread on the container */
  dragHandlers: {
    onDragenter: (e: DragEvent) => void;
    onDragover: (e: DragEvent) => void;
    onDragleave: (e: DragEvent) => void;
    onDrop: (e: DragEvent) => void;
  };
  /** Input props for the hidden file input */
  inputProps: {
    type: "file";
    multiple: boolean;
    accept: string | undefined;
  };
  /** Input change handler */
  onInputChange: (e: Event) => void;
  /** Ref for the file input element */
  inputRef: typeof inputRef;
}

const slotProps = computed<FlowDropZoneSlotProps>(() => ({
  isDragging: dragDrop.state.value.isDragging,
  isOver: dragDrop.state.value.isOver,
  progress: flow.state.value.progress,
  status: flow.state.value.status,
  dragDropState: dragDrop.state.value,
  openFilePicker,
  dragHandlers: {
    onDragenter: dragDrop.onDragEnter,
    onDragover: dragDrop.onDragOver,
    onDragleave: dragDrop.onDragLeave,
    onDrop: dragDrop.onDrop,
  },
  inputProps: dragDrop.inputProps.value,
  onInputChange: dragDrop.onInputChange,
  inputRef,
}));
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default content if no slot provided -->
    <div
      v-bind="slotProps.dragHandlers"
      @click="openFilePicker"
      :style="{
        border: slotProps.isDragging ? '2px dashed #3b82f6' : '2px dashed #d1d5db',
        borderRadius: '0.5rem',
        padding: '2rem',
        textAlign: 'center',
        cursor: flow.isUploading.value ? 'not-allowed' : 'pointer',
        opacity: flow.isUploading.value ? 0.5 : 1,
        backgroundColor: slotProps.isOver ? '#eff6ff' : 'transparent',
        transition: 'all 0.2s ease',
      }"
    >
      <p v-if="slotProps.isDragging">Drop file here...</p>
      <p v-else-if="flow.isUploading.value">Uploading... {{ slotProps.progress }}%</p>
      <p v-else>Drag and drop a file here, or click to select</p>
    </div>
    <input
      ref="inputRef"
      type="file"
      :multiple="slotProps.inputProps.multiple"
      :accept="slotProps.inputProps.accept"
      @change="slotProps.onInputChange"
      style="display: none"
    />
  </slot>
</template>
