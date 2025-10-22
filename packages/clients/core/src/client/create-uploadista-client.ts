import type { FlowJob } from "@uploadista/core/flow";
import type { DataStoreCapabilities } from "@uploadista/core/types";
import type { AuthConfig, AuthManager } from "../auth";
import {
  DirectAuthManager,
  NoAuthManager,
  UploadistaCloudAuthManager,
} from "../auth";
import type { Logger } from "../logger";
import { createLogger } from "../logger";
import { defaultClientCapabilities } from "../mock-data-store";
import { NetworkMonitor, type NetworkMonitorConfig } from "../network-monitor";
import type { AbortControllerFactory } from "../services/abort-controller-service";
import type { ChecksumService } from "../services/checksum-service";
import type { FileReaderService } from "../services/file-reader-service";
import type { FingerprintService } from "../services/fingerprint-service";
import type { ConnectionPoolConfig, HttpClient } from "../services/http-client";
import type { IdGenerationService } from "../services/id-generation-service";
import type { PlatformService, Timeout } from "../services/platform-service";
import type {
  WebSocketFactory,
  WebSocketLike,
} from "../services/websocket-service";
import { SmartChunker, type SmartChunkerConfig } from "../smart-chunker";
import type { ClientStorage } from "../storage/client-storage";
import type { FlowUploadConfig } from "../types/flow-upload-config";

import { performFlowUpload, startFlowUpload } from "../upload/flow-upload";
import { startParallelUpload } from "../upload/parallel-upload";
import {
  type Callbacks,
  performUpload,
  startSingleUpload,
} from "../upload/single-upload";
import { abort, terminate } from "../upload/upload-manager";
import {
  UploadMetrics,
  type UploadMetricsConfig,
} from "../upload/upload-metrics";
import {
  findPreviousUploads,
  resumeFromPreviousUpload,
} from "../upload/upload-storage";
import {
  negotiateUploadStrategy,
  type UploadStrategyConfig,
  validateAndThrow,
  validateConfiguration,
} from "../upload/upload-strategy";
import { calculateFileSize } from "../upload/upload-utils";
import { createUploadistaApi } from "./uploadista-api";
import {
  type UploadistaWebSocketEventHandler,
  UploadistaWebSocketManager,
} from "./uploadista-websocket-manager";

/**
 * Options for individual upload operations.
 *
 * Extends the base upload callbacks with configuration for deferred length,
 * size overrides, metadata, and checksum computation.
 */
export type UploadistaUploadOptions = {
  /**
   * Whether to defer specifying the upload size until later.
   * Useful for streaming uploads where size isn't known upfront.
   * Defaults to false.
   */
  uploadLengthDeferred?: boolean;

  /**
   * Manual override for upload size in bytes.
   * If not provided, size is determined from the file/blob.
   */
  uploadSize?: number;

  /**
   * Custom metadata to attach to the upload.
   * Stored as key-value pairs on the server.
   */
  metadata?: Record<string, string>;

  /**
   * Whether to compute checksums for uploaded chunks.
   * Enables integrity verification but adds computational overhead.
   * Defaults to false.
   */
  computeChecksum?: boolean;

  /**
   * Checksum algorithm to use (e.g., "sha256", "md5").
   * Only relevant if computeChecksum is true.
   */
  checksumAlgorithm?: string;
} & Callbacks;

/**
 * Configuration options for creating an Uploadista client.
 *
 * This comprehensive configuration object allows customization of all aspects
 * of upload behavior including chunking, retries, authentication, storage,
 * network monitoring, and platform-specific services.
 *
 * @template UploadInput - The platform-specific file/blob type (e.g., File, Blob, Buffer)
 */
