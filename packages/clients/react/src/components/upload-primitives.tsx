"use client";

import type { BrowserUploadInput } from "@uploadista/client-browser";
import type { UploadFile } from "@uploadista/core/types";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
} from "react";
import {
  type DragDropState,
  type UseDragDropReturn,
  useDragDrop,
} from "../hooks/use-drag-drop";
import {
  type MultiUploadState,
  type UploadItem,
  useMultiUpload,
} from "../hooks/use-multi-upload";
import type { UploadState, UploadStatus } from "../hooks/use-upload";

// Re-export types for convenience
export type { UploadState, UploadStatus, UploadItem, MultiUploadState };

// ============ UPLOAD CONTEXT ============

/**
 * Context value provided by the Upload component root.
 * Contains all upload state and actions.
 */
export interface UploadContextValue {
  /** Whether in multi-file mode */
  mode: "single" | "multi";
  /** Current multi-upload state (aggregate) */
  state: MultiUploadState;
  /** All upload items */
  items: UploadItem[];
  /** Whether auto-start is enabled */
  autoStart: boolean;

  /** Add files to the upload queue */
  addFiles: (files: BrowserUploadInput[]) => void;
  /** Remove an item from the queue */
  removeItem: (id: string) => void;
  /** Start all pending uploads */
  startAll: () => void;
  /** Abort a specific upload by ID */
  abortUpload: (id: string) => void;
  /** Abort all active uploads */
  abortAll: () => void;
  /** Retry a specific failed upload by ID */
  retryUpload: (id: string) => void;
  /** Retry all failed uploads */
  retryFailed: () => void;
  /** Clear all completed uploads */
  clearCompleted: () => void;
  /** Clear all items and reset state */
  clearAll: () => void;

  /** Internal handler for files received from drop zone */
  handleFilesReceived: (files: File[]) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * Hook to access upload context from within an Upload component.
 * @throws Error if used outside of an Upload component
 */
export function useUploadContext(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error(
      "useUploadContext must be used within an <Upload> component. " +
        'Wrap your component tree with <Upload onSuccess={...}>',
    );
  }
  return context;
}

// ============ UPLOAD ITEM CONTEXT ============

/**
 * Context value for a specific upload item within an Upload.
 */
export interface UploadItemContextValue {
  /** Item ID */
  id: string;
  /** The file being uploaded */
  file: BrowserUploadInput;
  /** Current upload state */
  state: UploadState;
  /** Abort this upload */
  abort: () => void;
  /** Retry this upload */
  retry: () => void;
  /** Remove this item from the queue */
  remove: () => void;
}

const UploadItemContext = createContext<UploadItemContextValue | null>(null);

/**
 * Hook to access upload item context from within an Upload.Item component.
 * @throws Error if used outside of an Upload.Item component
 */
export function useUploadItemContext(): UploadItemContextValue {
  const context = useContext(UploadItemContext);
  if (!context) {
    throw new Error(
      "useUploadItemContext must be used within an <Upload.Item> component. " +
        'Wrap your component with <Upload.Item id="...">',
    );
  }
  return context;
}

// ============ UPLOAD ROOT COMPONENT ============

/**
 * Props for the Upload root component.
 */
