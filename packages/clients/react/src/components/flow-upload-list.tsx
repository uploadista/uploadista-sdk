import type {
  BrowserUploadInput,
  FlowUploadConfig,
  FlowUploadItem,
  MultiFlowUploadOptions,
} from "@uploadista/client-browser";
import type { ReactNode } from "react";
import { useMultiFlowUpload } from "../hooks/use-multi-flow-upload";

export interface FlowUploadListRenderProps {
  /**
   * List of upload items
   */
  items: FlowUploadItem<BrowserUploadInput>[];

  /**
   * Total progress across all uploads
   */
  totalProgress: number;

  /**
   * Number of active uploads
   */
  activeUploads: number;

  /**
   * Number of completed uploads
   */
  completedUploads: number;

  /**
   * Number of failed uploads
   */
  failedUploads: number;

  /**
   * Whether any uploads are in progress
   */
  isUploading: boolean;

  /**
   * Add files to the upload queue
   */
  addFiles: (files: File[] | FileList) => void;

  /**
   * Remove a file from the queue
   */
  removeFile: (id: string) => void;

  /**
   * Start uploading all pending files
   */
  startUpload: () => void;

  /**
   * Abort a specific upload
   */
  abortUpload: (id: string) => void;

  /**
   * Abort all uploads
   */
  abortAll: () => void;

  /**
   * Clear all items
   */
  clear: () => void;

  /**
   * Retry a failed upload
   */
  retryUpload: (id: string) => void;
}

export interface FlowUploadListProps {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Multi-upload options
   */
  options?: Omit<MultiFlowUploadOptions<BrowserUploadInput>, "flowConfig">;

  /**
   * Render function for the upload list
   */
  children: (props: FlowUploadListRenderProps) => ReactNode;
}

/**
 * Flow upload list component for managing multiple file uploads
 *
 * @example
 * ```tsx
 * <FlowUploadList
 *   client={client}
 *   flowConfig={{
 *     flowId: "batch-upload-flow",
 *     inputNodeId: "upload-node",
 *     storageId: "my-storage",
 *   }}
 *   options={{
 *     maxConcurrent: 3,
 *     onComplete: (items) => console.log("All done:", items),
 *   }}
 * >
 *   {({ items, addFiles, startUpload, abortUpload, retryUpload }) => (
 *     <div>
 *       <input
 *         type="file"
 *         multiple
 *         onChange={(e) => {
 *           if (e.target.files) {
 *             addFiles(e.target.files);
 *             startUpload();
 *           }
 *         }}
 *       />
 *
 *       <ul>
 *         {items.map((item) => (
 *           <li key={item.id}>
 *             <span>{item.file.name}</span>
 *             <progress value={item.progress} max={100} />
 *             <span>{item.progress}%</span>
 *
 *             {item.status === "uploading" && (
 *               <button onClick={() => abortUpload(item.id)}>Cancel</button>
 *             )}
 *             {item.status === "error" && (
 *               <button onClick={() => retryUpload(item.id)}>Retry</button>
 *             )}
 *           </li>
 *         ))}
 *       </ul>
 *     </div>
 *   )}
 * </FlowUploadList>
 * ```
 */
export function FlowUploadList({
  flowConfig,
  options,
  children,
}: FlowUploadListProps) {
  const multiUpload = useMultiFlowUpload({
    ...options,
    flowConfig,
  });

  return (
    <>
      {children({
        items: multiUpload.state.items,
        totalProgress: multiUpload.state.totalProgress,
        activeUploads: multiUpload.state.activeUploads,
        completedUploads: multiUpload.state.completedUploads,
        failedUploads: multiUpload.state.failedUploads,
        isUploading: multiUpload.isUploading,
        addFiles: multiUpload.addFiles,
        removeFile: multiUpload.removeFile,
        startUpload: multiUpload.startUpload,
        abortUpload: multiUpload.abortUpload,
        abortAll: multiUpload.abortAll,
        clear: multiUpload.clear,
        retryUpload: multiUpload.retryUpload,
      })}
    </>
  );
}

export interface SimpleFlowUploadListItemProps {
  /**
   * Upload item
   */
  item: FlowUploadItem<BrowserUploadInput>;

  /**
   * Abort the upload
   */
  onAbort: () => void;

