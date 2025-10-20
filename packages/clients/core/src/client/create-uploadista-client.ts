import type { DataStoreCapabilities } from "@uploadista/core/types";
import type { AuthConfig, AuthManager } from "../auth";
import { DirectAuthManager, NoAuthManager, SaasAuthManager } from "../auth";
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

export type UploadistaUploadOptions = {
  uploadLengthDeferred?: boolean;
  uploadSize?: number;
  metadata?: Record<string, string>;
  computeChecksum?: boolean;
  checksumAlgorithm?: string;
} & Callbacks;

export type UploadistaClientOptions<UploadInput> = {
  baseUrl: string;
  uploadistaBasePath?: string;
  storageId: string;
  retryDelays?: number[];
  chunkSize: number;
  parallelUploads?: number;
  parallelChunkSize?: number;
  checksumService: ChecksumService;
  uploadStrategy?: UploadStrategyConfig;
  smartChunking?: SmartChunkerConfig;
  networkMonitoring?: NetworkMonitorConfig;
  uploadMetrics?: UploadMetricsConfig;
  httpClient: HttpClient;
  generateId: IdGenerationService;
  clientStorage: ClientStorage;
  fileReader: FileReaderService<UploadInput>;
  logger: Logger;
  fingerprintService: FingerprintService<UploadInput>;
  storeFingerprintForResuming: boolean;
  webSocketFactory: WebSocketFactory;
  abortControllerFactory: AbortControllerFactory;
  platformService: PlatformService;
  onError?: (error: Error) => void;
  onEvent?: UploadistaWebSocketEventHandler;

  /**
   * Optional authentication configuration.
   * Supports two modes:
   * - Direct: Bring your own auth (headers, cookies, custom tokens)
   * - SaaS: Standard JWT token exchange with auth server
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
   * @example SaaS mode with auth server
   * ```typescript
   * auth: {
   *   mode: 'saas',
   *   authServerUrl: 'https://auth.myapp.com/token',
   *   getCredentials: () => ({ username: 'user', password: 'pass' })
   * }
   * ```
   */
  auth?: AuthConfig;
};

// Default connection pooling configuration with health monitoring
export const defaultConnectionPoolingConfig: ConnectionPoolConfig = {
  maxConnectionsPerHost: 8,
  connectionTimeout: 20000,
  keepAliveTimeout: 90000,
  enableHttp2: true,
  retryOnConnectionError: true,
};

/**
 * Creates a unified Uploadista client that combines upload and flow functionality
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
      : new SaasAuthManager(auth, httpClient)
    : new NoAuthManager();

  // Log auth mode for debugging (without exposing credentials)
  if (auth) {
    logger.log(
      `Authentication enabled in ${auth.mode} mode${auth.mode === "saas" ? ` (server: ${auth.authServerUrl})` : ""}`,
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
  ): Promise<{ abort: () => void; jobId: string }> => {
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
        abort: () => {},
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
      abort: () => {
        abortController.abort();
        if (timeoutId) {
          platformService.clearTimeout(timeoutId);
        }
        // Close both flow and upload WebSockets
        wsManager.closeWebSocket(jobId);
        wsManager.closeUploadWebSocket(uploadFile.id);
      },
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

    continueFlow: async ({
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
      return uploadistaApi.continueFlow(jobId, nodeId, newData, {
        contentType,
      });
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

export type UploadistaClient = ReturnType<typeof createUploadistaClient>;
