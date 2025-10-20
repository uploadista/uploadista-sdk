/**
 * Upload Zone Components
 *
 * Enhanced error handling features:
 * - MIME type validation with detailed error messages
 * - File count validation (single vs multiple mode)
 * - Custom validation error callbacks
 * - Built-in error display in SimpleUploadZone
 * - Configurable error styling
 */

import type React from "react";
import { useCallback } from "react";
import type {
  DragDropOptions,
  UseDragDropReturn,
} from "../hooks/use-drag-drop";
import { useDragDrop } from "../hooks/use-drag-drop";
import type {
  MultiUploadOptions,
  UseMultiUploadReturn,
} from "../hooks/use-multi-upload";
import { useMultiUpload } from "../hooks/use-multi-upload";
import type { UseUploadOptions, UseUploadReturn } from "../hooks/use-upload";
import { useUpload } from "../hooks/use-upload";

export interface UploadZoneRenderProps {
  /**
   * Drag and drop state and handlers
   */
  dragDrop: UseDragDropReturn;

  /**
   * Single upload functionality (if not using multi-upload)
   */
  upload: UseUploadReturn | null;

  /**
   * Multi-upload functionality (if using multi-upload)
   */
  multiUpload: UseMultiUploadReturn | null;

  /**
   * Helper function to open file picker
   */
  openFilePicker: () => void;

  /**
   * Whether the zone is currently active (dragging or uploading)
   */
  isActive: boolean;

  /**
   * Whether files are being processed
   */
  isProcessing: boolean;
}

export interface UploadZoneProps
  extends Omit<DragDropOptions, "onFilesReceived"> {
  /**
   * Whether to enable multi-file upload mode
   */
  multiple?: boolean;

  /**
   * Multi-upload specific options (only used when multiple=true)
   */
  multiUploadOptions?: MultiUploadOptions;

  /**
   * Single upload specific options (only used when multiple=false)
   */
  uploadOptions?: UseUploadOptions;

  /**
   * Render prop that receives upload zone state and handlers
   */
  children: (props: UploadZoneRenderProps) => React.ReactNode;

  /**
   * Called when files are processed and uploads begin
   */
  onUploadStart?: (files: File[]) => void;

  /**
   * Called when validation errors occur
   */
  onValidationError?: (errors: string[]) => void;
}

/**
 * Headless upload zone component that combines drag and drop functionality
 * with upload management. Uses render props pattern for maximum flexibility.
 * Includes enhanced error handling for MIME type validation and file count validation.
 *
 * @param props - Upload zone configuration and render prop
 * @returns Rendered upload zone using the provided render prop
 *
 * @example
 * ```tsx
 * // Single file upload zone with error handling
 * <UploadZone
 *   multiple={false}
 *   accept={['image/*']}
 *   maxFileSize={5 * 1024 * 1024}
 *   onValidationError={(errors) => {
 *     console.error('Validation errors:', errors);
 *   }}
 *   uploadOptions={{
 *     onSuccess: (result) => console.log('Upload complete:', result),
 *     onError: (error) => console.error('Upload failed:', error),
 *   }}
 * >
 *   {({ dragDrop, upload, openFilePicker, isActive }) => (
 *     <div {...dragDrop.dragHandlers} onClick={openFilePicker}>
 *       {dragDrop.state.isDragging ? (
 *         <p>Drop file here...</p>
 *       ) : upload?.isUploading ? (
 *         <p>Uploading... {upload.state.progress}%</p>
 *       ) : (
 *         <p>Drag a file here or click to select</p>
 *       )}
 *
 *       {dragDrop.state.errors.length > 0 && (
 *         <div style={{ color: 'red' }}>
 *           {dragDrop.state.errors.map((error, index) => (
 *             <p key={index}>{error}</p>
 *           ))}
 *         </div>
 *       )}
 *
 *       <input {...dragDrop.inputProps} />
 *     </div>
 *   )}
 * </UploadZone>
 * ```
 */
