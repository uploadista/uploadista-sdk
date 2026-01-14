import type { UploadFile } from "@uploadista/core/types";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import {
  type MultiUploadState,
  type UploadItemState,
  useMultiUpload,
} from "../hooks/use-multi-upload";
import { useUploadistaContext } from "../hooks/use-uploadista-context";
import type { FilePickResult } from "../types";

// Re-export types for convenience
export type { MultiUploadState, UploadItemState };

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
  /** Whether auto-start is enabled */
  autoStart: boolean;

  /** Add files to the upload queue */
  addFiles: (files: FilePickResult[]) => string[];
  /** Remove an item from the queue */
  removeItem: (id: string) => void;
  /** Start all pending uploads */
  startAll: (itemIds?: string[]) => Promise<void>;
  /** Abort a specific upload by ID */
  abortItem: (id: string) => void;
  /** Retry a specific failed upload by ID */
  retryItem: (id: string) => Promise<void>;
  /** Clear all items and reset state */
  clear: () => void;

  /** Internal handler for files received from picker */
  handleFilesReceived: (files: FilePickResult[]) => void;
  /** Pick a file using the file system provider */
  pickFile: () => Promise<FilePickResult | null>;
  /** Pick an image using the file system provider */
  pickImage: () => Promise<FilePickResult | null>;
  /** Take a photo using the camera */
  takePhoto: () => Promise<FilePickResult | null>;
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
        "Wrap your component tree with <Upload>",
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
  file: Extract<FilePickResult, { status: "success" }>;
  /** Current upload state */
  state: {
    status: UploadItemState["status"];
    progress: number;
    bytesUploaded: number;
    totalBytes: number;
    error: Error | null;
    result: UploadFile | null;
  };
  /** Abort this upload */
  abort: () => void;
  /** Retry this upload */
  retry: () => Promise<void>;
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
 * Render props for the Upload root component.
 */
export interface UploadRenderProps extends UploadContextValue {}

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
  /** Called when a single file upload succeeds */
  onSuccess?: (result: UploadFile) => void;
  /** Called when an upload fails */
  onError?: (error: Error) => void;
  /** Called when all uploads complete (multi mode) */
  onComplete?: (results: {
    successful: number;
    failed: number;
    total: number;
  }) => void;
  /** Children to render (can be render function or ReactNode) */
  children: ReactNode | ((props: UploadRenderProps) => ReactNode);
}