export type UploadistaClientOptions<UploadInput> = {
  /** Base URL of the Uploadista server (e.g., "https://upload.example.com") */
  baseUrl: string;

  /** Base path for Uploadista endpoints. Defaults to "uploadista" */
  uploadistaBasePath?: string;

  /** Storage backend identifier configured on the server */
  storageId: string;

  /** Retry delay intervals in milliseconds. Defaults to [1000, 3000, 5000] */
  retryDelays?: number[];

  /** Default chunk size in bytes for uploads */
  chunkSize: number;

  /** Number of parallel upload streams. Defaults to 1 (sequential) */
  parallelUploads?: number;

  /** Chunk size for parallel uploads. Required if parallelUploads > 1 */
  parallelChunkSize?: number;

  /** Service for computing checksums of uploaded chunks */
  checksumService: ChecksumService;

  /** Strategy configuration for determining upload approach (single/parallel/chunked) */
  uploadStrategy?: UploadStrategyConfig;

  /** Smart chunking configuration for adaptive chunk sizes based on network conditions */
  smartChunking?: SmartChunkerConfig;

  /** Network monitoring configuration for tracking upload performance */
  networkMonitoring?: NetworkMonitorConfig;

  /** Upload metrics configuration for performance insights */
  uploadMetrics?: UploadMetricsConfig;

  /** HTTP client with connection pooling support */
  httpClient: HttpClient;

  /** Service for generating unique IDs */
  generateId: IdGenerationService;

  /** Client-side storage for upload resumption data */
  clientStorage: ClientStorage;

  /** Platform-specific file reading service */
  fileReader: FileReaderService<UploadInput>;

  /** Logger for debugging and monitoring */
  logger: Logger;

  /** Service for computing file fingerprints for resumption */
  fingerprintService: FingerprintService<UploadInput>;

  /** Whether to store fingerprints for upload resumption. Defaults to true */
  storeFingerprintForResuming: boolean;

  /** Factory for creating WebSocket connections */
  webSocketFactory: WebSocketFactory;

  /** Factory for creating abort controllers */
  abortControllerFactory: AbortControllerFactory;

  /** Platform-specific service for timers and async operations */
  platformService: PlatformService;

  /** Global error handler for all upload operations */
  onError?: (error: Error) => void;

  /** WebSocket event handler for real-time upload/flow events */
  onEvent?: UploadistaWebSocketEventHandler;

  /**
   * Optional authentication configuration.
   * Supports two modes:
   * - Direct: Bring your own auth (headers, cookies, custom tokens)
   * - UploadistaCloud: Standard JWT token exchange with auth server
   *
   * If omitted, client operates in no-auth mode (backward compatible).
   *
   * @example Direct mode with Bearer token
   * ```typescript
   * auth: {
   *   mode: 'direct',
   *   getCredentials: () => ({
   *     headers: { 'Authorization': 'Bearer token123' }
   *   })
   * }
   * ```
   *
   * @example UploadistaCloud mode with auth server
   * ```typescript
   * auth: {
   *   mode: 'uploadista-cloud',
   *   authServerUrl: 'https://auth.myapp.com/token',
   *   getCredentials: () => ({ username: 'user', password: 'pass' })
   * }
   * ```
   */
  auth?: AuthConfig;
};

/**
 * Default connection pooling configuration with health monitoring.
 *
 * Optimized for typical upload scenarios with support for HTTP/2 multiplexing,
 * connection reuse, and automatic retry on connection errors.
 */
export const defaultConnectionPoolingConfig: ConnectionPoolConfig = {
  /** Maximum concurrent connections per host */
  maxConnectionsPerHost: 8,
  /** Timeout for establishing new connections in milliseconds */
  connectionTimeout: 20000,
  /** Keep-alive timeout for idle connections in milliseconds */
  keepAliveTimeout: 90000,
  /** Enable HTTP/2 for connection multiplexing */
  enableHttp2: true,
  /** Automatically retry requests on connection errors */
  retryOnConnectionError: true,
};

