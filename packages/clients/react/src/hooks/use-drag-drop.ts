import { useCallback, useRef, useState } from "react";

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
  isDragging: boolean;

  /**
   * Whether the drag is currently over the drop zone
   */
  isOver: boolean;

  /**
   * Whether the dragged items are valid files
   */
  isValid: boolean;

  /**
   * Current validation errors
   */
  errors: string[];
}

export interface UseDragDropReturn {
  /**
   * Current drag and drop state
   */
  state: DragDropState;

  /**
   * Event handlers for the drop zone element
   */
  dragHandlers: {
    onDragEnter: (event: React.DragEvent) => void;
    onDragOver: (event: React.DragEvent) => void;
    onDragLeave: (event: React.DragEvent) => void;
    onDrop: (event: React.DragEvent) => void;
  };

  /**
   * Props for a file input element
   */
  inputProps: {
    type: "file";
    multiple: boolean;
    accept?: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    style: { display: "none" };
    ref: React.RefObject<HTMLInputElement | null>;
  };

  /**
   * Open file picker dialog
   */
  openFilePicker: () => void;

  /**
   * Manually process files (useful for programmatic file handling)
   */
  processFiles: (files: File[]) => void;

  /**
   * Reset drag state
   */
  reset: () => void;
}

const initialState: DragDropState = {
  isDragging: false,
  isOver: false,
  isValid: true,
  errors: [],
};

/**
 * React hook for handling drag and drop file uploads with validation.
 * Provides drag state management, file validation, and file picker integration.
 *
 * @param options - Configuration and event handlers
 * @returns Drag and drop state and handlers
 *
 * @example
 * ```tsx
 * const dragDrop = useDragDrop({
 *   accept: ['image/*', '.pdf'],
 *   maxFiles: 5,
 *   maxFileSize: 10 * 1024 * 1024, // 10MB
 *   multiple: true,
 *   onFilesReceived: (files) => {
 *     console.log('Received files:', files);
 *     // Process files with upload hooks
 *   },
 *   onValidationError: (errors) => {
 *     console.error('Validation errors:', errors);
 *   },
 * });
 *
 * return (
 *   <div>
 *     <div
 *       {...dragDrop.dragHandlers}
 *       style={{
 *         border: dragDrop.state.isDragging ? '2px dashed #007bff' : '2px dashed #ccc',
 *         backgroundColor: dragDrop.state.isOver ? '#f8f9fa' : 'transparent',
 *         padding: '2rem',
 *         textAlign: 'center',
 *         cursor: 'pointer',
 *       }}
 *       onClick={dragDrop.openFilePicker}
 *     >
 *       {dragDrop.state.isDragging ? (
 *         <p>Drop files here...</p>
 *       ) : (
 *         <p>Drag files here or click to select</p>
 *       )}
 *
 *       {dragDrop.state.errors.length > 0 && (
 *         <div style={{ color: 'red', marginTop: '1rem' }}>
 *           {dragDrop.state.errors.map((error, index) => (
 *             <p key={index}>{error}</p>
 *           ))}
 *         </div>
 *       )}
 *     </div>
 *
 *     <input {...dragDrop.inputProps} />
 *   </div>
 * );
 * ```
 */
export function useDragDrop(options: DragDropOptions = {}): UseDragDropReturn {
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

  const [state, setState] = useState<DragDropState>(initialState);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const updateState = useCallback((update: Partial<DragDropState>) => {
    setState((prev) => ({ ...prev, ...update }));
  }, []);

  const validateFiles = useCallback(
    (files: File[]): string[] => {
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
            // Handle wildcard "*" to accept all files
            if (acceptType === "*" || acceptType === "*/*") {
              return true;
            }
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
    },
    [accept, maxFiles, maxFileSize, validator],
  );

  const processFiles = useCallback(
    (files: File[]) => {
      const fileArray = Array.from(files);
      const errors = validateFiles(fileArray);

      if (errors.length > 0) {
        updateState({ errors, isValid: false });
        onValidationError?.(errors);
      } else {
        updateState({ errors: [], isValid: true });
        onFilesReceived?.(fileArray);
      }
    },
    [validateFiles, updateState, onFilesReceived, onValidationError],
  );

  const getFilesFromDataTransfer = useCallback(
    (dataTransfer: DataTransfer): File[] => {
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
    },
    [],
  );

  const onDragEnter = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounterRef.current++;

      if (dragCounterRef.current === 1) {
        updateState({ isDragging: true, isOver: true });
        onDragStateChange?.(true);
      }
    },
    [updateState, onDragStateChange],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    // Set dropEffect to indicate what operation is allowed
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDragLeave = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounterRef.current--;

      if (dragCounterRef.current === 0) {
        updateState({ isDragging: false, isOver: false, errors: [] });
        onDragStateChange?.(false);
      }
    },
    [updateState, onDragStateChange],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();

      dragCounterRef.current = 0;
      updateState({ isDragging: false, isOver: false });
      onDragStateChange?.(false);

      if (event.dataTransfer) {
        const files = getFilesFromDataTransfer(event.dataTransfer);
        if (files.length > 0) {
          processFiles(files);
        }
      }
    },
    [updateState, onDragStateChange, getFilesFromDataTransfer, processFiles],
  );

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        const files = Array.from(event.target.files);
        processFiles(files);
      }

      // Reset input value to allow selecting the same files again
      event.target.value = "";
    },
    [processFiles],
  );

  const reset = useCallback(() => {
    setState(initialState);
    dragCounterRef.current = 0;
  }, []);

  const dragHandlers = {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  };

  const inputProps = {
    type: "file" as const,
    multiple,
    accept: accept?.join(", "),
    onChange: onInputChange,
    style: { display: "none" as const },
    ref: inputRef,
  };

  return {
    state,
    dragHandlers,
    inputProps,
    openFilePicker,
    processFiles,
    reset,
  };
}