export interface UploadProps {
  /** Whether to allow multiple file uploads (default: false) */
  multiple?: boolean;
  /** Maximum concurrent uploads (default: 3, only used in multi mode) */
  maxConcurrent?: number;
  /** Whether to auto-start uploads when files are received (default: true) */
  autoStart?: boolean;
  /** Metadata to attach to uploads */
  metadata?: Record<string, string>;
  /** Called when a single file upload succeeds (single mode) */
  onSuccess?: (result: UploadFile) => void;
  /** Called when an upload fails */
  onError?: (error: Error, item?: UploadItem) => void;
  /** Called when all uploads complete (multi mode) */
  onComplete?: (results: {
    successful: UploadItem[];
    failed: UploadItem[];
    total: number;
  }) => void;
  /** Called when an individual upload starts */
  onUploadStart?: (item: UploadItem) => void;
  /** Called on upload progress */
  onProgress?: (
    item: UploadItem,
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
  /** Children to render */
  children: ReactNode;
}

/**
 * Root component for file uploads.
 * Provides context for all Upload sub-components.
 * Supports both single-file and multi-file modes via the `multiple` prop.
 *
 * @example Single file upload
 * ```tsx
 * <Upload onSuccess={handleSuccess}>
 *   <Upload.DropZone accept="image/*">
 *     {({ isDragging, getRootProps, getInputProps }) => (
 *       <div {...getRootProps()}>
 *         <input {...getInputProps()} />
 *         {isDragging ? "Drop here" : "Drag or click"}
 *       </div>
 *     )}
 *   </Upload.DropZone>
 *   <Upload.Progress>
 *     {({ progress }) => <progress value={progress} max={100} />}
 *   </Upload.Progress>
 * </Upload>
 * ```
 *
 * @example Multi-file upload
 * ```tsx
 * <Upload multiple maxConcurrent={3} onComplete={handleComplete}>
 *   <Upload.DropZone>
 *     {(props) => ...}
 *   </Upload.DropZone>
 *   <Upload.Items>
 *     {({ items }) => items.map(item => (
 *       <Upload.Item key={item.id} id={item.id}>
 *         {({ file, state, abort, remove }) => (
 *           <div>{file.name}: {state.progress}%</div>
 *         )}
 *       </Upload.Item>
 *     ))}
 *   </Upload.Items>
 *   <Upload.StartAll>Upload All</Upload.StartAll>
 * </Upload>
 * ```
 */
function UploadRoot({
  multiple = false,
  maxConcurrent = 3,
  autoStart = true,
  metadata,
  onSuccess,
  onError,
  onComplete,
  onUploadStart,
  onProgress,
  children,
}: UploadProps) {
  const multiUpload = useMultiUpload({
    maxConcurrent,
    metadata,
    onUploadStart,
    onUploadProgress: onProgress,
    onUploadSuccess: (item, result) => {
      // In single mode, call onSuccess directly
      if (!multiple) {
        onSuccess?.(result);
      }
    },
    onUploadError: (item, error) => {
      onError?.(error, item);
    },
    onComplete,
  });

  const handleFilesReceived = useCallback(
    (files: File[]) => {
      if (!multiple) {
        // Single mode: clear existing and add new file
        multiUpload.clearAll();
      }
      multiUpload.addFiles(files);
      if (autoStart) {
        // Use setTimeout to ensure state is updated before starting
        setTimeout(() => multiUpload.startAll(), 0);
      }
    },
    [multiple, autoStart, multiUpload],
  );

  const contextValue: UploadContextValue = {
    mode: multiple ? "multi" : "single",
    state: multiUpload.state,
    items: multiUpload.items,
    autoStart,
    addFiles: multiUpload.addFiles,
    removeItem: multiUpload.removeItem,
    startAll: multiUpload.startAll,
    abortUpload: multiUpload.abortUpload,
    abortAll: multiUpload.abortAll,
    retryUpload: multiUpload.retryUpload,
    retryFailed: multiUpload.retryFailed,
    clearCompleted: multiUpload.clearCompleted,
    clearAll: multiUpload.clearAll,
    handleFilesReceived,
  };

  return (
    <UploadContext.Provider value={contextValue}>
      {children}
    </UploadContext.Provider>
  );
}

// ============ DROP ZONE PRIMITIVE ============

/**
 * Render props for Upload.DropZone component.
 */
export interface UploadDropZoneRenderProps {
  /** Whether files are being dragged over */
  isDragging: boolean;
  /** Whether drag is over the zone */
  isOver: boolean;
  /** Validation errors */
  errors: string[];
  /** Props to spread on the drop zone container */
  getRootProps: () => UseDragDropReturn["dragHandlers"];
  /** Props to spread on the hidden file input */
  getInputProps: () => UseDragDropReturn["inputProps"];
  /** Open file picker programmatically */
  openFilePicker: () => void;
  /** Current drag-drop state */
  dragDropState: DragDropState;
}

/**
 * Props for Upload.DropZone component.
 */
export interface UploadDropZoneProps {
  /** Accepted file types (e.g., "image/*", ".pdf") */
  accept?: string;
  /** Maximum file size in bytes */
  maxFileSize?: number;
  /** Maximum number of files (only in multi mode) */
  maxFiles?: number;
  /** Render function receiving drop zone state */
  children: (props: UploadDropZoneRenderProps) => ReactNode;
}

/**
 * Drop zone for file uploads within an Upload component.
 * Handles drag-and-drop and click-to-select file selection.
 *
 * @example
 * ```tsx
 * <Upload.DropZone accept="image/*">
 *   {({ isDragging, getRootProps, getInputProps }) => (
 *     <div {...getRootProps()}>
 *       <input {...getInputProps()} />
 *       {isDragging ? "Drop here" : "Click or drag"}
 *     </div>
 *   )}
 * </Upload.DropZone>
 * ```
 */
function UploadDropZone({
  accept,
  maxFileSize,
  maxFiles,
  children,
}: UploadDropZoneProps) {
  const upload = useUploadContext();

  const dragDrop = useDragDrop({
    onFilesReceived: upload.handleFilesReceived,
    accept: accept ? accept.split(",").map((t) => t.trim()) : undefined,
    maxFileSize,
    maxFiles: upload.mode === "multi" ? maxFiles : 1,
    multiple: upload.mode === "multi",
  });

  const renderProps: UploadDropZoneRenderProps = {
    isDragging: dragDrop.state.isDragging,
    isOver: dragDrop.state.isOver,
    errors: dragDrop.state.errors,
    getRootProps: () => dragDrop.dragHandlers,
    getInputProps: () => dragDrop.inputProps,
    openFilePicker: dragDrop.openFilePicker,
    dragDropState: dragDrop.state,
  };

  return <>{children(renderProps)}</>;
}

// ============ ITEMS PRIMITIVE ============

/**
 * Render props for Upload.Items component.
 */
export interface UploadItemsRenderProps {
  /** All upload items */
  items: UploadItem[];
  /** Whether there are any items */
  hasItems: boolean;
  /** Whether items array is empty */
  isEmpty: boolean;
}

/**
 * Props for Upload.Items component.
 */
export interface UploadItemsProps {
  /** Render function receiving items */
  children: (props: UploadItemsRenderProps) => ReactNode;
}

/**
 * Renders the list of upload items via render props.
 *
 * @example
 * ```tsx
 * <Upload.Items>
 *   {({ items, isEmpty }) => (
 *     isEmpty ? <p>No files</p> : (
 *       items.map(item => (
 *         <Upload.Item key={item.id} id={item.id}>
 *           {(props) => ...}
 *         </Upload.Item>
 *       ))
 *     )
 *   )}
 * </Upload.Items>
 * ```
 */
function UploadItems({ children }: UploadItemsProps) {
  const upload = useUploadContext();

  const renderProps: UploadItemsRenderProps = {
    items: upload.items,
    hasItems: upload.items.length > 0,
    isEmpty: upload.items.length === 0,
  };

  return <>{children(renderProps)}</>;
}

// ============ ITEM PRIMITIVE ============

/**
 * Props for Upload.Item component.
 */
export interface UploadItemProps {
  /** Item ID */
  id: string;
  /** Children (can be render function or regular children) */
  children: ReactNode | ((props: UploadItemContextValue) => ReactNode);
}

/**
 * Scoped context provider for a specific upload item.
 * Children can access item-specific state via useUploadItemContext().
 *
 * @example
 * ```tsx
 * <Upload.Item id={item.id}>
 *   {({ file, state, abort, remove }) => (
 *     <div>
 *       <span>{file.name}</span>
 *       <progress value={state.progress} max={100} />
 *       <button onClick={abort}>Cancel</button>
 *       <button onClick={remove}>Remove</button>
 *     </div>
 *   )}
 * </Upload.Item>
 * ```
 */
function UploadItem({ id, children }: UploadItemProps) {
  const upload = useUploadContext();

  const item = upload.items.find((i) => i.id === id);

  if (!item) {
    // Item not found
    return null;
  }

  const contextValue: UploadItemContextValue = {
    id,
    file: item.file,
    state: item.state,
    abort: () => upload.abortUpload(id),
    retry: () => upload.retryUpload(id),
    remove: () => upload.removeItem(id),
  };

  return (
    <UploadItemContext.Provider value={contextValue}>
      {typeof children === "function" ? children(contextValue) : children}
    </UploadItemContext.Provider>
  );
}

// ============ PROGRESS PRIMITIVE ============

/**
 * Render props for Upload.Progress component.
 */
export interface UploadProgressRenderProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes uploaded so far */
  bytesUploaded: number;
  /** Total bytes to upload */
  totalBytes: number;
  /** Whether any uploads are active */
  isUploading: boolean;
}