/**
 * Creates a unified Uploadista client for file uploads and flow processing.
 *
 * This is the primary factory function for creating an Uploadista client instance.
 * It configures all upload capabilities including:
 * - Resumable chunked uploads with automatic retry
 * - Parallel upload streams for large files
 * - Smart chunking based on network conditions
 * - Flow-based file processing pipelines
 * - WebSocket support for real-time progress
 * - Authentication (direct, uploadista-cloud, or no-auth modes)
 *
 * The client automatically:
 * - Fetches server capabilities and adapts upload strategy
 * - Monitors network performance for optimal chunking
 * - Stores upload state for resumption across sessions
 * - Manages WebSocket connections for progress tracking
 *
 * @template UploadInput - Platform-specific file type (File, Blob, Buffer, etc.)
 * @param options - Comprehensive client configuration
 * @returns Uploadista client instance with upload and flow methods
 *
 * @example Basic browser setup
 * ```typescript
 * import { createUploadistaClient } from '@uploadista/client-core';
 * import { browserServices } from '@uploadista/client-browser';
 *
 * const client = createUploadistaClient({
 *   baseUrl: 'https://upload.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 5 * 1024 * 1024, // 5MB chunks
 *   ...browserServices,
 * });
 *
 * // Upload a file
 * const { abort } = await client.upload(file, {
 *   onProgress: (progress) => console.log(`${progress}% complete`),
 *   onSuccess: (result) => console.log('Upload complete:', result),
 * });
 * ```
 *
 * @example Upload with flow processing
 * ```typescript
 * const client = createUploadistaClient(config);
 *
 * // Upload and process through a flow
 * const { abort, jobId } = await client.uploadWithFlow(file, {
 *   flowId: 'image-optimization-flow',
 *   storageId: 'images',
 *   outputNodeId: 'optimized-output',
 * }, {
 *   onProgress: (progress) => console.log(`${progress}%`),
 *   onSuccess: (result) => console.log('Processed:', result),
 * });
 *
 * // Monitor job status
 * const status = await client.getJobStatus(jobId);
 * ```
 *
 * @example Parallel uploads for large files
 * ```typescript
 * const client = createUploadistaClient({
 *   baseUrl: 'https://upload.example.com',
 *   storageId: 'large-files',
 *   chunkSize: 10 * 1024 * 1024, // 10MB
 *   parallelUploads: 4, // 4 concurrent streams
 *   parallelChunkSize: 5 * 1024 * 1024, // 5MB per stream
 *   ...browserServices,
 * });
 *
 * await client.upload(largeFile);
 * ```
 *
 * @example With authentication
 * ```typescript
 * const client = createUploadistaClient({
 *   baseUrl: 'https://upload.example.com',
 *   storageId: 'protected',
 *   chunkSize: 5 * 1024 * 1024,
 *   auth: {
 *     mode: 'direct',
 *     getCredentials: async () => ({
 *       headers: {
 *         'Authorization': `Bearer ${await getToken()}`,
 *       },
 *     }),
 *   },
 *   ...browserServices,
 * });
 * ```
 *
 * @example Smart chunking with network monitoring
 * ```typescript
 * const client = createUploadistaClient({
 *   baseUrl: 'https://upload.example.com',
 *   storageId: 'adaptive',
 *   chunkSize: 1 * 1024 * 1024, // Fallback: 1MB
 *   smartChunking: {
 *     enabled: true,
 *     minChunkSize: 256 * 1024, // 256KB min
 *     maxChunkSize: 10 * 1024 * 1024, // 10MB max
 *   },
 *   networkMonitoring: {
 *     slowThreshold: 50 * 1024, // 50 KB/s
 *     fastThreshold: 5 * 1024 * 1024, // 5 MB/s
 *   },
 *   ...browserServices,
 * });
 *
 * // Monitor network conditions
 * const condition = client.getNetworkCondition();
 * console.log(`Network: ${condition.type} (confidence: ${condition.confidence})`);
 * ```
 *
 * @see {@link UploadistaClientOptions} for full configuration options
 * @see {@link UploadistaUploadOptions} for per-upload options
 */
