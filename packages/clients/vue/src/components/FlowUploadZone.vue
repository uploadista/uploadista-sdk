<script setup lang="ts">
import type {
  FlowUploadConfig,
  FlowUploadOptions,
} from "@uploadista/client-browser";
import { computed, ref } from "vue";
import { useDragDrop, useFlowUpload } from "../composables";

export interface FlowUploadZoneProps {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Additional flow upload options
   */
  options?: Omit<FlowUploadOptions, "flowConfig">;

  /**
   * Accepted file types (single MIME type or extension string)
   */
  accept?: string;

  /**
   * Whether to allow multiple files (currently only single file supported for flow uploads)
   */
  multiple?: boolean;

  /**
   * Whether the upload zone is disabled
   */
  disabled?: boolean;

  /**
   * Maximum file size in bytes
   */
  maxFileSize?: number;
}

const props = withDefaults(defineProps<FlowUploadZoneProps>(), {
  multiple: false,
  disabled: false,
});

// biome-ignore lint/suspicious/noExplicitAny: Flow result can be any type
const emit = defineEmits<{
  // biome-ignore lint/suspicious/noExplicitAny: Flow result can be any type
  "upload-complete": [result: any];
  "upload-error": [error: Error];
  "upload-start": [file: File];
  "validation-error": [errors: string[]];
}>();

// biome-ignore lint/suspicious/noExplicitAny: Vue slot definition requires any
defineSlots<{
  // biome-ignore lint/suspicious/noExplicitAny: Vue slot definition requires any
  default(props: {
    isDragging: boolean;
    isOver: boolean;
    isUploading: boolean;
    isProcessing: boolean;
    progress: number;
    status: string;
    errors: string[];
    openFilePicker: () => void;
  }): any;
}>();

// Initialize flow upload
const flowUpload = useFlowUpload({
  ...props.options,
  flowConfig: props.flowConfig,
  onFlowComplete: (outputs) => {
    emit("upload-complete", outputs);
    props.options?.onFlowComplete?.(outputs);
  },
  onError: (error) => {
    emit("upload-error", error);
    props.options?.onError?.(error);
  },
});

// Handle files received from drag-drop or file picker
const handleFilesReceived = (files: File[]) => {
  const file = files[0];
  if (file) {
    emit("upload-start", file);
    flowUpload.upload(file);
  }
};

// Handle validation errors
const handleValidationError = (errors: string[]) => {
  emit("validation-error", errors);
};

// Initialize drag-drop
const dragDrop = useDragDrop({
  accept: props.accept ? [props.accept] : undefined,
  multiple: props.multiple,
  maxFileSize: props.maxFileSize,
  onFilesReceived: handleFilesReceived,
  onValidationError: handleValidationError,
});

// File input ref
const fileInputRef = ref<HTMLInputElement>();

// Open file picker
// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const openFilePicker = () => {
  if (!props.disabled) {
    fileInputRef.value?.click();
  }
};

// Computed states
// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const isActive = computed(
  () => dragDrop.state.value.isDragging || dragDrop.state.value.isOver,
);
</script>

<template>
  <div
    class="flow-upload-zone"
    :class="{
      'flow-upload-zone--active': isActive,
      'flow-upload-zone--disabled': disabled,
      'flow-upload-zone--uploading': flowUpload.isUploading.value
    }"
    @dragenter="!disabled && dragDrop.onDragEnter"
    @dragover="!disabled && dragDrop.onDragOver"
    @dragleave="!disabled && dragDrop.onDragLeave"
    @drop="!disabled && dragDrop.onDrop"
    @click="openFilePicker"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled"
    aria-label="Upload file with flow processing"
    @keydown.enter="openFilePicker"
    @keydown.space.prevent="openFilePicker"
  >
    <slot
      :is-dragging="dragDrop.state.value.isDragging"
      :is-over="dragDrop.state.value.isOver"
      :is-uploading="flowUpload.isUploading.value"
      :is-processing="flowUpload.isProcessing.value"
      :progress="flowUpload.state.value.progress"
      :status="flowUpload.state.value.status"
      :errors="[...dragDrop.state.value.errors]"
      :open-file-picker="openFilePicker"
    >
      <!-- Default slot content -->
      <div class="flow-upload-zone__content">
        <p v-if="dragDrop.state.value.isDragging">Drop file here...</p>
        <p v-else-if="flowUpload.isUploading.value">
          Uploading... {{ flowUpload.state.value.progress }}%
        </p>
        <p v-else-if="flowUpload.isProcessing.value">
          Processing...
          <span v-if="flowUpload.state.value.currentNodeName">
            ({{ flowUpload.state.value.currentNodeName }})
          </span>
        </p>
        <p v-else-if="flowUpload.state.value.status === 'success'">Upload complete!</p>
        <p v-else-if="flowUpload.state.value.status === 'error'" class="flow-upload-zone__error">
          Error: {{ flowUpload.state.value.error?.message }}
        </p>
        <p v-else>Drag a file here or click to select</p>

        <div v-if="flowUpload.isUploading.value" class="flow-upload-zone__progress">
          <div class="flow-upload-zone__progress-bar">
            <div
              class="flow-upload-zone__progress-fill"
              :style="{ width: `${flowUpload.state.value.progress}%` }"
            />
          </div>
        </div>

        <div v-if="dragDrop.state.value.errors.length > 0" class="flow-upload-zone__errors">
          <p v-for="(error, index) in dragDrop.state.value.errors" :key="index">
            {{ error }}
          </p>
        </div>
      </div>
    </slot>

    <input
      ref="fileInputRef"
      type="file"
      :multiple="dragDrop.inputProps.value.multiple"
      :accept="dragDrop.inputProps.value.accept"
      :disabled="disabled"
      @change="dragDrop.onInputChange"
      style="display: none"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.flow-upload-zone {
  cursor: pointer;
  user-select: none;
}

.flow-upload-zone--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.flow-upload-zone--uploading {
  pointer-events: none;
}

.flow-upload-zone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.flow-upload-zone__error {
  color: #dc3545;
}

.flow-upload-zone__progress {
  width: 100%;
  max-width: 300px;
  margin-top: 0.5rem;
}

.flow-upload-zone__progress-bar {
  width: 100%;
  height: 0.5rem;
  background-color: #e0e0e0;
  border-radius: 0.25rem;
  overflow: hidden;
}

.flow-upload-zone__progress-fill {
  height: 100%;
  background-color: #007bff;
  transition: width 0.2s ease;
}

.flow-upload-zone__errors {
  margin-top: 0.5rem;
  color: #dc3545;
  font-size: 0.875rem;
}

.flow-upload-zone__errors p {
  margin: 0.25rem 0;
}
</style>