/**
 * Root component for file uploads on React Native.
 * Provides context for all Upload sub-components.
 * Supports both single-file and multi-file modes via the `multiple` prop.
 *
 * @example Single file upload
 * ```tsx
 * <Upload onSuccess={handleSuccess}>
 *   <Upload.FilePicker>
 *     {({ pick, isLoading }) => (
 *       <Pressable onPress={pick}>
 *         <Text>Select File</Text>
 *       </Pressable>
 *     )}
 *   </Upload.FilePicker>
 *   <Upload.Progress>
 *     {({ progress, isUploading }) => (
 *       isUploading && <Text>{progress}%</Text>
 *     )}
 *   </Upload.Progress>
 * </Upload>
 * ```
 *
 * @example Multi-file upload
 * ```tsx
 * <Upload multiple maxConcurrent={3} onComplete={handleComplete}>
 *   <Upload.GalleryPicker>
 *     {({ pick }) => (
 *       <Pressable onPress={pick}>
 *         <Text>Select Photos</Text>
 *       </Pressable>
 *     )}
 *   </Upload.GalleryPicker>
 *   <Upload.Items>
 *     {({ items }) => items.map(item => (
 *       <Upload.Item key={item.id} id={item.id}>
 *         {({ file, state, abort, remove }) => (
 *           <View>
 *             <Text>{file.data.name}: {state.progress}%</Text>
 *           </View>
 *         )}
 *       </Upload.Item>
 *     ))}
 *   </Upload.Items>
 *   <Upload.StartAll>
 *     {({ start, disabled }) => (
 *       <Pressable onPress={start} disabled={disabled}>
 *         <Text>Upload All</Text>
 *       </Pressable>
 *     )}
 *   </Upload.StartAll>
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
  children,
}: UploadProps) {
  const { fileSystemProvider } = useUploadistaContext();

  const multiUpload = useMultiUpload({
    maxConcurrent,
    metadata,
    // Cast to unknown since the type definition uses unknown but implementation uses UploadFile
    onSuccess: onSuccess as ((result: unknown) => void) | undefined,
    onError,
  });

  // Track completion
  const checkComplete = useCallback(() => {
    const { items } = multiUpload.state;
    const allComplete =
      items.length > 0 &&
      items.every(
        (item) =>
          item.status === "success" ||
          item.status === "error" ||
          item.status === "aborted",
      );
    if (allComplete && onComplete) {
      const successful = items.filter(
        (item) => item.status === "success",
      ).length;
      const failed = items.filter(
        (item) => item.status === "error" || item.status === "aborted",
      ).length;
      onComplete({ successful, failed, total: items.length });
    }
  }, [multiUpload.state, onComplete]);

  const handleFilesReceived = useCallback(
    (files: FilePickResult[]) => {
      if (!multiple) {
        // Single mode: clear existing
        multiUpload.clear();
      }
      const ids = multiUpload.addFiles(files);
      if (autoStart && ids.length > 0) {
        multiUpload.startUploads(ids).then(checkComplete);
      }
    },
    [multiple, autoStart, multiUpload, checkComplete],
  );

  const pickFile = useCallback(async (): Promise<FilePickResult | null> => {
    if (!fileSystemProvider?.pickDocument) {
      throw new Error("File picker not available");
    }
    const result = await fileSystemProvider.pickDocument();
    if (result.status === "success") {
      handleFilesReceived([result]);
      return result;
    }
    return null;
  }, [fileSystemProvider, handleFilesReceived]);

  const pickImage = useCallback(async (): Promise<FilePickResult | null> => {
    if (!fileSystemProvider?.pickImage) {
      throw new Error("Image picker not available");
    }
    const result = await fileSystemProvider.pickImage({
      allowMultiple: multiple,
    });
    if (result.status === "success") {
      handleFilesReceived([result]);
      return result;
    }
    return null;
  }, [fileSystemProvider, handleFilesReceived, multiple]);

  const takePhoto = useCallback(async (): Promise<FilePickResult | null> => {
    if (!fileSystemProvider?.pickCamera) {
      throw new Error("Camera not available");
    }
    const result = await fileSystemProvider.pickCamera();
    if (result.status === "success") {
      handleFilesReceived([result]);
      return result;
    }
    return null;
  }, [fileSystemProvider, handleFilesReceived]);

  const contextValue: UploadContextValue = {
    mode: multiple ? "multi" : "single",
    state: multiUpload.state,
    autoStart,
    addFiles: multiUpload.addFiles,
    removeItem: multiUpload.removeItem,
    startAll: async (ids) => {
      await multiUpload.startUploads(ids);
      checkComplete();
    },
    abortItem: multiUpload.abortItem,
    retryItem: multiUpload.retryItem,
    clear: multiUpload.clear,
    handleFilesReceived,
    pickFile,
    pickImage,
    takePhoto,
  };

  return (
    <UploadContext.Provider value={contextValue}>
      {typeof children === "function" ? children(contextValue) : children}
    </UploadContext.Provider>
  );
}

// ============ FILE PICKER PRIMITIVE ============

/**
 * Render props for Upload.FilePicker component.
 */
export interface UploadFilePickerRenderProps {
  /** Pick a file */
  pick: () => Promise<void>;
  /** Whether a pick operation is in progress */
  isLoading: boolean;
}

/**
 * Props for Upload.FilePicker component.
 */
export interface UploadFilePickerProps {
  /** Render function receiving picker state */
  children: (props: UploadFilePickerRenderProps) => ReactNode;
}

/**
 * File picker component for document selection.
 *
 * @example
 * ```tsx
 * <Upload.FilePicker>
 *   {({ pick }) => (
 *     <Pressable onPress={pick}>
 *       <Text>Select Document</Text>
 *     </Pressable>
 *   )}
 * </Upload.FilePicker>
 * ```
 */
function UploadFilePicker({ children }: UploadFilePickerProps) {
  const upload = useUploadContext();

  const pick = useCallback(async () => {
    await upload.pickFile();
  }, [upload]);

  const renderProps: UploadFilePickerRenderProps = {
    pick,
    isLoading: upload.state.activeCount > 0,
  };

  return <>{children(renderProps)}</>;
}

