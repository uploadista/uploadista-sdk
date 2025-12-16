<script setup lang="ts">
import { computed, ref } from "vue";
import { useDragDrop, type DragDropState } from "../../composables/useDragDrop";
import { useFlowInputContext } from "./useFlowContext";

// Helper function to check if value is a File (for template use)
const isFile = (value: unknown): value is File => value instanceof File;

/**
 * Props for FlowInputDropZone component.
 */
export interface FlowInputDropZoneProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
}

const props = withDefaults(defineProps<FlowInputDropZoneProps>(), {
  accept: undefined,
  maxFileSize: undefined,
});

const input = useFlowInputContext();
const inputRef = ref<HTMLInputElement | null>(null);

const dragDrop = useDragDrop({
  onFilesReceived: (files) => {
    const file = files[0];
    if (file) {
      // Set the input value but don't trigger upload yet
      input.setValue(file);
    }
  },
  accept: props.accept ? props.accept.split(",").map((t) => t.trim()) : undefined,
  maxFileSize: props.maxFileSize,
  multiple: false,
});

const openFilePicker = () => {
  inputRef.value?.click();
};

/**
 * Slot props provided to the default slot.
 */
export interface FlowInputDropZoneSlotProps {
  /** Whether files are being dragged over */
  isDragging: boolean;
  /** Whether drag is over the zone */
  isOver: boolean;
  /** Current value for this input */
  value: unknown;
  /** Per-input progress (if available) */
  progress: number;
  /** Per-input status (if available) */
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

const slotProps = computed<FlowInputDropZoneSlotProps>(() => ({
  isDragging: dragDrop.state.value.isDragging,
  isOver: dragDrop.state.value.isOver,
  value: input.value,
  progress: input.state?.progress ?? 0,
  status: input.state?.status ?? "idle",
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
        cursor: 'pointer',
        backgroundColor: slotProps.isOver ? '#eff6ff' : 'transparent',
        transition: 'all 0.2s ease',
      }"
    >
      <p v-if="slotProps.isDragging">Drop file here...</p>
      <p v-else-if="isFile(slotProps.value)">
        Selected: {{ slotProps.value.name }}
      </p>
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
