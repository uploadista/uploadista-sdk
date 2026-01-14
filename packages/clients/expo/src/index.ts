/**
 * Expo client for Uploadista
 *
 * This package provides Expo-specific implementations of the Uploadista client services,
 * allowing file uploads through Expo's managed APIs.
 *
 * Usage:
 * ```ts
 * import { createUploadistaClient } from '@uploadista/expo'
 *
 * const client = createUploadistaClient({
 *   baseUrl: 'https://api.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 1024 * 1024, // 1MB
 * })
 * ```
 *
 * Advanced usage with custom services:
 * ```ts
 * import { createExpoServices } from '@uploadista/expo/services'
 * import { createUploadistaClientCore } from '@uploadista/client-core'
 *
 * const services = createExpoServices()
 * const client = createUploadistaClientCore({
 *   endpoint: 'https://api.example.com',
 *   services
 * })
 * ```
 *
 * Legacy usage with FileSystemProvider (backward compatible):
 * ```ts
 * import { ExpoFileSystemProvider } from '@uploadista/expo'
 *
 * const provider = new ExpoFileSystemProvider()
 * const file = await provider.pickImage()
 * ```
 */

// Re-export core types from upload-client-core
export type {
  Base64Service,
  ConnectionPoolConfig,
  FileReaderService,
  FileSource,
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
  IdGenerationService,
  ServiceContainer,
  SliceResult,
  StorageService,
} from "@uploadista/client-core";
// Export Expo-specific types
// Re-export Flow component types
export type {
  CameraOptions,
  FileInfo,
  FilePickResult,
  FileSystemProvider,
  FlowCancelProps,
  FlowCancelRenderProps,
  FlowContextValue,
  FlowErrorProps,
  FlowErrorRenderProps,
  FlowInputContextValue,
  FlowInputFilePickerProps,
  FlowInputFilePickerRenderProps,
  // useFlow types
  FlowInputMetadata,
  FlowInputPreviewProps,
  FlowInputPreviewRenderProps,
  FlowInputProps,
  FlowInputsProps,
  FlowInputsRenderProps,
  FlowProgressProps,
  FlowProgressRenderProps,
  FlowProps,
  FlowQuickUploadProps,
  FlowQuickUploadRenderProps,
  FlowRenderProps,
  FlowResetProps,
  FlowResetRenderProps,
  FlowStatusProps,
  FlowStatusRenderProps,
  FlowSubmitProps,
  FlowSubmitRenderProps,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  PickerOptions,
  UploadCameraPickerProps,
  UploadCameraPickerRenderProps,
  UploadCancelProps,
  UploadCancelRenderProps,
  UploadCompoundProgressProps,
  UploadCompoundProgressRenderProps,
  UploadContextValue,
  UploadErrorProps,
  UploadErrorRenderProps,
  UploadFilePickerProps,
  UploadFilePickerRenderProps,
  UploadGalleryPickerProps,
  UploadGalleryPickerRenderProps,
  UploadItemContextValue,
  UploadItemProps,
  UploadItemsProps,
  UploadItemsRenderProps,
  // Upload component types
  UploadProps,
  UploadRenderProps,
  UploadResetProps,
  UploadResetRenderProps,
  UploadRetryProps,
  UploadRetryRenderProps,
  UploadStartAllProps,
  UploadStartAllRenderProps,
  UploadStatusProps,
  UploadStatusRenderProps,
  UseFlowOptions,
  UseFlowReturn,
} from "@uploadista/react-native-core";
// Re-export Flow compound components from react-native-core
export {
  // Flow compound component
  Flow,
  // FlowManagerProvider
  FlowManagerProvider,
  // Upload compound component
  Upload,
  // useFlow hook
  useFlow,
  useFlowContext,
  useFlowInputContext,
  useFlowManagerContext,
  useUploadContext,
  useUploadItemContext,
} from "@uploadista/react-native-core";
// Export client factory
export {
  createUploadistaClient,
  type UploadistaClientOptions,
} from "./client";
// Export provider and hooks
export {
  UploadistaProvider,
  type UploadistaProviderProps,
  useUploadistaContext,
} from "./components/uploadista-provider";
// Export event hooks and utilities
export { isFlowEvent, isUploadEvent } from "./hooks/event-utils";
export {
  type UseFlowEventsOptions,
  useFlowEvents,
} from "./hooks/use-flow-events";
export {
  type UploadFailedEventData,
  type UploadFileEventData,
  type UploadProgressEventData,
  type UploadValidationFailedEventData,
  type UploadValidationSuccessEventData,
  type UploadValidationWarningEventData,
  type UseUploadEventsOptions,
  useUploadEvents,
} from "./hooks/use-upload-events";
export {
  type UseUploadistaClientOptions,
  type UseUploadistaClientReturn,
  useUploadistaClient,
} from "./hooks/use-uploadista-client";
export { useUploadistaEvents } from "./hooks/use-uploadista-events";
// Re-export service implementations and factories
export {
  createAsyncStorageService,
  createExpoBase64Service,
  createExpoFileReaderService,
  createExpoHttpClient,
  createExpoIdGenerationService,
  createExpoServices,
  type ExpoServiceOptions,
} from "./services";
export { ExpoFileSystemProvider } from "./services/expo-file-system-provider";
