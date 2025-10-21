import type React from "react";
import type {
  UploadItem,
  UseMultiUploadReturn,
} from "../hooks/use-multi-upload";
import type { UploadStatus } from "../hooks/use-upload";

/**
 * Render props passed to the UploadList children function.
 * Provides organized access to upload items, status groupings, and actions.
 *
 * @property items - All upload items (filtered and sorted if configured)
 * @property itemsByStatus - Upload items grouped by their current status
 * @property multiUpload - Complete multi-upload hook instance
 * @property actions - Helper functions for common item operations
 * @property actions.removeItem - Remove an item from the list
 * @property actions.retryItem - Retry a failed upload
 * @property actions.abortItem - Cancel an active upload
 * @property actions.startItem - Begin uploading an idle item
 */
export interface UploadListRenderProps {
  /**
   * All upload items
   */
  items: UploadItem[];

  /**
   * Items filtered by status
   */
  itemsByStatus: {
    idle: UploadItem[];
    uploading: UploadItem[];
    success: UploadItem[];
    error: UploadItem[];
    aborted: UploadItem[];
  };

  /**
   * Multi-upload state and controls
   */
  multiUpload: UseMultiUploadReturn;

  /**
   * Helper functions for item management
   */
  actions: {
    removeItem: (id: string) => void;
    retryItem: (item: UploadItem) => void;
    abortItem: (item: UploadItem) => void;
    startItem: (item: UploadItem) => void;
  };
}

/**
 * Props for the UploadList component.
 *
 * @property multiUpload - Multi-upload hook instance to display
 * @property filter - Optional function to filter which items to show
 * @property sortBy - Optional comparator function to sort items
 * @property children - Render function receiving list state and actions
 */
export interface UploadListProps {
  /**
   * Multi-upload instance from useMultiUpload hook
   */
  multiUpload: UseMultiUploadReturn;

  /**
   * Optional filter for which items to display
   */
  filter?: (item: UploadItem) => boolean;

  /**
   * Optional sorting function for items
   */
  sortBy?: (a: UploadItem, b: UploadItem) => number;

  /**
   * Render prop that receives upload list state and actions
   */
  children: (props: UploadListRenderProps) => React.ReactNode;
}

/**
 * Headless upload list component that provides flexible rendering for upload items.
 * Uses render props pattern to give full control over how upload items are displayed.
 *
 * @param props - Upload list configuration and render prop
 * @returns Rendered upload list using the provided render prop
 *
 * @example
 * ```tsx
 * // Basic upload list with progress bars
 * <UploadList multiUpload={multiUpload}>
 *   {({ items, actions }) => (
 *     <div>
 *       <h3>Upload Queue ({items.length} files)</h3>
 *       {items.map((item) => (
 *         <div key={item.id} style={{
 *           padding: '1rem',
 *           border: '1px solid #ccc',
 *           marginBottom: '0.5rem',
 *           borderRadius: '4px'
 *         }}>
 *           <div style={{ display: 'flex', justifyContent: 'space-between' }}>
 *             <span>{item.file.name}</span>
 *             <span>{item.state.status}</span>
 *           </div>
 *
 *           {item.state.status === 'uploading' && (
 *             <div>
 *               <progress value={item.state.progress} max={100} />
 *               <span>{item.state.progress}%</span>
 *               <button onClick={() => actions.abortItem(item)}>Cancel</button>
 *             </div>
 *           )}
 *
 *           {item.state.status === 'error' && (
 *             <div>
 *               <p style={{ color: 'red' }}>Error: {item.state.error?.message}</p>
 *               <button onClick={() => actions.retryItem(item)}>Retry</button>
 *               <button onClick={() => actions.removeItem(item.id)}>Remove</button>
 *             </div>
 *           )}
 *
 *           {item.state.status === 'success' && (
 *             <div>
 *               <p style={{ color: 'green' }}>✓ Uploaded successfully</p>
 *               <button onClick={() => actions.removeItem(item.id)}>Remove</button>
 *             </div>
 *           )}
 *
 *           {item.state.status === 'idle' && (
 *             <div>
 *               <button onClick={() => actions.startItem(item)}>Start Upload</button>
 *               <button onClick={() => actions.removeItem(item.id)}>Remove</button>
 *             </div>
 *           )}
 *         </div>
 *       ))}
 *     </div>
 *   )}
 * </UploadList>
 *
 * // Upload list with status filtering and sorting
 * <UploadList
 *   multiUpload={multiUpload}
 *   filter={(item) => item.state.status !== 'success'} // Hide successful uploads
 *   sortBy={(a, b) => {
 *     // Sort by status priority, then by filename
 *     const statusPriority = { error: 0, uploading: 1, idle: 2, success: 3, aborted: 4 };
 *     const aPriority = statusPriority[a.state.status];
 *     const bPriority = statusPriority[b.state.status];
 *
 *     if (aPriority !== bPriority) {
 *       return aPriority - bPriority;
 *     }
 *
 *     return a.file.name.localeCompare(b.file.name);
 *   }}
 * >
 *   {({ items, itemsByStatus, multiUpload, actions }) => (
 *     <div>
 *       {itemsByStatus.error.length > 0 && (
 *         <div>
 *           <h4 style={{ color: 'red' }}>Failed Uploads ({itemsByStatus.error.length})</h4>
 *           {itemsByStatus.error.map((item) => (
 *             <UploadListItem key={item.id} item={item} actions={actions} />
 *           ))}
 *         </div>
 *       )}
 *
 *       {itemsByStatus.uploading.length > 0 && (
 *         <div>
 *           <h4>Uploading ({itemsByStatus.uploading.length})</h4>
 *           {itemsByStatus.uploading.map((item) => (
 *             <UploadListItem key={item.id} item={item} actions={actions} />
 *           ))}
 *         </div>
 *       )}
 *
 *       {itemsByStatus.idle.length > 0 && (
 *         <div>
 *           <h4>Pending ({itemsByStatus.idle.length})</h4>
 *           {itemsByStatus.idle.map((item) => (
 *             <UploadListItem key={item.id} item={item} actions={actions} />
 *           ))}
 *         </div>
 *       )}
 *     </div>
 *   )}
 * </UploadList>
 * ```
 */
