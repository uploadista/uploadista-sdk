import type {
  BrowserUploadInput,
  FlowUploadConfig,
  FlowUploadItem,
  MultiFlowUploadOptions,
} from "@uploadista/client-browser";
import type { ReactNode } from "react";
import { useMultiFlowUpload } from "../hooks/use-multi-flow-upload";

/**
 * Render props passed to the FlowUploadList children function.
 * Provides access to upload items, aggregate statistics, and control methods.
 *
 * @property items - All flow upload items in the queue
 * @property totalProgress - Average progress across all uploads (0-100)
 * @property activeUploads - Count of currently uploading items
 * @property completedUploads - Count of successfully completed uploads
 * @property failedUploads - Count of failed uploads
 * @property isUploading - True when any uploads are in progress
 * @property addFiles - Add new files to the upload queue
 * @property removeFile - Remove a specific file from the queue
 * @property startUpload - Begin uploading all pending files
 * @property abortUpload - Cancel a specific active upload
 * @property abortAll - Cancel all active uploads
 * @property clear - Remove all items from the queue
 * @property retryUpload - Retry a specific failed upload
 */
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

/**
 * Props for the FlowUploadList component.
 *
 * @property flowConfig - Flow execution configuration (flowId, storageId, etc.)
 * @property options - Multi-flow upload options (callbacks, concurrency, etc.)
 * @property children - Render function receiving flow upload list state
 */
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
 * Headless flow upload list component for managing batch file uploads through a flow.
 * Uses render props pattern to provide complete control over the UI while handling
 * concurrent uploads and flow processing.
 *
 * Each file is uploaded and processed independently through the specified flow,
 * with automatic queue management and concurrency control.
 *
 * Must be used within an UploadistaProvider.
 *
 * @param props - Flow upload list configuration and render prop
 * @returns Rendered flow upload list using the provided render prop
 *
 * @example
 * ```tsx
 * // Batch image processing with custom UI
 * <FlowUploadList
 *   flowConfig={{
 *     flowId: "image-batch-processing",
 *     storageId: "s3-images",
 *     outputNodeId: "optimized",
 *   }}
 *   options={{
 *     maxConcurrent: 3,
 *     onItemSuccess: (item) => {
 *       console.log(`${item.file.name} processed successfully`);
 *     },
 *     onComplete: (items) => {
 *       const successful = items.filter(i => i.status === 'success');
 *       console.log(`Batch complete: ${successful.length}/${items.length} successful`);
 *     },
 *   }}
 * >
 *   {({
 *     items,
 *     totalProgress,
 *     activeUploads,
 *     completedUploads,
 *     failedUploads,
 *     addFiles,
 *     startUpload,
 *     abortUpload,
 *     retryUpload,
 *     clear,
 *   }) => (
 *     <div>
 *       <input
 *         type="file"
 *         multiple
 *         accept="image/*"
 *         onChange={(e) => {
 *           if (e.target.files) {
 *             addFiles(e.target.files);
 *             startUpload();
 *           }
 *         }}
 *       />
 *
 *       <div style={{ marginTop: '1rem' }}>
 *         <h3>Upload Progress</h3>
 *         <div>Overall: {totalProgress}%</div>
 *         <div>
 *           Active: {activeUploads}, Completed: {completedUploads}, Failed: {failedUploads}
 *         </div>
 *         <button onClick={clear}>Clear All</button>
 *       </div>
 *
 *       <ul style={{ listStyle: 'none', padding: 0 }}>
 *         {items.map((item) => (
 *           <li key={item.id} style={{
 *             padding: '1rem',
 *             border: '1px solid #ccc',
 *             marginBottom: '0.5rem'
 *           }}>
 *             <div>{item.file instanceof File ? item.file.name : 'File'}</div>
 *             <div>Status: {item.status}</div>
 *
 *             {item.status === "uploading" && (
 *               <div>
 *                 <progress value={item.progress} max={100} style={{ width: '100%' }} />
 *                 <div>{item.progress}%</div>
 *                 <button onClick={() => abortUpload(item.id)}>Cancel</button>
 *               </div>
 *             )}
 *
 *             {item.status === "error" && (
 *               <div>
 *                 <div style={{ color: 'red' }}>{item.error?.message}</div>
 *                 <button onClick={() => retryUpload(item.id)}>Retry</button>
 *               </div>
 *             )}
 *
 *             {item.status === "success" && (
 *               <div style={{ color: 'green' }}>✓ Complete</div>
 *             )}
 *           </li>
 *         ))}
 *       </ul>
 *     </div>
 *   )}
 * </FlowUploadList>
 * ```
 *
 * @see {@link SimpleFlowUploadList} for a pre-styled version
 * @see {@link useMultiFlowUpload} for the underlying hook
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

/**
 * Props for the SimpleFlowUploadListItem component.
 *
 * @property item - The flow upload item to display
 * @property onAbort - Called when the abort button is clicked
 * @property onRetry - Called when the retry button is clicked
 * @property onRemove - Called when the remove button is clicked
 */
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
 * Pre-styled flow upload list item component with status indicators.
 * Displays file name, upload progress, status, and contextual action buttons.
 *
 * Features:
 * - Status-specific icons and colors
 * - Progress bar with percentage and byte count
 * - Error message display
 * - Contextual action buttons (cancel, retry, remove)
 *
 * @param props - Upload item and callback functions
 * @returns Styled flow upload list item component
 *
 * @example
 * ```tsx
 * <SimpleFlowUploadListItem
 *   item={uploadItem}
 *   onAbort={() => console.log('Abort')}
 *   onRetry={() => console.log('Retry')}
 *   onRemove={() => console.log('Remove')}
 * />
 * ```
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

/**
 * Props for the SimpleFlowUploadList component.
 *
 * @property flowConfig - Flow execution configuration
 * @property options - Multi-flow upload options (callbacks, concurrency)
 * @property className - CSS class name for the container
 * @property showFileInput - Whether to display the file input (default: true)
 * @property accept - Accepted file types for the file input
 */
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
 * Simple pre-styled flow upload list component with built-in UI.
 * Provides a ready-to-use interface for batch file uploads with flow processing.
 *
 * Features:
 * - Built-in file input
 * - Overall progress display
 * - Individual item progress tracking
 * - Status indicators and action buttons
 * - Automatic upload start on file selection
 *
 * @param props - Flow upload list configuration with styling options
 * @returns Styled flow upload list component
 *
 * @example
 * ```tsx
 * // Basic batch image upload
 * <SimpleFlowUploadList
 *   flowConfig={{
 *     flowId: "image-batch-processing",
 *     storageId: "s3-images",
 *   }}
 *   options={{
 *     maxConcurrent: 3,
 *     onItemSuccess: (item) => {
 *       console.log(`${item.file.name} processed`);
 *     },
 *     onComplete: (items) => {
 *       console.log("Batch complete:", items.length);
 *     },
 *   }}
 *   accept="image/*"
 *   className="my-upload-list"
 * />
 *
 * // Without file input (add files programmatically)
 * <SimpleFlowUploadList
 *   flowConfig={{
 *     flowId: "document-processing",
 *     storageId: "docs",
 *   }}
 *   showFileInput={false}
 *   options={{
 *     maxConcurrent: 2,
 *   }}
 * />
 * ```
 *
 * @see {@link FlowUploadList} for the headless version with full control
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
