import { computed, readonly, ref } from "vue";

export interface DragDropOptions {
  /**
   * Accept specific file types (MIME types or file extensions)
   */
  accept?: string[];

  /**
   * Maximum number of files allowed
   */
  maxFiles?: number;

  /**
   * Maximum file size in bytes
   */
  maxFileSize?: number;

  /**
   * Whether to allow multiple files
   */
  multiple?: boolean;

  /**
   * Custom validation function for files
   */
  validator?: (files: File[]) => string[] | null;

  /**
   * Called when files are dropped or selected
   */
  onFilesReceived?: (files: File[]) => void;

  /**
   * Called when validation fails
   */
  onValidationError?: (errors: string[]) => void;

  /**
   * Called when drag state changes
   */
  onDragStateChange?: (isDragging: boolean) => void;
}

export interface DragDropState {
  /**
   * Whether files are currently being dragged over the drop zone
   */
  readonly isDragging: boolean;

  /**
   * Whether the drag is currently over the drop zone
   */
  readonly isOver: boolean;

  /**
   * Whether the dragged items are valid files
   */
  readonly isValid: boolean;

  /**
   * Current validation errors
   */
  readonly errors: readonly string[];
}

const initialState: DragDropState = {
  isDragging: false,
  isOver: false,
  isValid: true,
  errors: [],
};

/**
 * Vue composable for handling drag and drop file uploads with validation.
 * Provides drag state management, file validation, and file picker integration.
 *
 * @param options - Configuration and event handlers
 * @returns Drag and drop state and handlers
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useDragDrop } from '@uploadista/vue';
 * import { ref } from 'vue';
 *
 * const inputRef = ref<HTMLInputElement>();
 *
 * const dragDrop = useDragDrop({
 *   accept: ['image/*', '.pdf'],
 *   maxFiles: 5,
 *   maxFileSize: 10 * 1024 * 1024, // 10MB
 *   multiple: true,
 *   onFilesReceived: (files) => {
 *     console.log('Received files:', files);
 *     // Process files with upload composables
 *   },
 *   onValidationError: (errors) => {
 *     console.error('Validation errors:', errors);
 *   },
 * });
 *
 * const openFilePicker = () => {
 *   inputRef.value?.click();
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <div
 *       @dragenter="dragDrop.onDragEnter"
 *       @dragover="dragDrop.onDragOver"
 *       @dragleave="dragDrop.onDragLeave"
 *       @drop="dragDrop.onDrop"
 *       @click="openFilePicker"
 *       :style="{
 *         border: dragDrop.state.isDragging ? '2px dashed #007bff' : '2px dashed #ccc',
 *         backgroundColor: dragDrop.state.isOver ? '#f8f9fa' : 'transparent',
 *         padding: '2rem',
 *         textAlign: 'center',
 *         cursor: 'pointer',
 *       }"
 *     >
 *       <p v-if="dragDrop.state.isDragging">Drop files here...</p>
 *       <p v-else>Drag files here or click to select</p>
 *
 *       <div v-if="dragDrop.state.errors.length > 0" style="color: red; margin-top: 1rem">
 *         <p v-for="(error, index) in dragDrop.state.errors" :key="index">{{ error }}</p>
 *       </div>
 *     </div>
 *
 *     <input
 *       ref="inputRef"
 *       type="file"
 *       :multiple="dragDrop.inputProps.multiple"
 *       :accept="dragDrop.inputProps.accept"
 *       @change="dragDrop.onInputChange"
 *       style="display: none"
 *     />
 *   </div>
 * </template>
 * ```
 */
export function useDragDrop(options: DragDropOptions = {}) {
  const {
    accept,
    maxFiles,
    maxFileSize,
    multiple = true,
    validator,
    onFilesReceived,
    onValidationError,
    onDragStateChange,
  } = options;

  const state = ref<DragDropState>({ ...initialState });
  const dragCounter = ref(0);

  const updateState = (update: Partial<DragDropState>) => {
    state.value = { ...state.value, ...update };
  };

  const validateFiles = (files: File[]): string[] => {
    const errors: string[] = [];

    // Check file count
    if (maxFiles && files.length > maxFiles) {
      errors.push(
        `Maximum ${maxFiles} files allowed. You selected ${files.length} files.`,
      );
    }

    // Check individual files
    for (const file of files) {
      // Check file size
      if (maxFileSize && file.size > maxFileSize) {
        const maxSizeMB = (maxFileSize / (1024 * 1024)).toFixed(1);
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
        errors.push(
          `File "${file.name}" (${fileSizeMB}MB) exceeds maximum size of ${maxSizeMB}MB.`,
        );
      }

      // Check file type
      if (accept && accept.length > 0) {
        const isAccepted = accept.some((acceptType) => {
          if (acceptType.startsWith(".")) {
            // File extension check
            return file.name.toLowerCase().endsWith(acceptType.toLowerCase());
          } else {
            // MIME type check (supports wildcards like image/*)
            if (acceptType.endsWith("/*")) {
              const baseType = acceptType.slice(0, -2);
              return file.type.startsWith(baseType);
            } else {
              return file.type === acceptType;
            }
          }
        });

        if (!isAccepted) {
          errors.push(
            `File "${file.name}" type "${file.type}" is not accepted. Accepted types: ${accept.join(", ")}.`,
          );
        }
      }
    }

    // Run custom validator
    if (validator) {
      const customErrors = validator(files);
      if (customErrors) {
        errors.push(...customErrors);
      }
    }

    return errors;
  };

  const processFiles = (files: File[]) => {
    const fileArray = Array.from(files);
    const errors = validateFiles(fileArray);

    if (errors.length > 0) {
      updateState({ errors, isValid: false });
      onValidationError?.(errors);
    } else {
      updateState({ errors: [], isValid: true });
      onFilesReceived?.(fileArray);
    }
  };

  const getFilesFromDataTransfer = (dataTransfer: DataTransfer): File[] => {
    const files: File[] = [];

    if (dataTransfer.items) {
      // Use DataTransferItemList interface
      for (let i = 0; i < dataTransfer.items.length; i++) {
        const item = dataTransfer.items[i];
        if (item && item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            files.push(file);
          }
        }
      }
    } else {
      // Fallback to DataTransfer.files
      for (let i = 0; i < dataTransfer.files.length; i++) {
        const file = dataTransfer.files[i];
        if (file) {
          files.push(file);
        }
      }
    }

    return files;
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounter.value++;

    if (dragCounter.value === 1) {
      updateState({ isDragging: true, isOver: true });
      onDragStateChange?.(true);
    }
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // Set dropEffect to indicate what operation is allowed
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const onDragLeave = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounter.value--;

    if (dragCounter.value === 0) {
      updateState({ isDragging: false, isOver: false, errors: [] });
      onDragStateChange?.(false);
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    dragCounter.value = 0;
    updateState({ isDragging: false, isOver: false });
    onDragStateChange?.(false);

    if (event.dataTransfer) {
      const files = getFilesFromDataTransfer(event.dataTransfer);
      if (files.length > 0) {
        processFiles(files);
      }
    }
  };

  const onInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const files = Array.from(input.files);
      processFiles(files);
    }

    // Reset input value to allow selecting the same files again
    input.value = "";
  };

  const reset = () => {
    state.value = { ...initialState };
    dragCounter.value = 0;
  };

  const inputProps = computed(() => ({
    type: "file" as const,
    multiple,
    accept: accept?.join(", "),
  }));

  return {
    state: readonly(state),
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
    onInputChange,
    inputProps,
    processFiles,
    reset,
  };
}
