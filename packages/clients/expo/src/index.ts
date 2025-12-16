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
export type {
  CameraOptions,
  FileInfo,
  FilePickResult,
  FileSystemProvider,
  PickerOptions,
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
export {
  type UseUploadistaClientOptions,
  type UseUploadistaClientReturn,
  useUploadistaClient,
} from "./hooks/use-uploadista-client";
// Export event hooks and utilities
export { isFlowEvent, isUploadEvent } from "./hooks/event-utils";
export { useUploadistaEvents } from "./hooks/use-uploadista-events";
export { useFlowEvents, type UseFlowEventsOptions } from "./hooks/use-flow-events";
export {
  useUploadEvents,
  type UseUploadEventsOptions,
  type UploadProgressEventData,
  type UploadFileEventData,
  type UploadFailedEventData,
  type UploadValidationSuccessEventData,
  type UploadValidationFailedEventData,
  type UploadValidationWarningEventData,
} from "./hooks/use-upload-events";
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

// Re-export Flow compound components from react-native-core
export {
  // Flow compound component
  Flow,
  useFlowContext,
  useFlowInputContext,
  // FlowManagerProvider
  FlowManagerProvider,
  useFlowManagerContext,
  // useFlow hook
  useFlow,
  // Upload compound component
  Upload,
  useUploadContext,
  useUploadItemContext,
} from "@uploadista/react-native-core";

// Re-export Flow component types
export type {
  FlowProps,
  FlowRenderProps,
  FlowContextValue,
  FlowInputContextValue,
  FlowInputsProps,
  FlowInputsRenderProps,
  FlowInputProps,
  FlowInputFilePickerProps,
  FlowInputFilePickerRenderProps,
  FlowInputPreviewProps,
  FlowInputPreviewRenderProps,
  FlowProgressProps,
  FlowProgressRenderProps,
  FlowStatusProps,
  FlowStatusRenderProps,
  FlowErrorProps,
  FlowErrorRenderProps,
  FlowSubmitProps,
  FlowSubmitRenderProps,
  FlowCancelProps,
  FlowCancelRenderProps,
  FlowResetProps,
  FlowResetRenderProps,
  FlowQuickUploadProps,
  FlowQuickUploadRenderProps,
  // useFlow types
  FlowInputMetadata,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
  UseFlowOptions,
  UseFlowReturn,
  // Upload component types
  UploadProps,
  UploadRenderProps,
  UploadContextValue,
  UploadItemContextValue,
  UploadFilePickerProps,
  UploadFilePickerRenderProps,
  UploadGalleryPickerProps,
  UploadGalleryPickerRenderProps,
  UploadCameraPickerProps,
  UploadCameraPickerRenderProps,
  UploadItemsProps,
  UploadItemsRenderProps,
  UploadItemProps,
  UploadCompoundProgressProps,
  UploadCompoundProgressRenderProps,
  UploadStatusProps,
  UploadStatusRenderProps,
  UploadErrorProps,
  UploadErrorRenderProps,
  UploadCancelProps,
  UploadCancelRenderProps,
  UploadRetryProps,
  UploadRetryRenderProps,
  UploadResetProps,
  UploadResetRenderProps,
  UploadStartAllProps,
  UploadStartAllRenderProps,
} from "@uploadista/react-native-core";