/**
 * Props for Upload.Progress component.
 */
export interface UploadProgressProps {
  /** Render function receiving progress state */
  children: (props: UploadProgressRenderProps) => ReactNode;
}

/**
 * Progress display component within an Upload.
 *
 * @example
 * ```tsx
 * <Upload.Progress>
 *   {({ progress, isUploading }) => (
 *     isUploading && <progress value={progress} max={100} />
 *   )}
 * </Upload.Progress>
 * ```
 */
function UploadProgress({ children }: UploadProgressProps) {
  const upload = useUploadContext();

  const renderProps: UploadProgressRenderProps = {
    progress: upload.state.progress,
    bytesUploaded: upload.state.totalBytesUploaded,
    totalBytes: upload.state.totalBytes,
    isUploading: upload.state.isUploading,
  };

  return <>{children(renderProps)}</>;
}

// ============ STATUS PRIMITIVE ============

/**
 * Render props for Upload.Status component.
 */
export interface UploadStatusRenderProps {
  /** Overall status */
  status: "idle" | "uploading" | "success" | "error";
  /** Whether idle (no uploads active or completed) */
  isIdle: boolean;
  /** Whether uploading */
  isUploading: boolean;
  /** Whether all uploads succeeded */
  isSuccess: boolean;
  /** Whether any upload failed */
  isError: boolean;
  /** Whether all uploads completed (success or failure) */
  isComplete: boolean;
  /** Number of total items */
  total: number;
  /** Number of successful uploads */
  successful: number;
  /** Number of failed uploads */
  failed: number;
  /** Number of currently uploading */
  uploading: number;
}

