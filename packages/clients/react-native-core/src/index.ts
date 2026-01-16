/**
 * @uploadista/react-native - React Native client for Uploadista
 * Provides mobile-optimized hooks and components for file uploads and flow management
 *
 * Usage:
 * ```ts
 * import { createUploadistaClient } from '@uploadista/react-native'
 *
 * const client = createUploadistaClient({
 *   baseUrl: 'https://api.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 1024 * 1024, // 1MB
 * })
 * ```
 */

// Re-export core types from upload-client-core
export type {
  Base64Service,
  ConnectionMetrics,
  ConnectionPoolConfig,
  DetailedConnectionMetrics,
  FileReaderService,
  HttpClient,
  IdGenerationService,
  ServiceContainer,
  StorageService,
} from "@uploadista/client-core";

// Export components
export {
  CameraUploadButton,
  type CameraUploadButtonProps,
  FileUploadButton,
  type FileUploadButtonProps,
  // Flow compound components
  Flow,
  type FlowCancelProps,
  type FlowCancelRenderProps,
  type FlowContextValue,
  type FlowErrorProps,
  type FlowErrorRenderProps,
  type FlowInputContextValue,
  type FlowInputFilePickerProps,
  type FlowInputFilePickerRenderProps,
  type FlowInputPreviewProps,
  type FlowInputPreviewRenderProps,
  type FlowInputProps,
  type FlowInputsProps,
  type FlowInputsRenderProps,
  type FlowProgressProps,
  type FlowProgressRenderProps,
  type FlowProps,
  type FlowQuickUploadProps,
  type FlowQuickUploadRenderProps,
  type FlowRenderProps,
  type FlowResetProps,
  type FlowResetRenderProps,
  type FlowStatusProps,
  type FlowStatusRenderProps,
  type FlowSubmitProps,
  type FlowSubmitRenderProps,
  GalleryUploadButton,
  type GalleryUploadButtonProps,
  // Upload compound components
  Upload,
  type UploadCameraPickerProps,
  type UploadCameraPickerRenderProps,
  type UploadCancelProps,
  type UploadCancelRenderProps,
  type UploadCompoundProgressProps,
  type UploadCompoundProgressRenderProps,
  type UploadContextValue,
  type UploadErrorProps,
  type UploadErrorRenderProps,
  type UploadFilePickerProps,
  type UploadFilePickerRenderProps,
  type UploadGalleryPickerProps,
  type UploadGalleryPickerRenderProps,
  type UploadItemContextValue,
  type UploadItemProps,
  type UploadItemsProps,
  type UploadItemsRenderProps,
  UploadList,
  type UploadListProps,
  UploadProgress,
  type UploadProgressProps,
  type UploadProps,
  type UploadRenderProps,
  type UploadResetProps,
  type UploadResetRenderProps,
  type UploadRetryProps,
  type UploadRetryRenderProps,
  type UploadStartAllProps,
  type UploadStartAllRenderProps,
  type UploadStatusProps,
  type UploadStatusRenderProps,
  useFlowContext,
  useFlowInputContext,
  useUploadContext,
  useUploadItemContext,
} from "./components";
// Export contexts
export {
  FlowManagerProvider,
  useFlowManagerContext,
} from "./contexts/flow-manager-context";
// Export hooks
// useFlow is the primary hook for flow operations (replaces useFlowUpload)
export {
  UploadistaContext,
  type UploadistaContextType,
  useCameraUpload,
  useFileUpload,
  useFlow,
  useGalleryUpload,
  useMultiUpload,
  useUploadistaContext,
  useUploadMetrics,
} from "./hooks";
export type {
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  UseFlowOptions,
  UseFlowReturn,
} from "./hooks/use-flow";
export type {
  MultiUploadState,
  UploadItemState,
} from "./hooks/use-multi-upload";
// Export hook types
export type { UploadState, UploadStatus } from "./hooks/use-upload";

// Export types
export type {
  CameraOptions,
  FileInfo,
  FilePickResult,
  FileSystemProvider,
  FileSystemProviderConfig,
  PickerOptions,
  ReactNativeUploadInput,
  UploadMetrics,
  UseCameraUploadOptions,
  UseFileUploadOptions,
  UseGalleryUploadOptions,
  UseMultiUploadOptions,
} from "./types";
// Export utilities
export {
  formatFileSize,
  getDirectoryFromUri,
  getFileExtension,
  getFileNameFromUri,
  getFileNameWithoutExtension,
  getMimeTypeFromFileName,
  getMimeTypeFromUri,
  getPermissionStatus,
  hasPermissions,
  isContentUri,
  isDocumentFile,
  isFileSizeValid,
  isFileTypeAllowed,
  isFileUri,
  isImageFile,
  isVideoFile,
  normalizeUri,
  openAppSettings,
  PermissionStatus,
  PermissionType,
  pathToUri,
  requestCameraPermission,
  requestPermissions,
  requestPhotoLibraryPermission,
  requestStorageReadPermission,
  requestStorageWritePermission,
  uriToPath,
} from "./utils";
