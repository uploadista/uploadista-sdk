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
 * Flow upload zone component with drag-and-drop support
 *
 * @example
 * ```tsx
 * <FlowUploadZone
 *   client={client}
 *   flowConfig={{
 *     flowId: "my-upload-flow",
 *     storageId: "my-storage",
 *   }}
 *   accept="image/*"
 * >
 *   {({ isDragging, isUploading, state, getRootProps, getInputProps, openFilePicker }) => (
 *     <div {...getRootProps()}>
 *       <input {...getInputProps()} />
 *
 *       {isDragging && <p>Drop files here...</p>}
 *       {!isDragging && !isUploading && (
 *         <button onClick={openFilePicker}>Choose Files</button>
 *       )}
 *       {isUploading && (
 *         <div>
 *           <progress value={state.progress} max={100} />
 *           <p>{state.progress}%</p>
 *         </div>
 *       )}
 *       {state.status === "success" && <p>Upload complete!</p>}
 *       {state.status === "error" && <p>Error: {state.error?.message}</p>}
 *     </div>
 *   )}
 * </FlowUploadZone>
 * ```
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
 * Simple pre-styled flow upload zone component
 *
 * @example
 * ```tsx
 * <SimpleFlowUploadZone
 
 *   flowConfig={{
 *     flowId: "my-upload-flow",
 *     inputNodeId: "upload-node",
 *     storageId: "my-storage",
 *   }}
 *   accept="image/*"
 *   onSuccess={(result) => console.log("Uploaded:", result)}
 * />
 * ```
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
