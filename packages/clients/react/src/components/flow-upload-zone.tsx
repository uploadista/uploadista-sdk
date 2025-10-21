import type {
  FlowUploadConfig,
  FlowUploadOptions,
} from "@uploadista/client-browser";
import type { ReactNode } from "react";
import { type UseDragDropReturn, useDragDrop } from "../hooks/use-drag-drop";
import {
  type UseFlowUploadReturn,
  useFlowUpload,
} from "../hooks/use-flow-upload";

/**
 * Render props passed to the FlowUploadZone children function.
 * Provides access to flow upload state, drag-drop handlers, and helper functions.
 *
 * @property dragDrop - Complete drag-and-drop state and handlers
 * @property flowUpload - Flow upload hook with upload state and controls
 * @property isActive - True when dragging over zone
 * @property openFilePicker - Programmatically open file selection dialog
 * @property getRootProps - Returns props to spread on the drop zone container
 * @property getInputProps - Returns props to spread on the hidden file input
 */
export interface FlowUploadZoneRenderProps {
  /**
   * Drag and drop state and handlers
   */
  dragDrop: UseDragDropReturn;

  /**
   * Flow upload functionality
   */
  flowUpload: UseFlowUploadReturn;

  /**
   * Whether the zone is currently active (dragging or uploading)
   */
  isActive: boolean;

  /**
   * Open file picker
   */
  openFilePicker: () => void;

  /**
   * Props to spread on the drop zone element
   */
  getRootProps: () => {
    onDragEnter: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };

  /**
   * Props to spread on the file input element
   */
  getInputProps: () => React.InputHTMLAttributes<HTMLInputElement>;
}

/**
 * Props for the FlowUploadZone component.
 *
 * @property flowConfig - Flow execution configuration (flowId, storageId, etc.)
 * @property options - Flow upload options (callbacks, metadata, etc.)
 * @property accept - Accepted file types (e.g., "image/*", ".pdf")
 * @property multiple - Allow multiple file selection (default: false)
 * @property children - Render function receiving flow upload zone state
 */
export interface FlowUploadZoneProps {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Upload options
   */
  options?: Omit<FlowUploadOptions, "flowConfig">;

  /**
   * Accepted file types (e.g., "image/*", ".pdf", etc.)
   */
  accept?: string;

  /**
   * Whether to allow multiple files (uses multi-upload internally)
   */
  multiple?: boolean;

  /**
   * Render function for the drop zone
   */
  children: (props: FlowUploadZoneRenderProps) => ReactNode;
}

/**
 * Headless flow upload zone component with drag-and-drop support.
 * Combines drag-drop functionality with flow processing, using render props
 * for complete UI control.
 *
 * Files uploaded through this zone are automatically processed through the
 * specified flow, which can perform operations like image optimization,
 * storage saving, webhooks, etc.
 *
 * Must be used within an UploadistaProvider.
 *
 * @param props - Flow upload zone configuration and render prop
 * @returns Rendered flow upload zone using the provided render prop
 *
 * @example
 * ```tsx
 * // Image upload with flow processing
 * <FlowUploadZone
 *   flowConfig={{
 *     flowId: "image-processing-flow",
 *     storageId: "s3-images",
 *     outputNodeId: "optimized-image",
 *   }}
 *   options={{
 *     onSuccess: (result) => console.log('Processed:', result),
 *     onFlowComplete: (outputs) => {
 *       console.log('All outputs:', outputs);
 *     },
 *   }}
 *   accept="image/*"
 * >
 *   {({ dragDrop, flowUpload, getRootProps, getInputProps, openFilePicker }) => (
 *     <div {...getRootProps()} style={{
 *       border: dragDrop.state.isDragging ? '2px solid blue' : '2px dashed gray',
 *       padding: '2rem',
 *       textAlign: 'center'
 *     }}>
 *       <input {...getInputProps()} />
 *
 *       {dragDrop.state.isDragging && (
 *         <p>Drop image here...</p>
 *       )}
 *
 *       {!dragDrop.state.isDragging && !flowUpload.isUploading && (
 *         <div>
 *           <p>Drag an image or click to browse</p>
 *           <button onClick={openFilePicker}>Choose File</button>
 *         </div>
 *       )}
 *
 *       {flowUpload.isUploadingFile && (
 *         <div>
 *           <p>Uploading...</p>
 *           <progress value={flowUpload.state.progress} max={100} />
 *           <span>{flowUpload.state.progress}%</span>
 *         </div>
 *       )}
 *
 *       {flowUpload.isProcessing && (
 *         <div>
 *           <p>Processing image...</p>
 *           {flowUpload.state.currentNodeName && (
 *             <span>Step: {flowUpload.state.currentNodeName}</span>
 *           )}
 *         </div>
 *       )}
 *
 *       {flowUpload.state.status === "success" && (
 *         <div>
 *           <p>✓ Upload complete!</p>
 *           {flowUpload.state.result && (
 *             <img src={flowUpload.state.result.url} alt="Uploaded" />
 *           )}
 *         </div>
 *       )}
 *
 *       {flowUpload.state.status === "error" && (
 *         <div>
 *           <p>Error: {flowUpload.state.error?.message}</p>
 *           <button onClick={flowUpload.reset}>Try Again</button>
 *         </div>
 *       )}
 *
 *       {flowUpload.isUploading && (
 *         <button onClick={flowUpload.abort}>Cancel</button>
 *       )}
 *     </div>
 *   )}
 * </FlowUploadZone>
 * ```
 *
 * @see {@link SimpleFlowUploadZone} for a pre-styled version
 * @see {@link useFlowUpload} for the underlying hook
 */