export function createUploadistaClient<UploadInput>({
  baseUrl: _baseUrl,
  uploadistaBasePath = "uploadista",
  storageId,
  retryDelays = [1000, 3000, 5000],
  chunkSize,
  parallelUploads = 1,
  parallelChunkSize,
  uploadStrategy,
  smartChunking,
  networkMonitoring,
  uploadMetrics,
  checksumService,
  onEvent,
  generateId,
  httpClient,
  logger = createLogger(true),
  fileReader,
  fingerprintService,
  clientStorage,
  storeFingerprintForResuming = true,
  webSocketFactory,
  abortControllerFactory,
  platformService,
  auth,
}: UploadistaClientOptions<UploadInput>) {
  const baseUrl = _baseUrl.replace(/\/$/, "");

  // Create auth manager based on configuration
  const authManager: AuthManager = auth
    ? auth.mode === "direct"
      ? new DirectAuthManager(auth, platformService, logger)
      : new UploadistaCloudAuthManager(auth, httpClient)
    : new NoAuthManager();

  // Log auth mode for debugging (without exposing credentials)
  if (auth) {
    logger.log(
      `Authentication enabled in ${auth.mode} mode${auth.mode === "uploadista-cloud" ? ` (server: ${auth.authServerUrl})` : ""}`,
    );
  }

  // Create the unified API with auth support
  const uploadistaApi = createUploadistaApi(baseUrl, uploadistaBasePath, {
    logger,
    httpClient,
    authManager,
    webSocketFactory,
  });

  // Initialize smart chunking components
  const networkMonitor = new NetworkMonitor(networkMonitoring);
  const metrics = new UploadMetrics(uploadMetrics);

  // Cache for server capabilities
  let cachedCapabilities: DataStoreCapabilities | null = null;

  const getCapabilities = async (): Promise<DataStoreCapabilities> => {
    if (cachedCapabilities) {
      return cachedCapabilities;
    }
    cachedCapabilities = await uploadistaApi.getCapabilities(storageId);
    return cachedCapabilities;
  };

  // Initialize smart chunker with datastore constraints from server capabilities
  let smartChunker: SmartChunker;
  const initializeSmartChunker = async () => {
    if (smartChunker) return smartChunker;

    const capabilities = await getCapabilities();

    const datastoreConstraints =
      capabilities.minChunkSize &&
      capabilities.maxChunkSize &&
      capabilities.optimalChunkSize
        ? {
            minChunkSize: capabilities.minChunkSize,
            maxChunkSize: capabilities.maxChunkSize,
            optimalChunkSize: capabilities.optimalChunkSize,
            requiresOrderedChunks: capabilities.requiresOrderedChunks,
          }
        : undefined;

    smartChunker = new SmartChunker(networkMonitor, {
      enabled: true,
      ...smartChunking,
      fallbackChunkSize: chunkSize,
      datastoreConstraints,
    });

    logger.log(
      `Smart chunker initialized with datastore constraints: ${JSON.stringify(datastoreConstraints)}`,
    );

    return smartChunker;
  };

  // WebSocket management (uses uploadistaApi for both upload and flow websockets)
  const wsManager = new UploadistaWebSocketManager(
    uploadistaApi,
    logger,
    onEvent,
  );

  /**
   * Upload a file
   */
  const upload = async (
    file: UploadInput,
    {
      uploadLengthDeferred = false,
      uploadSize,
      onProgress,
      onChunkComplete,
      onSuccess,
      onShouldRetry,
      onError,
    }: UploadistaUploadOptions = {},
  ): Promise<{ abort: () => void }> => {
    let uploadId: string | null = null;
    let uploadIdStorageKey: string | null = null;

    const fingerprint = await fingerprintService.computeFingerprint(
      file,
      `${baseUrl}/${uploadistaBasePath}/api/upload`,
    );

    logger.log(`fingerprint: ${fingerprint}`);
    if (!fingerprint) {
      throw new Error("unable calculate fingerprint for this input file");
    }

    const previousUploads = await findPreviousUploads(
      clientStorage,
      fingerprint,
    );
    if (previousUploads.length > 0 && previousUploads[0] != null) {
      const previousUpload = resumeFromPreviousUpload(previousUploads[0]);
      uploadIdStorageKey = previousUpload.clientStorageKey;
      uploadId = previousUpload.uploadId;
    }

    const source = await fileReader.openFile(file, chunkSize);

    const size = calculateFileSize(source.size, {
      uploadLengthDeferred,
      uploadSize,
    });
    source.size = size;

    const initializedSmartChunker = await initializeSmartChunker();

    const isSmartChunkingEnabled = smartChunking?.enabled !== false;
    if (isSmartChunkingEnabled) {
      metrics.startSession(fingerprint, size || 0, true);
    }

    const capabilities = await getCapabilities();

    const negotiatedStrategy = negotiateUploadStrategy({
      capabilities,
      fileSize: size,
      chunkSize,
      parallelUploads,
      uploadLengthDeferred,
      strategyConfig: uploadStrategy,
      logger,
    });

    if (negotiatedStrategy.strategy === "parallel") {
      logger.log(
        `Using parallel upload with ${negotiatedStrategy.parallelUploads} streams`,
      );

      const parallelResult = await startParallelUpload({
        checksumService,
        source,
        storageId,
        fingerprint,
        uploadLengthDeferred,
        parallelUploads: negotiatedStrategy.parallelUploads,
        parallelChunkSize,
        retryDelays,
        smartChunker: initializedSmartChunker,
        uploadistaApi,
        logger,
        smartChunking,
        metrics,
        clientStorage,
        generateId,
        storeFingerprintForResuming,
        abortControllerFactory,
        platformService,
        openWebSocket: (id) => {
          wsManager.openUploadWebSocket(id);
          // Note: WebSocket opening is now async due to auth, but this callback is sync
          // The WebSocket will be opened in the background
          return null as unknown as WebSocketLike;
        },
        closeWebSocket: (id) => wsManager.closeUploadWebSocket(id),
        terminate: (id) =>
          terminate(id, uploadistaApi, platformService, retryDelays),
        onProgress,
        onChunkComplete,
        onSuccess,
        onError,
      });

      if (parallelResult) {
        return {
          abort: async () => {
            await parallelResult.abort();
          },
        };
      }

      logger.log("Parallel upload failed, falling back to single upload");
    }

    // Single upload path
    const result = await startSingleUpload({
      source,
      storageId,
      uploadId,
      platformService,
      uploadIdStorageKey,
      checksumService,
      fingerprint,
      uploadLengthDeferred,
      uploadistaApi,
      logger,
      clientStorage,
      generateId,
      storeFingerprintForResuming,
      openWebSocket: (id) => {
        wsManager.openUploadWebSocket(id);
        // Note: WebSocket opening is now async due to auth, but this callback is sync
        // The WebSocket will be opened in the background
        return null as unknown as WebSocketLike;
      },
      closeWebSocket: (id) => wsManager.closeUploadWebSocket(id),
      onProgress,
      onChunkComplete,
      onSuccess,
      onError,
    });

    if (result) {
      const abortController = abortControllerFactory.create();
      const { uploadId, uploadIdStorageKey, offset } = result;

      let timeoutId: Timeout | null = null;

      performUpload({
        platformService,
        uploadId,
        offset,
        source,
        uploadLengthDeferred,
        retryDelays,
        smartChunker: initializedSmartChunker,
        uploadistaApi,
        logger,
        smartChunking,
        metrics,
        abortController,
        onProgress,
        onChunkComplete,
        onSuccess,
        onShouldRetry,
        onRetry: (timeout) => {
          timeoutId = timeout;
        },
        onError,
      });

      return {
        abort: () => {
          abort({
            platformService,
            uploadId,
            uploadIdStorageKey,
            retryTimeout: timeoutId,
            shouldTerminate: true,
            abortController,
            uploadistaApi,
            retryDelays,
            clientStorage,
          });
        },
      };
    }

    return {
      abort: () => {},
    };
  };

  // Run validation on client creation
  validateAndThrow(
    {
      baseUrl,
      storageId,
      chunkSize,
      parallelUploads,
      parallelChunkSize,
      uploadStrategy,
    },
    logger,
  );

  /**
   * Upload a file through a flow (using streaming-input-node)
   */
  const uploadWithFlow = async (
    file: UploadInput,
    flowConfig: FlowUploadConfig,
    {
      onProgress,
      onChunkComplete,
      onSuccess,
      onShouldRetry,
      onJobStart,
      onError,
    }: Omit<
      UploadistaUploadOptions,
      "uploadLengthDeferred" | "uploadSize" | "metadata"
    > = {},
  ): Promise<{
    abort: () => Promise<void>;
    pause: () => Promise<FlowJob>;
    jobId: string;
  }> => {
    const source = await fileReader.openFile(file, chunkSize);

    const initializedSmartChunker = await initializeSmartChunker();

    const isSmartChunkingEnabled = smartChunking?.enabled !== false;
    if (isSmartChunkingEnabled) {
      const fingerprint = await fingerprintService.computeFingerprint(
        file,
        `${baseUrl}/${uploadistaBasePath}/api/flow`,
      );
      metrics.startSession(fingerprint || "unknown", source.size || 0, true);
    }

    const result = await startFlowUpload({
      source,
      flowConfig,
      uploadistaApi,
      logger,
      platformService,
      openWebSocket: (id) => wsManager.openFlowWebSocket(id),
      closeWebSocket: (id) => wsManager.closeWebSocket(id),
      onProgress,
      onChunkComplete,
      onSuccess,
      onJobStart,
      onError,
    });

    if (!result) {
      return {
        abort: async () => {},
        pause: async () => {
          throw new Error("Flow upload not initialized");
        },
        jobId: "",
      };
    }

    const { jobId, uploadFile, inputNodeId } = result;
    const abortController = abortControllerFactory.create();

    // Open upload WebSocket to receive upload progress events
    await wsManager.openUploadWebSocket(uploadFile.id);

    let timeoutId: Timeout | null = null;

    performFlowUpload({
      jobId,
      uploadFile,
      inputNodeId,
      offset: uploadFile.offset,
      source,
      retryDelays,
      smartChunker: initializedSmartChunker,
      uploadistaApi,
      logger,
      smartChunking,
      metrics,
      platformService,
      abortController,
      onProgress,
      onChunkComplete,
      onSuccess,
      onShouldRetry,
      onRetry: (timeout) => {
        timeoutId = timeout;
      },
      onError,
    });

    return {
      abort: async () => {
        // First, tell the server to cancel the flow
        try {
          await uploadistaApi.cancelFlow(jobId);
          logger.log(`Flow cancelled on server: ${jobId}`);
        } catch (err) {
          // Log but don't throw - client cleanup should still happen
          logger.log(`Failed to cancel flow on server: ${err}`);
        }

        // Then do client-side cleanup
        abortController.abort();
        if (timeoutId) {
          platformService.clearTimeout(timeoutId);
        }
        // Close both flow and upload WebSockets
        wsManager.closeWebSocket(jobId);
        wsManager.closeUploadWebSocket(uploadFile.id);
      },
      pause: () => uploadistaApi.pauseFlow(jobId),
      jobId,
    };
  };

  return {
    // Upload operations
    upload,
    uploadWithFlow,
    abort: (params: Parameters<typeof abort>[0]) => abort(params),

    // Flow operations
    getFlow: async (flowId: string) => {
      const { status, flow } = await uploadistaApi.getFlow(flowId);
      return { status, flow };
    },

    runFlow: async ({
      flowId,
      inputs,
      storageId: flowStorageId,
    }: {
      flowId: string;
      inputs: Record<string, unknown>;
      storageId?: string;
    }) => {
      const { status, job } = await uploadistaApi.runFlow(
        flowId,
        flowStorageId || storageId,
        inputs,
      );
      return { status, job };
    },

    resumeFlow: async ({
      jobId,
      nodeId,
      newData,
      contentType,
    }: {
      jobId: string;
      nodeId: string;
      newData: unknown;
      contentType?: "application/json" | "application/octet-stream";
    }) => {
      return uploadistaApi.resumeFlow(jobId, nodeId, newData, {
        contentType,
      });
    },

    pauseFlow: async (jobId: string) => {
      return uploadistaApi.pauseFlow(jobId);
    },

    cancelFlow: async (jobId: string) => {
      return uploadistaApi.cancelFlow(jobId);
    },

    // Job operations (unified for both uploads and flows)
    getJobStatus: async (jobId: string) => {
      return uploadistaApi.getJobStatus(jobId);
    },

    // WebSocket management methods
    openUploadWebSocket: (uploadId: string) =>
      wsManager.openUploadWebSocket(uploadId),
    openFlowWebSocket: (jobId: string) => wsManager.openFlowWebSocket(jobId),
    openWebSocket: (id: string) => wsManager.openWebSocket(id),
    closeWebSocket: (id: string) => wsManager.closeWebSocket(id),
    closeAllWebSockets: () => wsManager.closeAll(),
    sendPing: (jobId: string) => wsManager.sendPing(jobId),
    isWebSocketConnected: (id: string) => wsManager.isConnected(id),
    getWebSocketConnectionCount: () => wsManager.getConnectionCount(),
    getWebSocketConnectionCountByType: () =>
      wsManager.getConnectionCountByType(),

    // Smart chunking utilities
    getNetworkMetrics: () => networkMonitor.getCurrentMetrics(),
    getNetworkCondition: () => networkMonitor.getNetworkCondition(),
    getChunkingInsights: () => metrics.getPerformanceInsights(),
    exportMetrics: () => metrics.exportMetrics(),

    // Connection pooling utilities
    getConnectionMetrics: () => uploadistaApi.getConnectionMetrics(),
    getDetailedConnectionMetrics: () =>
      uploadistaApi.getDetailedConnectionMetrics(),
    warmupConnections: (urls: string[]) =>
      uploadistaApi.warmupConnections(urls),

    // Smart chunking insights
    getConnectionPoolingInsights: async () => {
      const chunker = await initializeSmartChunker();
      return chunker.getConnectionPoolingInsights();
    },

    resetMetrics: async () => {
      networkMonitor.reset();
      const chunker = await initializeSmartChunker();
      chunker.reset();
      metrics.reset();
    },

    // Configuration validation
    validateConfiguration: (options: UploadistaClientOptions<UploadInput>) => {
      return validateConfiguration(options, defaultClientCapabilities, logger);
    },

    validateConfigurationAsync: async (
      options: UploadistaClientOptions<UploadInput>,
    ) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      // Fetch capabilities using the authenticated HTTP client
      const capabilities = await uploadistaApi.getCapabilities(
        options.storageId,
      );

      const validation = validateConfiguration(options, capabilities, logger);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        capabilities,
      };
    },

    getCapabilities,
  };
}

/**
 * Uploadista client instance type.
 *
 * The client provides methods for:
 * - **Upload operations**: upload(), uploadWithFlow()
 * - **Flow operations**: getFlow(), runFlow(), resumeFlow()
 * - **Job management**: getJobStatus()
 * - **WebSocket management**: openUploadWebSocket(), openFlowWebSocket(), closeWebSocket()
 * - **Metrics and diagnostics**: getNetworkMetrics(), getChunkingInsights(), exportMetrics()
 * - **Connection pooling**: getConnectionMetrics(), warmupConnections()
 * - **Configuration validation**: validateConfiguration(), validateConfigurationAsync()
 *
 * @example Basic usage
 * ```typescript
 * const client = createUploadistaClient(config);
 *
 * // Upload a file
 * await client.upload(file, {
 *   onProgress: (progress) => console.log(`${progress}%`),
 *   onSuccess: (result) => console.log('Done:', result.id),
 * });
 *
 * // Get network metrics
 * const metrics = client.getNetworkMetrics();
 * console.log(`Speed: ${metrics.averageSpeed / 1024} KB/s`);
 * ```
 *
 * @see {@link createUploadistaClient} for creating an instance
 */
export type UploadistaClient = ReturnType<typeof createUploadistaClient>;