/**
 * Props for Upload.Status component.
 */
export interface UploadStatusProps {
  /** Render function receiving status state */
  children: (props: UploadStatusRenderProps) => ReactNode;
}

/**
 * Status display component within an Upload.
 *
 * @example
 * ```tsx
 * <Upload.Status>
 *   {({ status, total, successful, failed }) => (
 *     <div>
 *       Status: {status}
 *       ({successful}/{total} uploaded, {failed} failed)
 *     </div>
 *   )}
 * </Upload.Status>
 * ```
 */
function UploadStatus({ children }: UploadStatusProps) {
  const upload = useUploadContext();
  const { state } = upload;

  // Derive overall status
  let status: "idle" | "uploading" | "success" | "error" = "idle";
  if (state.isUploading) {
    status = "uploading";
  } else if (state.isComplete) {
    status = state.failed > 0 ? "error" : "success";
  }

  const renderProps: UploadStatusRenderProps = {
    status,
    isIdle: status === "idle",
    isUploading: state.isUploading,
    isSuccess: state.isComplete && state.failed === 0,
    isError: state.failed > 0,
    isComplete: state.isComplete,
    total: state.total,
    successful: state.successful,
    failed: state.failed,
    uploading: state.uploading,
  };

  return <>{children(renderProps)}</>;
}

// ============ ERROR PRIMITIVE ============

/**
 * Render props for Upload.Error component.
 */
export interface UploadErrorRenderProps {
  /** Whether there are any errors */
  hasError: boolean;
  /** Number of failed uploads */
  failedCount: number;
  /** Failed items */
  failedItems: UploadItem[];
  /** Reset/clear all errors */
  reset: () => void;
}

/**
 * Props for Upload.Error component.
 */
export interface UploadErrorProps {
  /** Render function receiving error state */
  children: (props: UploadErrorRenderProps) => ReactNode;
}

/**
 * Error display component within an Upload.
 *
 * @example
 * ```tsx
 * <Upload.Error>
 *   {({ hasError, failedItems, reset }) => (
 *     hasError && (
 *       <div>
 *         {failedItems.map(item => (
 *           <p key={item.id}>{item.file.name}: {item.state.error?.message}</p>
 *         ))}
 *         <button onClick={reset}>Clear</button>
 *       </div>
 *     )
 *   )}
 * </Upload.Error>
 * ```
 */
function UploadError({ children }: UploadErrorProps) {
  const upload = useUploadContext();

  const failedItems = upload.items.filter((item) =>
    ["error", "aborted"].includes(item.state.status),
  );

  const renderProps: UploadErrorRenderProps = {
    hasError: failedItems.length > 0,
    failedCount: failedItems.length,
    failedItems,
    reset: upload.clearCompleted,
  };

  return <>{children(renderProps)}</>;
}

// ============ ACTION PRIMITIVES ============

/**
 * Props for Upload.Cancel component.
 */
export interface UploadCancelProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Cancel button that aborts all active uploads.
 * Automatically disabled when no uploads are active.
 */
