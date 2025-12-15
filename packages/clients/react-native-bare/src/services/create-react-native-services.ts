import {
  type ConnectionPoolConfig,
  createInMemoryStorageService,
  type ServiceContainer,
} from "@uploadista/client-core";
import type { ReactNativeUploadInput } from "@uploadista/react-native-core";
import { createReactNativeAbortControllerFactory } from "./abort-controller-factory";
import { createReactNativeBase64Service } from "./base64-service";
import { createReactNativeChecksumService } from "./checksum-service";
import { createReactNativeFileReaderService } from "./file-reader-service";
import { createReactNativeFingerprintService } from "./fingerprint-service";
import { createReactNativeHttpClient } from "./http-client";
import { createReactNativeIdGenerationService } from "./id-generation-service";
import { createReactNativePlatformService } from "./platform-service";
import { createAsyncStorageService } from "./storage-service";
import { createReactNativeWebSocketFactory } from "./websocket-factory";

export interface ReactNativeServiceOptions {
  /**
   * HTTP client configuration for connection pooling
   */
  connectionPooling?: ConnectionPoolConfig;

  /**
   * Whether to use AsyncStorage for persistence
   * If false, uses in-memory storage
   * @default true
   */
  useAsyncStorage?: boolean;
}

/**
 * Creates a service container with React Native-specific implementations
 * of all required services for the upload client
 *
 * @param options - Configuration options for React Native services
 * @returns ServiceContainer with React Native implementations
 *
 * @example
 * ```typescript
 * import { createReactNativeServices } from '@uploadista/react-native/services';
 *
 * const services = createReactNativeServices({
 *   useAsyncStorage: true,
 *   connectionPooling: {
 *     maxConnectionsPerHost: 6,
 *     connectionTimeout: 30000,
 *   }
 * });
 * ```
 */
export function createReactNativeServices(
  options: ReactNativeServiceOptions = {},
): ServiceContainer<ReactNativeUploadInput> {
  const { connectionPooling, useAsyncStorage = true } = options;

  // Create storage service (AsyncStorage or in-memory fallback)
  const storage = useAsyncStorage
    ? createAsyncStorageService()
    : createInMemoryStorageService();

  // Create other services
  const idGeneration = createReactNativeIdGenerationService();
  const httpClient = createReactNativeHttpClient(connectionPooling);
  const fileReader = createReactNativeFileReaderService();
  const base64 = createReactNativeBase64Service();
  const websocket = createReactNativeWebSocketFactory();
  const abortController = createReactNativeAbortControllerFactory();
  const platform = createReactNativePlatformService();
  const checksumService = createReactNativeChecksumService();
  const fingerprintService = createReactNativeFingerprintService();

  return {
    storage,
    idGeneration,
    httpClient,
    fileReader,
    base64,
    platform,
    checksumService,
    fingerprintService,
    websocket,
    abortController,
  };
}