// ============ GALLERY PICKER PRIMITIVE ============

/**
 * Render props for Upload.GalleryPicker component.
 */
export interface UploadGalleryPickerRenderProps {
  /** Pick from gallery */
  pick: () => Promise<void>;
  /** Whether a pick operation is in progress */
  isLoading: boolean;
}

/**
 * Props for Upload.GalleryPicker component.
 */
export interface UploadGalleryPickerProps {
  /** Render function receiving picker state */
  children: (props: UploadGalleryPickerRenderProps) => ReactNode;
}

/**
 * Gallery picker component for image selection.
 *
 * @example
 * ```tsx
 * <Upload.GalleryPicker>
 *   {({ pick }) => (
 *     <Pressable onPress={pick}>
 *       <Text>Select Photos</Text>
 *     </Pressable>
 *   )}
 * </Upload.GalleryPicker>
 * ```
 */
function UploadGalleryPicker({ children }: UploadGalleryPickerProps) {
  const upload = useUploadContext();

  const pick = useCallback(async () => {
    await upload.pickImage();
  }, [upload]);

  const renderProps: UploadGalleryPickerRenderProps = {
    pick,
    isLoading: upload.state.activeCount > 0,
  };

  return <>{children(renderProps)}</>;
}

// ============ CAMERA PICKER PRIMITIVE ============

/**
 * Render props for Upload.CameraPicker component.
 */
export interface UploadCameraPickerRenderProps {
  /** Take a photo */
  take: () => Promise<void>;
  /** Whether a capture is in progress */
  isLoading: boolean;
}

/**
 * Props for Upload.CameraPicker component.
 */
export interface UploadCameraPickerProps {
  /** Render function receiving picker state */
  children: (props: UploadCameraPickerRenderProps) => ReactNode;
}

/**
 * Camera picker component for photo capture.
 *
 * @example
 * ```tsx
 * <Upload.CameraPicker>
 *   {({ take }) => (
 *     <Pressable onPress={take}>
 *       <Text>Take Photo</Text>
 *     </Pressable>
 *   )}
 * </Upload.CameraPicker>
 * ```
 */
function UploadCameraPicker({ children }: UploadCameraPickerProps) {
  const upload = useUploadContext();

  const take = useCallback(async () => {
    await upload.takePhoto();
  }, [upload]);

  const renderProps: UploadCameraPickerRenderProps = {
    take,
    isLoading: upload.state.activeCount > 0,
  };

  return <>{children(renderProps)}</>;
}

// ============ ITEMS PRIMITIVE ============

/**
 * Render props for Upload.Items component.
 */