export function FlowUploadZone({
  flowConfig,
  options,
  accept,
  multiple = false,
  children,
}: FlowUploadZoneProps) {
  // Hook automatically subscribes to events through context
  const flowUpload = useFlowUpload({
    ...options,
    flowConfig,
  });

  const dragDrop = useDragDrop({
    onFilesReceived: (files: File[]) => {
      const file = files[0];
      if (file) {
        flowUpload.upload(file);
      }
    },
    accept: accept ? [accept] : undefined,
    multiple,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    const file = files?.[0];
    if (file) {
      flowUpload.upload(file);
    }
  };

  // Determine active state
  const isActive = dragDrop.state.isDragging || dragDrop.state.isOver;

  return (
    <>
      {children({
        flowUpload,
        dragDrop,
        isActive,
        openFilePicker: dragDrop.openFilePicker,
        getRootProps: () => dragDrop.dragHandlers,
        getInputProps: () => ({
          ...dragDrop.inputProps,
          onChange: handleFileChange,
        }),
      })}
    </>
  );
}

/**
 * Props for the SimpleFlowUploadZone component.
 *
 * @property flowConfig - Flow execution configuration
 * @property options - Flow upload options (callbacks, metadata)
 * @property accept - Accepted file types
 * @property className - CSS class name for custom styling
 * @property dragText - Text displayed when dragging files over zone
 * @property idleText - Text displayed when zone is idle
 */
export interface SimpleFlowUploadZoneProps {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Upload options
   */
  options?: Omit<FlowUploadOptions, "flowConfig">;

  /**
   * Accepted file types
   */
  accept?: string;

  /**
   * CSS class for the container
   */
  className?: string;

  /**
   * Custom drag overlay text
   */
  dragText?: string;

  /**
   * Custom idle text
   */
  idleText?: string;
}

/**
 * Simple pre-styled flow upload zone component with built-in UI.
 * Provides a ready-to-use drag-and-drop interface for flow uploads.
 *
 * Features:
 * - Built-in drag-and-drop visual feedback
 * - Automatic progress display for upload and processing phases
 * - Success and error state display
 * - Cancel button during upload
 * - Customizable text labels
 *
 * @param props - Flow upload zone configuration with styling options
 * @returns Styled flow upload zone component
 *
 * @example
 * ```tsx
 * // Basic image upload with flow processing
 * <SimpleFlowUploadZone
 *   flowConfig={{
 *     flowId: "image-optimization-flow",
 *     storageId: "s3-images",
 *   }}
 *   accept="image/*"
 *   options={{
 *     onSuccess: (result) => console.log("Image processed:", result),
 *     onError: (error) => console.error("Processing failed:", error),
 *   }}
 *   idleText="Drop an image to optimize and upload"
 *   dragText="Release to start processing"
 *   className="my-upload-zone"
 * />
 *
 * // Document upload with custom flow
 * <SimpleFlowUploadZone
 *   flowConfig={{
 *     flowId: "document-processing-flow",
 *     storageId: "docs",
 *     outputNodeId: "processed-doc",
 *   }}
 *   accept=".pdf,.doc,.docx"
 *   options={{
 *     onFlowComplete: (outputs) => {
 *       console.log('Processing outputs:', outputs);
 *     },
 *   }}
 * />
 * ```
 *
 * @see {@link FlowUploadZone} for the headless version with full control
 */
export function SimpleFlowUploadZone({
  flowConfig,
  options,
  accept,
  className = "",
  dragText = "Drop files here",
  idleText = "Drag & drop files or click to browse",
}: SimpleFlowUploadZoneProps) {
  return (
    <FlowUploadZone flowConfig={flowConfig} options={options} accept={accept}>
      {({
        dragDrop,
        flowUpload,
        getRootProps,
        getInputProps,
        openFilePicker,
      }) => (
        <div
          {...getRootProps()}
          className={className}
          style={{
            border: "2px dashed #ccc",
            borderRadius: "8px",
            padding: "32px",
            textAlign: "center",
            cursor: "pointer",
            backgroundColor: dragDrop.state.isDragging
              ? "#f0f0f0"
              : "transparent",
            transition: "background-color 0.2s",
          }}
        >
          <input {...getInputProps()} />

          {dragDrop.state.isDragging && <p style={{ margin: 0 }}>{dragText}</p>}

          {!dragDrop.state.isDragging &&
            !flowUpload.isUploading &&
            flowUpload.state.status === "idle" && (
              <div>
                <p style={{ margin: "0 0 16px 0" }}>{idleText}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFilePicker();
                  }}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "4px",
                    border: "1px solid #ccc",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Choose Files
                </button>
              </div>
            )}

          {flowUpload.isUploading && (
            <div>
              <progress
                value={flowUpload.state.progress}
                max={100}
                style={{ width: "100%", height: "8px" }}
              />
              <p style={{ margin: "8px 0 0 0" }}>
                {flowUpload.state.progress}%
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // abort() will be passed from parent
                }}
                style={{
                  marginTop: "8px",
                  padding: "4px 12px",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  backgroundColor: "#fff",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {flowUpload.state.status === "success" && (
            <div>
              <p style={{ margin: 0, color: "green" }}>✓ Upload complete!</p>
            </div>
          )}

          {flowUpload.state.status === "error" && (
            <div>
              <p style={{ margin: 0, color: "red" }}>
                ✗ Error: {flowUpload.state.error?.message}
              </p>
            </div>
          )}
        </div>
      )}
    </FlowUploadZone>
  );
}