export function UploadList({
  multiUpload,
  filter,
  sortBy,
  children,
}: UploadListProps) {
  // Apply filtering
  let items = multiUpload.items;
  if (filter) {
    items = items.filter(filter);
  }

  // Apply sorting
  if (sortBy) {
    items = [...items].sort(sortBy);
  }

  // Group items by status
  const itemsByStatus = {
    idle: items.filter((item) => item.state.status === "idle"),
    uploading: items.filter((item) => item.state.status === "uploading"),
    success: items.filter((item) => item.state.status === "success"),
    error: items.filter((item) => item.state.status === "error"),
    aborted: items.filter((item) => item.state.status === "aborted"),
  };

  // Create action helpers
  const actions = {
    removeItem: (id: string) => {
      multiUpload.removeItem(id);
    },
    retryItem: (_item: UploadItem) => {
      // Retry failed uploads using multiUpload method
      multiUpload.retryFailed();
    },
    abortItem: (item: UploadItem) => {
      // Remove the item to effectively abort it
      multiUpload.removeItem(item.id);
    },
    startItem: (_item: UploadItem) => {
      // Start all pending uploads
      multiUpload.startAll();
    },
  };

  // Create render props object
  const renderProps: UploadListRenderProps = {
    items,
    itemsByStatus,
    multiUpload,
    actions,
  };

  return <>{children(renderProps)}</>;
}

/**
 * Props for the SimpleUploadListItem component.
 *
 * @property item - The upload item to display
 * @property actions - Action functions from UploadList render props
 * @property className - Additional CSS class name
 * @property style - Inline styles for the item container
 * @property showDetails - Whether to display file size and upload details
 */
export interface SimpleUploadListItemProps {
  /**
   * The upload item to render
   */
  item: UploadItem;

  /**
   * Actions from UploadList render props
   */
  actions: UploadListRenderProps["actions"];

  /**
   * Additional CSS class name
   */
  className?: string;

  /**
   * Inline styles
   */
  style?: React.CSSProperties;

  /**
   * Whether to show detailed information (file size, speed, etc.)
   */
  showDetails?: boolean;
}

/**
 * Pre-styled upload list item component with status indicators and action buttons.
 * Displays file info, progress, errors, and contextual actions based on upload status.
 *
 * Features:
 * - Status-specific color coding and icons
 * - Progress bar for active uploads
 * - Error message display
 * - File size formatting
 * - Contextual action buttons (start, cancel, retry, remove)
 *
 * @param props - Upload item and configuration
 * @returns Styled upload list item component
 *
 * @example
 * ```tsx
 * // Use with UploadList
 * <UploadList multiUpload={multiUpload}>
 *   {({ items, actions }) => (
 *     <div>
 *       {items.map((item) => (
 *         <SimpleUploadListItem
 *           key={item.id}
 *           item={item}
 *           actions={actions}
 *           showDetails={true}
 *         />
 *       ))}
 *     </div>
 *   )}
 * </UploadList>
 *
 * // Custom styling
 * <SimpleUploadListItem
 *   item={uploadItem}
 *   actions={actions}
 *   className="my-upload-item"
 *   style={{ borderRadius: '12px', margin: '1rem' }}
 *   showDetails={true}
 * />
 * ```
 */
