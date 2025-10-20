import {
  type ConnectionPoolConfig,
  createClientStorage,
  createLogger,
  createUploadistaClient as createUploadistaClientCore,
  type ServiceContainer,
  type UploadistaClientOptions as UploadistaClientOptionsCore,
} from "@uploadista/client-core";
import type { ReactNativeUploadInput } from "../types/upload-input";

export interface UploadistaClientOptions
  extends Omit<
    UploadistaClientOptionsCore<ReactNativeUploadInput>,
    | "webSocketFactory"
    | "abortControllerFactory"
    | "generateId"
    | "clientStorage"
    | "logger"
    | "httpClient"
    | "fileReader"
    | "base64"
  > {
  connectionPooling?: ConnectionPoolConfig;

  /**
   * Whether to use AsyncStorage for persistence
   * If false, uses in-memory storage
   * @default true
   */
  useAsyncStorage?: boolean;
}

/**
 * Creates an upload client instance with React Native-specific service implementations
 *
 * @param options - Client configuration options
 * @returns Configured UploadistaClient instance
 *
 * @example
 * ```typescript
 * import { createUploadistaClient } from '@uploadista/react-native'
 *
 * const client = createUploadistaClient({
 *   baseUrl: 'https://api.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 1024 * 1024, // 1MB
 *   useAsyncStorage: true,
 * });
 * ```
 */
export function createUploadistaClient(
  options: UploadistaClientOptions,
  services: ServiceContainer<ReactNativeUploadInput>,
) {
  return createUploadistaClientCore<ReactNativeUploadInput>({
    ...options,
    webSocketFactory: services.websocket,
    abortControllerFactory: services.abortController,
    httpClient: services.httpClient,
    fileReader: services.fileReader,
    generateId: services.idGeneration,
    logger: createLogger(false, () => {}),
    clientStorage: createClientStorage(services.storage),
  });
}