  /**
   * Retry the upload
   */
  onRetry: () => void;

  /**
   * Remove the item
   */
  onRemove: () => void;
}

/**
 * Simple pre-styled flow upload list item component
 */
export function SimpleFlowUploadListItem({
  item,
  onAbort,
  onRetry,
  onRemove,
}: SimpleFlowUploadListItemProps) {
  const getStatusIcon = () => {
    switch (item.status) {
      case "success":
        return "✓";
      case "error":
        return "✗";
      case "uploading":
        return "⟳";
      case "aborted":
        return "⊘";
      default:
        return "○";
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case "success":
        return "green";
      case "error":
        return "red";
      case "uploading":
        return "blue";
      case "aborted":
        return "gray";
      default:
        return "black";
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "8px",
        borderBottom: "1px solid #eee",
      }}
    >
      <span style={{ color: getStatusColor(), fontSize: "18px" }}>
        {getStatusIcon()}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.file instanceof File ? item.file.name : "Upload"}
        </div>

        {item.status === "uploading" && (
          <div style={{ marginTop: "4px" }}>
            <progress
              value={item.progress}
              max={100}
              style={{ width: "100%", height: "4px" }}
            />
            <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
              {item.progress}% • {Math.round(item.bytesUploaded / 1024)} KB /{" "}
              {Math.round(item.totalBytes / 1024)} KB
            </div>
          </div>
        )}

        {item.status === "error" && (
          <div style={{ fontSize: "12px", color: "red", marginTop: "2px" }}>
            {item.error?.message || "Upload failed"}
          </div>
        )}

        {item.status === "success" && (
          <div style={{ fontSize: "12px", color: "green", marginTop: "2px" }}>
            Upload complete
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px" }}>
        {item.status === "uploading" && (
          <button
            type="button"
            onClick={onAbort}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}

        {item.status === "error" && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        )}

        {(item.status === "pending" ||
          item.status === "error" ||
          item.status === "aborted") && (
          <button
            type="button"
            onClick={onRemove}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

export interface SimpleFlowUploadListProps {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Multi-upload options
   */
  options?: Omit<MultiFlowUploadOptions<BrowserUploadInput>, "flowConfig">;

  /**
   * CSS class for the container
   */
  className?: string;

  /**
   * Show file input
   */
  showFileInput?: boolean;

  /**
   * File input accept attribute
   */
  accept?: string;
}

/**
 * Simple pre-styled flow upload list component
 *
 * @example
 * ```tsx
 * <SimpleFlowUploadList
 *   client={client}
 *   flowConfig={{
 *     flowId: "batch-upload-flow",
 *     inputNodeId: "upload-node",
 *     storageId: "my-storage",
 *   }}
 *   options={{
 *     maxConcurrent: 3,
 *     onComplete: (items) => console.log("All uploads complete"),
 *   }}
 *   accept="image/*"
 * />
 * ```
 */
export function SimpleFlowUploadList({
  flowConfig,
  options,
  className = "",
  showFileInput = true,
  accept,
}: SimpleFlowUploadListProps) {
  return (
    <FlowUploadList flowConfig={flowConfig} options={options}>
      {({
        items,
        addFiles,
        startUpload,
        abortUpload,
        retryUpload,
        removeFile,
        totalProgress,
      }) => (
        <div className={className}>
          {showFileInput && (
            <div style={{ marginBottom: "16px" }}>
              <input
                type="file"
                multiple
                accept={accept}
                onChange={(e) => {
                  if (e.target.files) {
                    addFiles(e.target.files);
                    startUpload();
                  }
                }}
                style={{
                  padding: "8px",
                  border: "1px solid #ccc",
                  borderRadius: "4px",
                }}
              />
            </div>
          )}

          {items.length > 0 && (
            <div>
              <div
                style={{ marginBottom: "8px", fontSize: "14px", color: "#666" }}
              >
                Total Progress: {totalProgress}%
              </div>

              <div
                style={{
                  border: "1px solid #eee",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                {items.map((item) => (
                  <SimpleFlowUploadListItem
                    key={item.id}
                    item={item}
                    onAbort={() => abortUpload(item.id)}
                    onRetry={() => retryUpload(item.id)}
                    onRemove={() => removeFile(item.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </FlowUploadList>
  );
}
