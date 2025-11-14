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
} from "./components";
// Export contexts
export {
  FlowManagerProvider,
  useFlowManagerContext,
} from "./contexts/flow-manager-context";
// Export hooks
export {
  UploadistaContext,
  type UploadistaContextType,
  useCameraUpload,
  useFileUpload,
  useFlowUpload,
  useGalleryUpload,
  useMultiUpload,
  useUploadistaContext,
  useUploadMetrics,
} from "./hooks";
export type {
  FlowUploadState,
  FlowUploadStatus,
} from "./hooks/use-flow-upload";
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
  UseFlowUploadOptions,
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
