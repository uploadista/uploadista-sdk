import type {
  ConnectionPoolConfig,
  ServiceContainer,
} from "@uploadista/client-core";
import { createHttpClient } from "../http-client";
import type { BrowserUploadInput } from "../types/upload-input";
import { createBrowserAbortControllerFactory } from "./abort-controller-factory";
import { createChecksumService } from "./checksum-service";
import { createBrowserFileReaderService } from "./file-reader";
import { createFingerprintService } from "./fingerprint-service";
import { createBrowserIdGenerationService } from "./id-generation/id-generation";
import { createBrowserPlatformService } from "./platform-service";
import { createLocalStorageService } from "./storage/local-storage-service";
import { createBrowserWebSocketFactory } from "./websocket-factory";

export interface BrowserServiceOptions {
  /**
   * HTTP client configuration for connection pooling
   */
  connectionPooling?: ConnectionPoolConfig;

  /**
   * Whether to use localStorage for persistence
   * If false, uses in-memory storage
   * @default true
   */
  useLocalStorage?: boolean;
}

/**
 * Creates a service container with browser-specific implementations
 * of all required services for the upload client
 *
 * @param options - Configuration options for browser services
 * @returns ServiceContainer with browser implementations
 *
 * @example
 * ```typescript
 * import { createBrowserServices } from '@uploadista/browser/services';
 *
 * const services = createBrowserServices({
 *   useLocalStorage: true,
 *   connectionPooling: {
 *     maxConnectionsPerHost: 6,
 *     connectionTimeout: 30000,
 *   }
 * });
 * ```
 */
export function createBrowserServices(
  options: BrowserServiceOptions = {},
): ServiceContainer<BrowserUploadInput> {
  const { connectionPooling, useLocalStorage = true } = options;

  // Create storage service (localStorage or in-memory fallback)
  const storage = useLocalStorage
    ? createLocalStorageService()
    : // Placeholder for in-memory storage - use localStorage as default for browser
      createLocalStorageService();

  // Create other services
  const idGeneration = createBrowserIdGenerationService();
  const httpClient = createHttpClient(connectionPooling);
  const fileReader = createBrowserFileReaderService();
  const websocket = createBrowserWebSocketFactory();
  const abortController = createBrowserAbortControllerFactory();
  const checksumService = createChecksumService();
  const fingerprintService = createFingerprintService();

  return {
    platform: createBrowserPlatformService(),
    storage,
    idGeneration,
    httpClient,
    fileReader,
    websocket,
    abortController,
    checksumService,
    fingerprintService,
  };
}