function UploadCancel({ children, disabled, ...props }: UploadCancelProps) {
  const upload = useUploadContext();

  const handleClick = useCallback(() => {
    upload.abortAll();
  }, [upload]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !upload.state.isUploading}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Props for Upload.Retry component.
 */
export interface UploadRetryProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Retry button that retries all failed uploads.
 * Automatically disabled when no failed uploads exist.
 */
function UploadRetry({ children, disabled, ...props }: UploadRetryProps) {
  const upload = useUploadContext();

  const handleClick = useCallback(() => {
    upload.retryFailed();
  }, [upload]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || upload.state.failed === 0}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Props for Upload.Reset component.
 */
export interface UploadResetProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Reset button that clears all items and resets state.
 */
function UploadReset({ children, ...props }: UploadResetProps) {
  const upload = useUploadContext();

  const handleClick = useCallback(() => {
    upload.clearAll();
  }, [upload]);

  return (
    <button type="button" onClick={handleClick} {...props}>
      {children}
    </button>
  );
}

/**
 * Props for Upload.StartAll component.
 */
export interface UploadStartAllProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Start all button that begins all queued uploads.
 * Primarily useful when autoStart is disabled.
 * Automatically disabled when uploads are already active.
 */
function UploadStartAll({ children, disabled, ...props }: UploadStartAllProps) {
  const upload = useUploadContext();

  const handleClick = useCallback(() => {
    upload.startAll();
  }, [upload]);

  // Count idle items
  const idleCount = upload.items.filter(
    (item) => item.state.status === "idle",
  ).length;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || upload.state.isUploading || idleCount === 0}
      {...props}
    >
      {children}
    </button>
  );
}

/**
 * Props for Upload.ClearCompleted component.
 */
export interface UploadClearCompletedProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  /** Button content */
  children: ReactNode;
}

/**
 * Clear completed button that removes all finished uploads from the list.
 * Automatically disabled when no completed uploads exist.
 */
function UploadClearCompleted({
  children,
  disabled,
  ...props
}: UploadClearCompletedProps) {
  const upload = useUploadContext();

  const handleClick = useCallback(() => {
    upload.clearCompleted();
  }, [upload]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || upload.state.completed === 0}
      {...props}
    >
      {children}
    </button>
  );
}

// ============ COMPOUND COMPONENT EXPORT ============

/**
 * Upload compound component for file uploads.
 *
 * Provides a composable, headless API for building upload interfaces.
 * Supports both single-file and multi-file modes via the `multiple` prop.
 * All sub-components use render props for complete UI control.
 *
 * @example Single file upload
 * ```tsx
 * <Upload onSuccess={handleSuccess}>
 *   <Upload.DropZone accept="image/*">
 *     {({ isDragging, getRootProps, getInputProps }) => (
 *       <div {...getRootProps()}>
 *         <input {...getInputProps()} />
 *         {isDragging ? "Drop here" : "Drag or click"}
 *       </div>
 *     )}
 *   </Upload.DropZone>
 *   <Upload.Progress>
 *     {({ progress }) => <progress value={progress} max={100} />}
 *   </Upload.Progress>
 * </Upload>
 * ```
 *
 * @example Multi-file upload
 * ```tsx
 * <Upload multiple maxConcurrent={3} onComplete={handleComplete}>
 *   <Upload.DropZone>
 *     {({ getRootProps, getInputProps }) => (
 *       <div {...getRootProps()}>
 *         <input {...getInputProps()} />
 *         Drop files here
 *       </div>
 *     )}
 *   </Upload.DropZone>
 *   <Upload.Items>
 *     {({ items }) => items.map(item => (
 *       <Upload.Item key={item.id} id={item.id}>
 *         {({ file, state, abort, remove }) => (
 *           <div>
 *             {file.name}: {state.progress}%
 *             <button onClick={abort}>Cancel</button>
 *             <button onClick={remove}>Remove</button>
 *           </div>
 *         )}
 *       </Upload.Item>
 *     ))}
 *   </Upload.Items>
 *   <Upload.StartAll>Upload All</Upload.StartAll>
 *   <Upload.Cancel>Cancel All</Upload.Cancel>
 *   <Upload.ClearCompleted>Clear Completed</Upload.ClearCompleted>
 * </Upload>
 * ```
 */
export const Upload = Object.assign(UploadRoot, {
  DropZone: UploadDropZone,
  Items: UploadItems,
  Item: UploadItem,
  Progress: UploadProgress,
  Status: UploadStatus,
  Error: UploadError,
  Cancel: UploadCancel,
  Retry: UploadRetry,
  Reset: UploadReset,
  StartAll: UploadStartAll,
  ClearCompleted: UploadClearCompleted,
});
