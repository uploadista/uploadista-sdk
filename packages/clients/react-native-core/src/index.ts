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
  GalleryUploadButton,
  type GalleryUploadButtonProps,
  UploadList,
  type UploadListProps,
  UploadProgress,
  type UploadProgressProps,
  // Flow compound components
  Flow,
  useFlowContext,
  useFlowInputContext,
  type FlowProps,
  type FlowRenderProps,
  type FlowContextValue,
  type FlowInputContextValue,
  type FlowInputsProps,
  type FlowInputsRenderProps,
  type FlowInputProps,
  type FlowInputFilePickerProps,
  type FlowInputFilePickerRenderProps,
  type FlowInputPreviewProps,
  type FlowInputPreviewRenderProps,
  type FlowProgressProps,
  type FlowProgressRenderProps,
  type FlowStatusProps,
  type FlowStatusRenderProps,
  type FlowErrorProps,
  type FlowErrorRenderProps,
  type FlowSubmitProps,
  type FlowSubmitRenderProps,
  type FlowCancelProps,
  type FlowCancelRenderProps,
  type FlowResetProps,
  type FlowResetRenderProps,
  type FlowQuickUploadProps,
  type FlowQuickUploadRenderProps,
  // Upload compound components
  Upload,
  useUploadContext,
  useUploadItemContext,
  type UploadProps,
  type UploadRenderProps,
  type UploadContextValue,
  type UploadItemContextValue,
  type UploadFilePickerProps,
  type UploadFilePickerRenderProps,
  type UploadGalleryPickerProps,
  type UploadGalleryPickerRenderProps,
  type UploadCameraPickerProps,
  type UploadCameraPickerRenderProps,
  type UploadItemsProps,
  type UploadItemsRenderProps,
  type UploadItemProps,
  type UploadCompoundProgressProps,
  type UploadCompoundProgressRenderProps,
  type UploadStatusProps,
  type UploadStatusRenderProps,
  type UploadErrorProps,
  type UploadErrorRenderProps,
  type UploadCancelProps,
  type UploadCancelRenderProps,
  type UploadRetryProps,
  type UploadRetryRenderProps,
  type UploadResetProps,
  type UploadResetRenderProps,
  type UploadStartAllProps,
  type UploadStartAllRenderProps,
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