export interface UploadItemsRenderProps {
  /** All upload items */
  items: UploadItemState[];
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
 *     isEmpty ? <Text>No files</Text> : (
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
    items: upload.state.items,
    hasItems: upload.state.items.length > 0,
    isEmpty: upload.state.items.length === 0,
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
 *
 * @example
 * ```tsx
 * <Upload.Item id={item.id}>
 *   {({ file, state, abort, remove }) => (
 *     <View>
 *       <Text>{file.data.name}</Text>
 *       <Text>{state.progress}%</Text>
 *       <Pressable onPress={abort}><Text>Cancel</Text></Pressable>
 *       <Pressable onPress={remove}><Text>Remove</Text></Pressable>
 *     </View>
 *   )}
 * </Upload.Item>
 * ```
 */
function UploadItem({ id, children }: UploadItemProps) {
  const upload = useUploadContext();

  const item = upload.state.items.find((i) => i.id === id);

  if (!item) {
    // Item not found
    return null;
  }

  const contextValue: UploadItemContextValue = {
    id,
    file: item.file,
    state: {
      status: item.status,
      progress: item.progress,
      bytesUploaded: item.bytesUploaded,
      totalBytes: item.totalBytes,
      error: item.error,
      result: item.result,
    },
    abort: () => upload.abortItem(id),
    retry: () => upload.retryItem(id),
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
 *     isUploading && <Text>{progress}%</Text>
 *   )}
 * </Upload.Progress>
 * ```
 */
function UploadProgress({ children }: UploadProgressProps) {
  const upload = useUploadContext();

  const renderProps: UploadProgressRenderProps = {
    progress: upload.state.totalProgress,
    bytesUploaded: upload.state.totalUploaded,
    totalBytes: upload.state.totalBytes,
    isUploading: upload.state.activeCount > 0,
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
  /** Number of total items */
  total: number;
  /** Number of successful uploads */
  successful: number;
  /** Number of failed uploads */
  failed: number;
  /** Number of currently uploading */
  active: number;
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
 *   {({ status, successful, failed, total }) => (
 *     <Text>
 *       {status}: {successful}/{total} uploaded, {failed} failed
 *     </Text>
 *   )}
 * </Upload.Status>
 * ```
 */
function UploadStatus({ children }: UploadStatusProps) {
  const upload = useUploadContext();
  const { state } = upload;

  // Derive overall status
  let status: "idle" | "uploading" | "success" | "error" = "idle";
  if (state.activeCount > 0) {
    status = "uploading";
  } else if (state.items.length > 0) {
    const allComplete = state.items.every(
      (item) =>
        item.status === "success" ||
        item.status === "error" ||
        item.status === "aborted",
    );
    if (allComplete) {
      status = state.failedCount > 0 ? "error" : "success";
    }
  }

  const renderProps: UploadStatusRenderProps = {
    status,
    isIdle: status === "idle",
    isUploading: state.activeCount > 0,
    isSuccess:
      state.completedCount > 0 &&
      state.failedCount === 0 &&
      state.activeCount === 0,
    isError: state.failedCount > 0,
    total: state.items.length,
    successful: state.completedCount,
    failed: state.failedCount,
    active: state.activeCount,
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
  failedItems: UploadItemState[];
  /** Clear all items */
  clear: () => void;
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
 *   {({ hasError, failedItems, clear }) => (
 *     hasError && (
 *       <View>
 *         {failedItems.map(item => (
 *           <Text key={item.id}>{item.file.data.name}: {item.error?.message}</Text>
 *         ))}
 *         <Pressable onPress={clear}><Text>Clear</Text></Pressable>
 *       </View>
 *     )
 *   )}
 * </Upload.Error>
 * ```
 */
function UploadError({ children }: UploadErrorProps) {
  const upload = useUploadContext();

  const failedItems = upload.state.items.filter(
    (item) => item.status === "error" || item.status === "aborted",
  );

  const renderProps: UploadErrorRenderProps = {
    hasError: failedItems.length > 0,
    failedCount: failedItems.length,
    failedItems,
    clear: upload.clear,
  };

  return <>{children(renderProps)}</>;
}

// ============ ACTION PRIMITIVES ============

/**
 * Render props for Upload.Cancel component.
 */
export interface UploadCancelRenderProps {
  /** Cancel all uploads */
  cancel: () => void;
  /** Whether cancel is disabled */
  disabled: boolean;
}

/**
 * Props for Upload.Cancel component.
 */
export interface UploadCancelProps {
  /** Render function receiving cancel state */
  children: (props: UploadCancelRenderProps) => ReactNode;
}

/**
 * Cancel component that aborts all active uploads.
 */
function UploadCancel({ children }: UploadCancelProps) {
  const upload = useUploadContext();

  const cancel = useCallback(() => {
    for (const item of upload.state.items.filter(
      (item) => item.status === "uploading",
    )) {
      upload.abortItem(item.id);
    }
  }, [upload]);

  const renderProps: UploadCancelRenderProps = {
    cancel,
    disabled: upload.state.activeCount === 0,
  };

  return <>{children(renderProps)}</>;
}

/**
 * Render props for Upload.Retry component.
 */
export interface UploadRetryRenderProps {
  /** Retry all failed uploads */
  retry: () => Promise<void>;
  /** Whether retry is disabled */
  disabled: boolean;
}

/**
 * Props for Upload.Retry component.
 */
export interface UploadRetryProps {
  /** Render function receiving retry state */
  children: (props: UploadRetryRenderProps) => ReactNode;
}

/**
 * Retry component that retries all failed uploads.
 */
function UploadRetry({ children }: UploadRetryProps) {
  const upload = useUploadContext();

  const retry = useCallback(async () => {
    const failedItems = upload.state.items.filter(
      (item) => item.status === "error" || item.status === "aborted",
    );
    for (const item of failedItems) {
      await upload.retryItem(item.id);
    }
  }, [upload]);

  const renderProps: UploadRetryRenderProps = {
    retry,
    disabled: upload.state.failedCount === 0,
  };

  return <>{children(renderProps)}</>;
}

/**
 * Render props for Upload.Reset component.
 */
export interface UploadResetRenderProps {
  /** Reset all state */
  reset: () => void;
}

/**
 * Props for Upload.Reset component.
 */
export interface UploadResetProps {
  /** Render function receiving reset state */
  children: (props: UploadResetRenderProps) => ReactNode;
}

/**
 * Reset component that clears all items and state.
 */
function UploadReset({ children }: UploadResetProps) {
  const upload = useUploadContext();

  const renderProps: UploadResetRenderProps = {
    reset: upload.clear,
  };

  return <>{children(renderProps)}</>;
}

/**
 * Render props for Upload.StartAll component.
 */
export interface UploadStartAllRenderProps {
  /** Start all pending uploads */
  start: () => Promise<void>;
  /** Whether start is disabled */
  disabled: boolean;
}

/**
 * Props for Upload.StartAll component.
 */
export interface UploadStartAllProps {
  /** Render function receiving start state */
  children: (props: UploadStartAllRenderProps) => ReactNode;
}

/**
 * Start all component that begins all queued uploads.
 */
function UploadStartAll({ children }: UploadStartAllProps) {
  const upload = useUploadContext();

  const idleCount = upload.state.items.filter(
    (item) => item.status === "idle",
  ).length;

  const start = useCallback(async () => {
    await upload.startAll();
  }, [upload]);

  const renderProps: UploadStartAllRenderProps = {
    start,
    disabled: upload.state.activeCount > 0 || idleCount === 0,
  };

  return <>{children(renderProps)}</>;
}

// ============ COMPOUND COMPONENT EXPORT ============

/**
 * Upload compound component for React Native.
 *
 * Provides a composable, headless API for building upload interfaces on mobile.
 * Uses picker components instead of drag-and-drop (which isn't available on mobile).
 * All sub-components use render props for complete UI control.
 *
 * @example Single file upload
 * ```tsx
 * <Upload onSuccess={handleSuccess}>
 *   <Upload.FilePicker>
 *     {({ pick }) => (
 *       <Pressable onPress={pick}>
 *         <Text>Select File</Text>
 *       </Pressable>
 *     )}
 *   </Upload.FilePicker>
 *   <Upload.Progress>
 *     {({ progress }) => <Text>{progress}%</Text>}
 *   </Upload.Progress>
 * </Upload>
 * ```
 *
 * @example Multi-file upload
 * ```tsx
 * <Upload multiple maxConcurrent={3} onComplete={handleComplete}>
 *   <Upload.GalleryPicker>
 *     {({ pick }) => (
 *       <Pressable onPress={pick}>
 *         <Text>Select Photos</Text>
 *       </Pressable>
 *     )}
 *   </Upload.GalleryPicker>
 *   <Upload.Items>
 *     {({ items }) => items.map(item => (
 *       <Upload.Item key={item.id} id={item.id}>
 *         {({ file, state }) => (
 *           <Text>{file.data.name}: {state.progress}%</Text>
 *         )}
 *       </Upload.Item>
 *     ))}
 *   </Upload.Items>
 *   <Upload.StartAll>
 *     {({ start, disabled }) => (
 *       <Pressable onPress={start} disabled={disabled}>
 *         <Text>Upload All</Text>
 *       </Pressable>
 *     )}
 *   </Upload.StartAll>
 * </Upload>
 * ```
 */
export const Upload = Object.assign(UploadRoot, {
  FilePicker: UploadFilePicker,
  GalleryPicker: UploadGalleryPicker,
  CameraPicker: UploadCameraPicker,
  Items: UploadItems,
  Item: UploadItem,
  Progress: UploadProgress,
  Status: UploadStatus,
  Error: UploadError,
  Cancel: UploadCancel,
  Retry: UploadRetry,
  Reset: UploadReset,
  StartAll: UploadStartAll,
});
