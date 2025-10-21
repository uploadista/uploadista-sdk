import {
  type ConnectionPoolConfig,
  createClientStorage,
  createLogger,
  createUploadistaClient as createUploadistaClientCore,
  type UploadistaClientOptions as UploadistaClientOptionsCore,
} from "@uploadista/client-core";
import { createBrowserServices } from "../services/create-browser-services";
import type { BrowserUploadInput } from "../types/upload-input";

/**
 * Configuration options for creating a browser-specific Uploadista client.
 *
 * This interface extends the core client options but omits browser-specific
 * services that are automatically provided by the browser environment.
 * These services include WebSocket factory, AbortController, ID generation,
 * storage, logging, platform detection, fingerprinting, HTTP client, file reader,
 * and checksum calculation.
 *
 * @example
 * ```typescript
 * import { createUploadistaClient } from '@uploadista/client-browser';
 *
 * const client = createUploadistaClient({
 *   endpoint: 'https://api.uploadista.com/upload',
 *   connectionPooling: {
 *     maxConnectionsPerHost: 6,
 *     enableHttp2: true
 *   }
 * });
 * ```
 */
export interface UploadistaClientOptions
  extends Omit<
    UploadistaClientOptionsCore<BrowserUploadInput>,
    | "webSocketFactory"
    | "abortControllerFactory"
    | "generateId"
    | "clientStorage"
    | "logger"
    | "platformService"
    | "fingerprintService"
    | "httpClient"
    | "fileReader"
    | "checksumService"
  > {
  /**
   * Connection pooling configuration for the HTTP client.
   *
   * Controls how the browser manages HTTP connections for optimal performance.
   * The browser's native fetch API with keep-alive headers is used under the hood.
   *
   * @default
   * ```typescript
   * {
   *   maxConnectionsPerHost: 6,
   *   connectionTimeout: 30000,
   *   keepAliveTimeout: 60000,
   *   enableHttp2: true,
   *   retryOnConnectionError: true
   * }
   * ```
   *
   * @example
   * ```typescript
   * connectionPooling: {
   *   maxConnectionsPerHost: 10,
   *   enableHttp2: true,
   *   keepAliveTimeout: 120000
   * }
   * ```
   */
  connectionPooling?: ConnectionPoolConfig;
}

/**
 * Creates a browser-optimized Uploadista client for file uploads and flow processing.
 *
 * This factory function automatically configures all browser-specific services including:
 * - Fetch-based HTTP client with connection pooling
 * - Native WebSocket support for real-time progress
 * - localStorage for upload state persistence
 * - Web Crypto API for checksums and fingerprints
 * - File API for reading and chunking files
 * - Browser platform detection and capabilities
 *
 * The created client can handle File and Blob objects from file inputs, drag-and-drop,
 * or programmatically created content. It supports resumable uploads, progress tracking,
 * and flow-based file processing.
 *
 * @param options - Configuration options for the browser client
 * @returns A fully configured Uploadista client ready for browser use
 *
 * @example
 * ```typescript
 * import { createUploadistaClient } from '@uploadista/client-browser';
 *
 * // Basic usage
 * const client = createUploadistaClient({
 *   endpoint: 'https://api.uploadista.com/upload'
 * });
 *
 * // With custom configuration
 * const client = createUploadistaClient({
 *   endpoint: 'https://api.uploadista.com/upload',
 *   connectionPooling: {
 *     maxConnectionsPerHost: 6,
 *     enableHttp2: true,
 *     keepAliveTimeout: 60000
 *   },
 *   chunkSize: 5 * 1024 * 1024, // 5MB chunks
 *   retryDelays: [1000, 3000, 5000],
 *   allowedMetaFields: ['userId', 'projectId']
 * });
 *
 * // Upload a file
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 *
 * const upload = await client.upload(file, {
 *   onProgress: (event) => {
 *     console.log(`Progress: ${event.progress}%`);
 *   }
 * });
 *
 * console.log('Upload complete:', upload.id);
 * ```
 *
 * @see {@link UploadistaClientOptions} for available configuration options
 * @see {@link BrowserUploadInput} for supported file input types
 */
export function createUploadistaClient(options: UploadistaClientOptions) {
  const services = createBrowserServices({
    connectionPooling: options.connectionPooling,
  });

  return createUploadistaClientCore<BrowserUploadInput>({
    ...options,
    webSocketFactory: services.websocket,
    abortControllerFactory: services.abortController,
    platformService: services.platform,
    httpClient: services.httpClient,
    fileReader: services.fileReader,
    generateId: services.idGeneration,
    fingerprintService: services.fingerprintService,
    checksumService: services.checksumService,
    logger: createLogger(false, () => {}),
    clientStorage: createClientStorage(services.storage),
  });
}