export function SimpleUploadListItem({
  item,
  actions,
  className = "",
  style = {},
  showDetails = true,
}: SimpleUploadListItemProps) {
  const getStatusColor = (status: UploadStatus) => {
    switch (status) {
      case "idle":
        return "#6c757d";
      case "uploading":
        return "#007bff";
      case "success":
        return "#28a745";
      case "error":
        return "#dc3545";
      case "aborted":
        return "#6c757d";
      default:
        return "#6c757d";
    }
  };

  const getStatusIcon = (status: UploadStatus) => {
    switch (status) {
      case "idle":
        return "⏳";
      case "uploading":
        return "📤";
      case "success":
        return "✅";
      case "error":
        return "❌";
      case "aborted":
        return "⏹️";
      default:
        return "❓";
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div
      className={`upload-list-item upload-list-item--${item.state.status} ${className}`}
      style={{
        padding: "12px",
        border: "1px solid #e0e0e0",
        borderRadius: "6px",
        marginBottom: "8px",
        backgroundColor: "#fff",
        transition: "all 0.2s ease",
        ...style,
      }}
    >
      {/* Header with filename and status */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1 }}
        >
          <span style={{ fontSize: "16px" }}>
            {getStatusIcon(item.state.status)}
          </span>
          <span style={{ fontWeight: "500", flex: 1 }}>
            {item.file instanceof File ? item.file.name : "File"}
          </span>
        </div>
        <span
          style={{
            fontSize: "12px",
            color: getStatusColor(item.state.status),
            fontWeight: "500",
            textTransform: "uppercase",
          }}
        >
          {item.state.status}
        </span>
      </div>

      {/* Progress bar for uploading items */}
      {item.state.status === "uploading" && (
        <div style={{ marginBottom: "8px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "4px",
            }}
          >
            <span style={{ fontSize: "12px", color: "#666" }}>
              {item.state.progress}%
            </span>
            {showDetails && item.state.totalBytes && (
              <span style={{ fontSize: "12px", color: "#666" }}>
                {formatFileSize(item.state.bytesUploaded)} /{" "}
                {formatFileSize(item.state.totalBytes)}
              </span>
            )}
          </div>
          <div
            style={{
              width: "100%",
              height: "6px",
              backgroundColor: "#e0e0e0",
              borderRadius: "3px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${item.state.progress}%`,
                height: "100%",
                backgroundColor: "#007bff",
                transition: "width 0.2s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Details section */}
      {showDetails && (
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "8px" }}>
          {item.state.totalBytes && (
            <span>{formatFileSize(item.state.totalBytes)}</span>
          )}
          {item.state.status === "uploading" && item.state.progress > 0 && (
            <span> • Progress: {item.state.progress}%</span>
          )}
          {item.state.status === "error" && item.state.error && (
            <div style={{ color: "#dc3545", marginTop: "4px" }}>
              {item.state.error.message}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {item.state.status === "idle" && (
          <>
            <button
              type="button"
              onClick={() => actions.startItem(item)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid #007bff",
                backgroundColor: "#007bff",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => actions.removeItem(item.id)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid #6c757d",
                backgroundColor: "transparent",
                color: "#6c757d",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </>
        )}

        {item.state.status === "uploading" && (
          <button
            type="button"
            onClick={() => actions.abortItem(item)}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              border: "1px solid #dc3545",
              backgroundColor: "transparent",
              color: "#dc3545",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        )}

        {item.state.status === "error" && (
          <>
            <button
              type="button"
              onClick={() => actions.retryItem(item)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid #28a745",
                backgroundColor: "#28a745",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => actions.removeItem(item.id)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid #6c757d",
                backgroundColor: "transparent",
                color: "#6c757d",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </>
        )}

        {item.state.status === "success" && (
          <button
            type="button"
            onClick={() => actions.removeItem(item.id)}
            style={{
              padding: "4px 8px",
              fontSize: "12px",
              border: "1px solid #6c757d",
              backgroundColor: "transparent",
              color: "#6c757d",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        )}

        {item.state.status === "aborted" && (
          <>
            <button
              type="button"
              onClick={() => actions.retryItem(item)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid #007bff",
                backgroundColor: "#007bff",
                color: "white",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => actions.removeItem(item.id)}
              style={{
                padding: "4px 8px",
                fontSize: "12px",
                border: "1px solid #6c757d",
                backgroundColor: "transparent",
                color: "#6c757d",
                borderRadius: "4px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
