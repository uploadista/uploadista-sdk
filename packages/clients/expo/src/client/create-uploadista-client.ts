import {
  type ConnectionPoolConfig,
  createClientStorage,
  createLogger,
  createUploadistaClient as createUploadistaClientCore,
  type UploadistaClientOptions as UploadistaClientOptionsCore,
} from "@uploadista/client-core";
import { createExpoServices } from "../services/create-expo-services";
import type { ExpoUploadInput } from "../types/upload-input";

export interface UploadistaClientOptions
  extends Omit<
    UploadistaClientOptionsCore<ExpoUploadInput>,
    | "webSocketFactory"
    | "abortControllerFactory"
    | "generateId"
    | "clientStorage"
    | "logger"
    | "httpClient"
    | "fileReader"
    | "base64"
    | "checksumService"
    | "fingerprintService"
    | "platformService"
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
 * Creates an upload client instance with Expo-specific service implementations
 *
 * @param options - Client configuration options
 * @returns Configured UploadistaClient instance
 *
 * @example
 * ```typescript
 * import { createUploadistaClient } from '@uploadista/expo'
 *
 * const client = createUploadistaClient({
 *   baseUrl: 'https://api.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 1024 * 1024, // 1MB
 *   useAsyncStorage: true,
 * });
 * ```
 */
export function createUploadistaClient(options: UploadistaClientOptions) {
  const services = createExpoServices({
    connectionPooling: options.connectionPooling,
    useAsyncStorage: options.useAsyncStorage,
  });

  return createUploadistaClientCore<ExpoUploadInput>({
    ...options,
    webSocketFactory: services.websocket,
    abortControllerFactory: services.abortController,
    httpClient: services.httpClient,
    fileReader: services.fileReader,
    generateId: services.idGeneration,
    logger: createLogger(false, () => {}),
    clientStorage: createClientStorage(services.storage),
    checksumService: services.checksumService,
    fingerprintService: services.fingerprintService,
    platformService: services.platform,
  });
}
