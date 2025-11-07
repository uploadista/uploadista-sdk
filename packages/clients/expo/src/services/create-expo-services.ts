import {
  type ConnectionPoolConfig,
  createInMemoryStorageService,
  type ServiceContainer,
} from "@uploadista/client-core";
import type { ReactNativeUploadInput } from "@uploadista/react-native-core";
import { createExpoAbortControllerFactory } from "./abort-controller-factory";
import { createExpoBase64Service } from "./base64-service";
import { createExpoChecksumService } from "./checksum-service";
import { createExpoFileReaderService } from "./file-reader-service";
import { createExpoFingerprintService } from "./fingerprint-service";
import { createExpoHttpClient } from "./http-client";
import { createExpoIdGenerationService } from "./id-generation-service";
import { createExpoPlatformService } from "./platform-service";
import { createAsyncStorageService } from "./storage-service";
import { createExpoWebSocketFactory } from "./websocket-factory";

export interface ExpoServiceOptions {
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
 * Creates a service container with Expo-specific implementations
 * of all required services for the upload client
 *
 * @param options - Configuration options for Expo services
 * @returns ServiceContainer with Expo implementations
 *
 * @example
 * ```typescript
 * import { createExpoServices } from '@uploadista/expo/services';
 *
 * const services = createExpoServices({
 *   useAsyncStorage: true,
 *   connectionPooling: {
 *     maxConnectionsPerHost: 6,
 *     connectionTimeout: 30000,
 *   }
 * });
 * ```
 */
export function createExpoServices(
  options: ExpoServiceOptions = {},
): ServiceContainer<ReactNativeUploadInput> {
  const { connectionPooling, useAsyncStorage = true } = options;

  // Create storage service (AsyncStorage or in-memory fallback)
  const storage = useAsyncStorage
    ? createAsyncStorageService()
    : createInMemoryStorageService();

  // Create other services
  const idGeneration = createExpoIdGenerationService();
  const httpClient = createExpoHttpClient(connectionPooling);
  const fileReader = createExpoFileReaderService();
  const base64 = createExpoBase64Service();
  const websocket = createExpoWebSocketFactory();
  const abortController = createExpoAbortControllerFactory();
  const platform = createExpoPlatformService();
  const checksumService = createExpoChecksumService();
  const fingerprintService = createExpoFingerprintService();

  return {
    storage,
    idGeneration,
    httpClient,
    fileReader,
    base64,
    websocket,
    abortController,
    platform,
    checksumService,
    fingerprintService,
  };
}
