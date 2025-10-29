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
