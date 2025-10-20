<script setup lang="ts">
import type { UploadOptions } from "@uploadista/client-browser";
import { computed, ref } from "vue";
import type { MultiUploadOptions } from "../composables";
import { useDragDrop, useMultiUpload, useUpload } from "../composables";

export interface UploadZoneProps {
  /**
   * Accepted file types (MIME types or file extensions)
   */
  accept?: string[];

  /**
   * Whether to allow multiple files
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

  /**
   * Custom validation function for files
   */
  validator?: (files: File[]) => string[] | null;

  /**
   * Multi-upload options (only used when multiple=true)
   */
  multiUploadOptions?: MultiUploadOptions;

  /**
   * Single upload options (only used when multiple=false)
   */
  uploadOptions?: UploadOptions;
}

const props = withDefaults(defineProps<UploadZoneProps>(), {
  multiple: true,
  disabled: false,
});

const emit = defineEmits<{
  "file-select": [files: File[]];
  "upload-start": [files: File[]];
  "validation-error": [errors: string[]];
}>();

defineSlots<{
  // biome-ignore lint/suspicious/noExplicitAny: Vue slot definition requires any
  default(props: {
    isDragging: boolean;
    isOver: boolean;
    isUploading: boolean;
    errors: string[];
    openFilePicker: () => void;
  }): any;
}>();

// Initialize upload composables
const singleUpload = props.multiple
  ? null
  : useUpload(props.uploadOptions || {});
const multiUpload = props.multiple
  ? useMultiUpload(props.multiUploadOptions || {})
  : null;

// Handle files received from drag-drop or file picker
const handleFilesReceived = (files: File[]) => {
  emit("file-select", files);
  emit("upload-start", files);

  if (props.multiple && multiUpload) {
    multiUpload.addFiles(files);
    setTimeout(() => multiUpload.startAll(), 0);
  } else if (!props.multiple && singleUpload && files[0]) {
    singleUpload.upload(files[0]);
  }
};

// Handle validation errors
const handleValidationError = (errors: string[]) => {
  emit("validation-error", errors);
};

// Initialize drag-drop
const dragDrop = useDragDrop({
  accept: props.accept,
  multiple: props.multiple,
  maxFileSize: props.maxFileSize,
  validator: props.validator,
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

// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const isUploading = computed(() => {
  if (props.multiple && multiUpload) {
    return multiUpload.state.value.isUploading;
  } else if (!props.multiple && singleUpload) {
    return singleUpload.state.value.status === "uploading";
  }
  return false;
});
</script>

<template>
  <div
    class="upload-zone"
    :class="{ 'upload-zone--active': isActive, 'upload-zone--disabled': disabled }"
    @dragenter="!disabled && dragDrop.onDragEnter"
    @dragover="!disabled && dragDrop.onDragOver"
    @dragleave="!disabled && dragDrop.onDragLeave"
    @drop="!disabled && dragDrop.onDrop"
    @click="openFilePicker"
    role="button"
    :tabindex="disabled ? -1 : 0"
    :aria-disabled="disabled"
    :aria-label="multiple ? 'Upload multiple files' : 'Upload a file'"
    @keydown.enter="openFilePicker"
    @keydown.space.prevent="openFilePicker"
  >
    <slot
      :is-dragging="dragDrop.state.value.isDragging"
      :is-over="dragDrop.state.value.isOver"
      :is-uploading="isUploading"
      :errors="[...dragDrop.state.value.errors]"
      :open-file-picker="openFilePicker"
    >
      <!-- Default slot content -->
      <div class="upload-zone__content">
        <p v-if="dragDrop.state.value.isDragging">
          {{ multiple ? 'Drop files here...' : 'Drop file here...' }}
        </p>
        <p v-else>
          {{ multiple ? 'Drag files here or click to select' : 'Drag a file here or click to select' }}
        </p>

        <div v-if="dragDrop.state.value.errors.length > 0" class="upload-zone__errors">
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
.upload-zone {
  cursor: pointer;
  user-select: none;
}

.upload-zone--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.upload-zone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.upload-zone__errors {
  margin-top: 0.5rem;
  color: #dc3545;
  font-size: 0.875rem;
}

.upload-zone__errors p {
  margin: 0.25rem 0;
}
</style>