export function UploadZone({
  children,
  multiple = true,
  multiUploadOptions = {},
  uploadOptions = {},
  onUploadStart,
  onValidationError,
  ...dragDropOptions
}: UploadZoneProps) {
  // Always initialize both hooks, but only use the appropriate one
  const singleUpload = useUpload(uploadOptions);
  const multiUpload = useMultiUpload(multiUploadOptions);

  // Enhanced validation function for better error handling
  const enhancedValidator = useCallback(
    (files: File[]): string[] | null => {
      const errors: string[] = [];

      // Check file count based on multiple setting
      if (!multiple && files.length > 1) {
        errors.push(
          `Single file mode is enabled. Please select only one file. You selected ${files.length} files.`,
        );
      }

      // Enhanced MIME type validation with better error messages
      if (dragDropOptions.accept && dragDropOptions.accept.length > 0) {
        const invalidFiles = files.filter((file) => {
          return !dragDropOptions.accept?.some((acceptType) => {
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
        });

        if (invalidFiles.length > 0) {
          const fileNames = invalidFiles
            .map((f) => `"${f.name}" (${f.type})`)
            .join(", ");
          const acceptedTypes = dragDropOptions.accept.join(", ");
          errors.push(
            `Invalid file type(s): ${fileNames}. Accepted types: ${acceptedTypes}.`,
          );
        }
      }

      return errors.length > 0 ? errors : null;
    },
    [multiple, dragDropOptions.accept],
  );

  // Handle file processing
  const handleFilesReceived = (files: File[]) => {
    onUploadStart?.(files);

    if (multiple && multiUpload) {
      // Add files to multi-upload queue
      multiUpload.addFiles(files);

      // Auto-start uploads if configured to do so
      // Note: This could be made configurable with an autoStart prop
      setTimeout(() => multiUpload.startAll(), 0);
    } else if (!multiple && singleUpload && files.length > 0 && files[0]) {
      // Start single file upload
      singleUpload.upload(files[0]);
    }
  };

  // Handle validation errors
  const handleValidationError = useCallback(
    (errors: string[]) => {
      console.error("Upload zone validation errors:", errors);
      // Call the custom error handler if provided
      onValidationError?.(errors);
    },
    [onValidationError],
  );

  // Initialize drag and drop with enhanced validation
  const dragDrop = useDragDrop({
    ...dragDropOptions,
    multiple,
    validator: enhancedValidator,
    onFilesReceived: handleFilesReceived,
    onValidationError: handleValidationError,
  });

  // Determine active state
  const isActive = dragDrop.state.isDragging || dragDrop.state.isOver;

  // Determine processing state
  const isProcessing = multiple
    ? (multiUpload?.state.isUploading ?? false)
    : (singleUpload?.isUploading ?? false);

  // Create render props object
  const renderProps: UploadZoneRenderProps = {
    dragDrop,
    upload: singleUpload,
    multiUpload,
    openFilePicker: dragDrop.openFilePicker,
    isActive,
    isProcessing,
  };

  return <>{children(renderProps)}</>;
}

/**
 * Simple upload zone with built-in styling and basic functionality.
 * Provides a ready-to-use upload interface with minimal configuration.
 * Includes built-in error display for validation errors.
 *
 * @example
 * ```tsx
 * <SimpleUploadZone
 *   multiple={true}
 *   accept={['image/*']}
 *   onUploadStart={(files) => console.log('Starting uploads:', files.length)}
 *   onValidationError={(errors) => console.error('Validation errors:', errors)}
 *   multiUploadOptions={{
 *     onComplete: (results) => console.log('All uploads complete:', results),
 *   }}
 *   style={{
 *     width: '400px',
 *     height: '200px',
 *     margin: '20px auto'
 *   }}
 *   errorStyle={{
 *     backgroundColor: '#fff3cd',
 *     borderColor: '#ffeaa7'
 *   }}
 * />
 * ```
 */
export interface SimpleUploadZoneProps extends UploadZoneProps {
  /**
   * Additional CSS class name for styling
   */
  className?: string;

  /**
   * Inline styles for the upload zone
   */
  style?: React.CSSProperties;

  /**
   * Custom text to display in different states
   */
  text?: {
    idle?: string;
    dragging?: string;
    uploading?: string;
  };

  /**
   * Custom error message styling
   */
  errorStyle?: React.CSSProperties;
}

export function SimpleUploadZone({
  className = "",
  style = {},
  text = {},
  errorStyle = {},
  children,
  ...uploadZoneProps
}: SimpleUploadZoneProps) {
  const defaultText = {
    idle: uploadZoneProps.multiple
      ? "Drag files here or click to select"
      : "Drag a file here or click to select",
    dragging: uploadZoneProps.multiple
      ? "Drop files here..."
      : "Drop file here...",
    uploading: "Uploading...",
  };

  const displayText = { ...defaultText, ...text };

  // If children render prop is provided, use UploadZone directly
  if (children) {
    return <UploadZone {...uploadZoneProps}>{children}</UploadZone>;
  }

  // Otherwise, provide default UI
  return (
    <UploadZone {...uploadZoneProps}>
      {({
        dragDrop,
        upload,
        multiUpload,
        openFilePicker,
        isActive,
        isProcessing,
      }) => (
        <button
          type="button"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              openFilePicker();
            }
          }}
          onKeyUp={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              openFilePicker();
            }
          }}
          {...dragDrop.dragHandlers}
          onClick={openFilePicker}
          className={`upload-zone ${isActive ? "upload-zone--active" : ""} ${isProcessing ? "upload-zone--processing" : ""} ${className}`}
          style={{
            border: isActive ? "2px dashed #007bff" : "2px dashed #ccc",
            borderRadius: "8px",
            padding: "2rem",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: isActive ? "#f8f9fa" : "transparent",
            transition: "all 0.2s ease",
            minHeight: "120px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            ...style,
          }}
        >
          {dragDrop.state.isDragging ? (
            <p style={{ margin: 0, fontSize: "16px", color: "#007bff" }}>
              {displayText.dragging}
            </p>
          ) : isProcessing ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 10px 0", fontSize: "14px" }}>
                {displayText.uploading}
              </p>
              {upload && (
                <div>
                  <progress
                    value={upload.state.progress}
                    max={100}
                    style={{ width: "200px", height: "8px" }}
                  />
                  <p
                    style={{
                      margin: "5px 0 0 0",
                      fontSize: "12px",
                      color: "#666",
                    }}
                  >
                    {upload.state.progress}%
                  </p>
                </div>
              )}
              {multiUpload && (
                <div>
                  <progress
                    value={multiUpload.state.progress}
                    max={100}
                    style={{ width: "200px", height: "8px" }}
                  />
                  <p
                    style={{
                      margin: "5px 0 0 0",
                      fontSize: "12px",
                      color: "#666",
                    }}
                  >
                    {multiUpload.state.progress}% ({multiUpload.state.uploading}{" "}
                    uploading, {multiUpload.state.successful} completed)
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "16px", color: "#666" }}>
              {displayText.idle}
            </p>
          )}

          {dragDrop.state.errors.length > 0 && (
            <div
              style={{
                marginTop: "10px",
                padding: "8px 12px",
                backgroundColor: "#f8d7da",
                border: "1px solid #f5c6cb",
                borderRadius: "4px",
                maxWidth: "100%",
                ...errorStyle,
              }}
            >
              <p
                style={{
                  margin: "0 0 5px 0",
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: "#721c24",
                }}
              >
                Validation Errors:
              </p>
              {dragDrop.state.errors.map((error, index) => (
                <p
                  // biome-ignore lint/suspicious/noArrayIndexKey: index is used as key
                  key={index}
                  style={{
                    color: "#721c24",
                    fontSize: "11px",
                    margin: "2px 0",
                    lineHeight: "1.3",
                  }}
                >
                  • {error}
                </p>
              ))}
            </div>
          )}

          <input {...dragDrop.inputProps} />
        </button>
      )}
    </UploadZone>
  );
}
