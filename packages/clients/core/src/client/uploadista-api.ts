import type { FlowData, FlowJob } from "@uploadista/core/flow";
import type {
  DataStoreCapabilities,
  InputFile,
  UploadFile,
} from "@uploadista/core/types";
import { AuthHttpClient, type AuthManager } from "../auth";
import { UploadistaError, type UploadistaErrorName } from "../error";
import type { Logger } from "../logger";
import { defaultClientCapabilities } from "../mock-data-store";
import type { AbortControllerLike } from "../services/abort-controller-service";
import type {
  ConnectionMetrics,
  DetailedConnectionMetrics,
  HttpClient,
  RequestBody,
} from "../services/http-client";
import type {
  WebSocketFactory,
  WebSocketLike,
} from "../services/websocket-service";

// Error response type - matches server format
type ErrorResponse = {
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
  timestamp?: string;
};

/**
 * Maps server error codes to client error names
 * If no mapping exists, uses a default error name based on context
 */
const mapServerErrorCodeToClientName = (
  serverCode: string | undefined,
  defaultName: UploadistaErrorName,
): UploadistaErrorName => {
  if (!serverCode) return defaultName;

  // Map common server error codes to client error names
  const errorMap: Record<string, UploadistaErrorName> = {
    FILE_NOT_FOUND: "UPLOAD_NOT_FOUND",
    UPLOAD_ID_NOT_FOUND: "UPLOAD_NOT_FOUND",
    FLOW_JOB_NOT_FOUND: "JOB_NOT_FOUND",
    FLOW_NODE_ERROR: "FLOW_RUN_FAILED",
    FLOW_STRUCTURE_ERROR: "FLOW_RUN_FAILED",
    FLOW_CYCLE_ERROR: "FLOW_RUN_FAILED",
    FLOW_INPUT_VALIDATION_ERROR: "FLOW_RUN_FAILED",
    FLOW_OUTPUT_VALIDATION_ERROR: "FLOW_RUN_FAILED",
    VALIDATION_ERROR: "CREATE_UPLOAD_FAILED",
    DATASTORE_NOT_FOUND: "FLOW_RUN_FAILED",
  };

  return errorMap[serverCode] || defaultName;
};

/**
 * Response from upload-related API calls.
 *
 * Contains the upload metadata and HTTP status code.
 */
export type UploadistaUploadResponse = {
  /** Upload file metadata, undefined if request failed */
  upload?: UploadFile;
  /** HTTP status code */
  status: number;
};

/**
 * Response from delete upload API call.
 */
export type UploadistaDeleteUploadResponse =
  | {
      /** Successfully deleted (no content) */
      status: 204;
    }
  | {
      /** Other status codes (e.g., 404, 500) */
      status: number;
    };

/**
 * Response from flow retrieval API call.
 */
export type FlowResponse = {
  /** HTTP status code */
  status: number;
  /** Flow configuration and metadata */
  flow: FlowData;
};

/**
 * Unified Uploadista API interface combining upload and flow operations.
 *
 * This low-level API provides direct access to server endpoints for:
 * - Upload CRUD operations (create, get, delete, patch chunks)
 * - Flow operations (get, run, continue)
 * - Job status tracking
 * - WebSocket connections for real-time updates
 * - Server capabilities discovery
 * - Connection pooling metrics
 *
 * Most applications should use the higher-level {@link UploadistaClient} instead,
 * which provides a more convenient interface with automatic retry, resumption,
 * and smart chunking.
 *
 * @example Direct API usage (advanced)
 * ```typescript
 * const api = createUploadistaApi(baseUrl, basePath, {
 *   httpClient,
 *   logger,
 *   authManager,
 *   webSocketFactory,
 * });
 *
 * // Create an upload
 * const { upload } = await api.createUpload({
 *   storageId: 'my-storage',
 *   size: 1024000,
 *   metadata: { filename: 'test.txt' },
 * });
 *
 * // Upload a chunk
 * const chunk = new Uint8Array(1024);
 * await api.uploadChunk(upload.id, chunk, {});
 *
 * // Check status
 * const { upload: updated } = await api.getUpload(upload.id);
 * console.log(`Progress: ${updated.offset}/${updated.size}`);
 * ```
 *
 * @see {@link createUploadistaApi} for creating an instance
 */
export type UploadistaApi = {
  /**
   * Retrieves upload metadata and current status.
   *
   * @param uploadId - Unique upload identifier
   * @returns Upload metadata including current offset and status
   * @throws {UploadistaError} If upload not found or request fails
   */
  getUpload: (uploadId: string) => Promise<UploadistaUploadResponse>;

  /**
   * Deletes an upload and its associated data.
   *
   * @param uploadId - Unique upload identifier
   * @returns Response with status 204 on success
   * @throws {UploadistaError} If upload not found or deletion fails
   */
  deleteUpload: (uploadId: string) => Promise<UploadistaDeleteUploadResponse>;

  /**
   * Creates a new upload on the server.
   *
   * @param body - Upload configuration including storageId, size, and metadata
   * @returns Created upload metadata with unique ID
   * @throws {UploadistaError} If creation fails or validation errors occur
   */
  createUpload: (body: InputFile) => Promise<UploadistaUploadResponse>;

  /**
   * Uploads a chunk of data to an existing upload.
   *
   * @param uploadId - Upload identifier to append data to
   * @param data - Chunk data bytes, or null to finalize without data
   * @param options - Upload options including abort controller and progress callback
   * @returns Updated upload metadata with new offset
   * @throws {UploadistaError} If chunk upload fails or upload is locked
   */
  uploadChunk: (
    uploadId: string,
    data: Uint8Array | null,
    options: {
      abortController?: AbortControllerLike;
      onProgress?: (bytes: number, total: number) => void;
    },
  ) => Promise<UploadistaUploadResponse>;

  /**
   * Retrieves flow configuration and metadata.
   *
   * @param flowId - Unique flow identifier
   * @returns Flow configuration including nodes and edges
   * @throws {UploadistaError} If flow not found
   */
  getFlow: (flowId: string) => Promise<FlowResponse>;

  /**
   * Executes a flow with the provided inputs.
   *
   * @param flowId - Flow to execute
   * @param storageId - Storage backend to use for flow outputs
   * @param inputs - Input data for flow nodes (keyed by node ID)
   * @returns Job metadata including job ID and initial state
   * @throws {UploadistaError} If flow execution fails or inputs are invalid
   */
  runFlow: (
    flowId: string,
    storageId: string,
    inputs: Record<string, unknown>,
  ) => Promise<{ status: number; job: FlowJob }>;

  /**
   * Continues a paused flow execution with new data.
   *
   * Used for interactive flows that wait for user input or external data.
   *
   * @param jobId - Job identifier for the paused flow
   * @param nodeId - Node ID where execution should continue
   * @param newData - Data to provide to the node
   * @param options - Options including content type for binary data
   * @returns Updated job metadata
   * @throws {UploadistaError} If job not found or continuation fails
   */
  resumeFlow: (
    jobId: string,
    nodeId: string,
    newData: unknown,
    options?: {
      contentType?: "application/json" | "application/octet-stream";
    },
  ) => Promise<FlowJob>;

  /**
   * Pauses a running flow execution.
   *
   * The flow will stop at the next node boundary (not mid-node execution).
   * Can be resumed later using resumeFlow.
   *
   * @param jobId - Job identifier for the running flow
   * @returns Updated job metadata with "paused" status
   * @throws {UploadistaError} If job not found or cannot be paused
   */
  pauseFlow: (jobId: string) => Promise<FlowJob>;

  /**
   * Cancels a running or paused flow execution.
   *
   * The flow will stop at the next node boundary (not mid-node execution).
   * Intermediate files are automatically cleaned up. This operation is terminal
   * and cannot be undone.
   *
   * @param jobId - Job identifier for the flow to cancel
   * @returns Updated job metadata with "cancelled" status
   * @throws {UploadistaError} If job not found or cannot be cancelled
   */
  cancelFlow: (jobId: string) => Promise<FlowJob>;

  /**
   * Retrieves current job status and outputs.
   *
   * Works for both upload and flow jobs.
   *
   * @param jobId - Job identifier
   * @returns Job metadata including state, progress, and outputs
   * @throws {UploadistaError} If job not found
   */
  getJobStatus: (jobId: string) => Promise<FlowJob>;

  /**
   * Opens a WebSocket connection for upload progress events.
   *
   * @param uploadId - Upload to monitor
   * @returns WebSocket instance for receiving real-time updates
   */
  openUploadWebSocket: (uploadId: string) => Promise<WebSocketLike>;

  /**
   * Opens a WebSocket connection for flow job events.
   *
   * @param jobId - Flow job to monitor
   * @returns WebSocket instance for receiving real-time updates
   */
  openFlowWebSocket: (jobId: string) => Promise<WebSocketLike>;

  /**
   * Closes a WebSocket connection.
   *
   * @param ws - WebSocket instance to close
   */
  closeWebSocket: (ws: WebSocketLike) => void;

  /**
   * Returns current connection pool metrics.
   *
   * @returns Basic metrics including active connections and reuse rate
   */
  getConnectionMetrics: () => ConnectionMetrics;

  /**
   * Returns detailed connection pool metrics with health diagnostics.
   *
   * @returns Comprehensive metrics including health status and recommendations
   */
  getDetailedConnectionMetrics: () => DetailedConnectionMetrics;

  /**
   * Pre-warms connections to the specified URLs.
   *
   * Useful for reducing latency on first upload by establishing
   * connections ahead of time.
   *
   * @param urls - URLs to pre-connect to
   */
  warmupConnections: (urls: string[]) => Promise<void>;

  /**
   * Fetches server capabilities for the specified storage backend.
   *
   * Returns information about chunk size constraints, supported features,
   * and storage-specific requirements. Falls back to default capabilities
   * if the request fails.
   *
   * @param storageId - Storage backend identifier
   * @returns Storage capabilities including chunk size limits
   */
  getCapabilities: (storageId: string) => Promise<DataStoreCapabilities>;
};

/**
 * Creates an Uploadista API instance for direct server communication.
 *
 * This factory creates a low-level API client that handles:
 * - HTTP requests to upload and flow endpoints
 * - Authentication via AuthManager (optional)
 * - WebSocket connections for real-time updates
 * - Error mapping from server to client error types
 * - Connection pooling and metrics
 *
 * Most applications should use {@link createUploadistaClient} instead,
 * which wraps this API with higher-level features like automatic retry,
 * resumption, and smart chunking.
 *
 * @param baseURL - Base URL of the Uploadista server (e.g., "https://upload.example.com")
 * @param uploadistBasePath - Base path for endpoints, typically "uploadista"
 * @param options - Configuration object
 * @param options.httpClient - HTTP client for making requests
 * @param options.logger - Optional logger for debugging
 * @param options.authManager - Optional authentication manager
 * @param options.webSocketFactory - Factory for creating WebSocket connections
 * @returns UploadistaApi instance
 *
 * @example Basic API instance
 * ```typescript
 * import { createUploadistaApi } from '@uploadista/client-core';
 *
 * const api = createUploadistaApi(
 *   'https://upload.example.com',
 *   'uploadista',
 *   {
 *     httpClient: myHttpClient,
 *     logger: console,
 *     webSocketFactory: {
 *       create: (url) => new WebSocket(url),
 *     },
 *   }
 * );
 *
 * // Use the API directly
 * const { upload } = await api.createUpload({
 *   storageId: 'my-storage',
 *   size: 1024,
 * });
 * ```
 *
 * @example With authentication
 * ```typescript
 * const authManager = new DirectAuthManager(authConfig, platformService, logger);
 *
 * const api = createUploadistaApi(baseUrl, 'uploadista', {
 *   httpClient,
 *   logger,
 *   authManager, // Automatically adds auth headers to requests
 *   webSocketFactory,
 * });
 * ```
 *
 * @see {@link UploadistaApi} for the API interface
 * @see {@link createUploadistaClient} for the high-level client
 */
export function createUploadistaApi(
  baseURL: string,
  uploadistBasePath: string,
  {
    httpClient: baseHttpClient,
    logger,
    authManager,
    webSocketFactory,
  }: {
    httpClient: HttpClient;
    logger?: Logger;
    authManager?: AuthManager;
    webSocketFactory: WebSocketFactory;
  },
): UploadistaApi {
  // Create base HTTP client with connection pooling

  // Wrap with auth if auth manager is provided
  const httpClient = authManager
    ? new AuthHttpClient(baseHttpClient, authManager)
    : baseHttpClient;

  // Construct endpoint URLs
  const uploadEndpoint = `${baseURL}/${uploadistBasePath}/api/upload`;
  const flowEndpoint = `${baseURL}/${uploadistBasePath}/api/flow`;
  const jobsEndpoint = `${baseURL}/${uploadistBasePath}/api/jobs`;

  // WebSocket URLs
  const wsBaseURL = baseURL.replace("http", "ws");
  const uploadWsURL = `${wsBaseURL}/uploadista/ws/upload`;
  const flowWsURL = `${wsBaseURL}/uploadista/ws/flow`;

  /**
   * Helper function to extract auth token for WebSocket connection.
   * Supports both DirectAuthManager (extracts from headers) and UploadistaCloudAuthManager (gets cached token).
   */
  const getAuthTokenForWebSocket = async (
    manager: AuthManager,
    jobId?: string,
  ): Promise<string | null> => {
    logger?.log(`Getting auth token for WebSocket (jobId: ${jobId})`);

    // Check if this is a UploadistaCloudAuthManager (has attachToken method)
    if ("attachToken" in manager) {
      logger?.log("Detected UploadistaCloudAuthManager, calling attachToken");
      const headers = await manager.attachToken({}, jobId);
      const authHeader = headers.Authorization;
      if (authHeader?.startsWith("Bearer ")) {
        logger?.log(
          "Successfully extracted Bearer token from UploadistaCloudAuthManager",
        );
        return authHeader.substring(7); // Remove "Bearer " prefix
      }
      logger?.log(
        `No valid Authorization header from UploadistaCloudAuthManager: ${authHeader}`,
      );
    }

    // Check if this is a DirectAuthManager (has attachCredentials method)
    if ("attachCredentials" in manager) {
      logger?.log("Detected DirectAuthManager, calling attachCredentials");
      const headers = await manager.attachCredentials({});
      const authHeader = headers.Authorization;
      if (authHeader) {
        logger?.log(
          "Successfully extracted Authorization header from DirectAuthManager",
        );
        // Support both "Bearer token" and plain token formats
        return authHeader.startsWith("Bearer ")
          ? authHeader.substring(7)
          : authHeader;
      }
      logger?.log(`No Authorization header from DirectAuthManager`);
    }

    logger?.log("No auth token could be extracted from auth manager");
    return null;
  };

  return {
    // Upload operations
    getUpload: async (uploadId: string) => {
      const res = await httpClient.request(`${uploadEndpoint}/${uploadId}`);

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "UPLOAD_NOT_FOUND",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Upload ${uploadId} not found`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as UploadFile;
      return { status: res.status, upload: data };
    },

    deleteUpload: async (uploadId: string) => {
      const res = await httpClient.request(`${uploadEndpoint}/${uploadId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "DELETE_UPLOAD_FAILED",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to delete upload ${uploadId}`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      return { status: res.status };
    },

    createUpload: async (data: InputFile) => {
      logger?.log(`createUpload ${JSON.stringify(data)}`);
      const res = await httpClient.request(uploadEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "CREATE_UPLOAD_FAILED",
        );
        const errorMessage =
          errorData.error || errorData.message || "Failed to create upload";

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const responseData = (await res.json()) as UploadFile;
      logger?.log(JSON.stringify(responseData));
      return { status: res.status, upload: responseData };
    },

    uploadChunk: async (uploadId, data, { abortController }) => {
      try {
        const res = await httpClient.request(`${uploadEndpoint}/${uploadId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/octet-stream",
          },
          body: data,
          signal: abortController?.signal,
        });

        if (!res.ok) {
          const errorData = (await res
            .json()
            .catch(() => ({}))) as ErrorResponse;
          throw new UploadistaError({
            name: "NETWORK_ERROR",
            message:
              errorData.error || errorData.message || "Unknown network error",
            status: res.status,
          });
        }

        const responseData = (await res.json()) as UploadFile;
        return { status: res.status, upload: responseData };
      } catch (err) {
        if (err instanceof UploadistaError) {
          throw err;
        }
        throw new UploadistaError({
          name: "NETWORK_ERROR",
          message: "Network error",
          cause: err as Error,
        });
      }
    },

    // Flow operations
    getFlow: async (flowId: string) => {
      const res = await httpClient.request(`${flowEndpoint}/${flowId}`);

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "FLOW_NOT_FOUND",
        );
        const errorMessage =
          errorData.error || errorData.message || `Flow ${flowId} not found`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as FlowData;
      logger?.log(`getFlow: ${flowId}`);
      return { status: res.status, flow: data };
    },

    runFlow: async (
      flowId: string,
      storageId: string,
      inputs: Record<string, unknown>,
    ) => {
      logger?.log(`runFlow: ${flowId} with storage: ${storageId}`);
      const res = await httpClient.request(
        `${flowEndpoint}/${flowId}/${storageId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ inputs }),
        },
      );

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "FLOW_RUN_FAILED",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to run flow ${flowId}`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as FlowJob;
      logger?.log(`runFlow response: ${JSON.stringify(data)}`);
      return { status: res.status, job: data };
    },

    resumeFlow: async (
      jobId: string,
      nodeId: string,
      newData: unknown,
      options?: {
        contentType?: "application/json" | "application/octet-stream";
      },
    ) => {
      const contentType = options?.contentType || "application/json";

      let body: RequestBody;
      if (contentType === "application/octet-stream") {
        // For octet-stream, newData should be a Uint8Array or similar
        body = newData as RequestBody;
      } else {
        // For JSON, wrap newData in an object
        body = JSON.stringify({ newData });
      }

      const res = await httpClient.request(
        `${jobsEndpoint}/${jobId}/resume/${nodeId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": contentType,
          },
          body,
        },
      );

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "FLOW_RESUMED_FAILED",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to resume flow for job ${jobId}`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as FlowJob;
      return data;
    },

    pauseFlow: async (jobId: string) => {
      const res = await httpClient.request(`${jobsEndpoint}/${jobId}/pause`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "FLOW_PAUSE_FAILED",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to pause flow for job ${jobId}`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as FlowJob;
      logger?.log(`Flow paused: ${jobId}, status: ${data.status}`);
      return data;
    },

    cancelFlow: async (jobId: string) => {
      const res = await httpClient.request(`${jobsEndpoint}/${jobId}/cancel`, {
        method: "POST",
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "FLOW_CANCEL_FAILED",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to cancel flow for job ${jobId}`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as FlowJob;
      logger?.log(`Flow cancelled: ${jobId}, status: ${data.status}`);
      return data;
    },

    // Unified job operations
    getJobStatus: async (jobId: string) => {
      const res = await httpClient.request(`${jobsEndpoint}/${jobId}/status`);

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as ErrorResponse;
        const errorName = mapServerErrorCodeToClientName(
          errorData.code,
          "JOB_NOT_FOUND",
        );
        const errorMessage =
          errorData.error || errorData.message || `Job ${jobId} not found`;

        throw new UploadistaError({
          name: errorName,
          message: errorData.code
            ? `${errorMessage} (${errorData.code})`
            : errorMessage,
          status: res.status,
        });
      }

      const data = (await res.json()) as FlowJob;
      return data;
    },

    // WebSocket operations
    openUploadWebSocket: async (uploadId: string) => {
      let wsUrl = `${uploadWsURL}/${uploadId}`;

      // Attach auth token if auth manager is configured
      // Note: For cookie-based auth (e.g., HttpOnly cookies with better-auth),
      // no token is needed as cookies are automatically sent by the browser
      if (authManager) {
        try {
          const token = await getAuthTokenForWebSocket(authManager, uploadId);
          if (token) {
            wsUrl += `?token=${encodeURIComponent(token)}`;
            logger?.log(`WebSocket token attached for upload: ${uploadId}`);
          } else {
            // No token means cookie-based auth - this is fine
            logger?.log(
              `No token for upload WebSocket (using cookie-based auth): ${uploadId}`,
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger?.log(
            `Error getting auth token for upload WebSocket: ${errorMessage}`,
          );
          // Don't throw - allow cookie-based auth to proceed
          logger?.log(
            `Proceeding with cookie-based authentication for upload WebSocket: ${uploadId}`,
          );
        }
      }

      const ws = webSocketFactory.create(wsUrl);

      ws.onopen = () => {
        logger?.log(`Upload WebSocket connection opened for: ${uploadId}`);
      };

      ws.onclose = () => {
        logger?.log(`Upload WebSocket connection closed for: ${uploadId}`);
      };

      ws.onerror = (error) => {
        logger?.log(`Upload WebSocket error for ${uploadId}: ${error}`);
      };

      return ws;
    },

    openFlowWebSocket: async (jobId: string) => {
      let wsUrl = `${flowWsURL}/${jobId}`;

      // Attach auth token if auth manager is configured
      // Note: For cookie-based auth (e.g., HttpOnly cookies with better-auth),
      // no token is needed as cookies are automatically sent by the browser
      if (authManager) {
        try {
          const token = await getAuthTokenForWebSocket(authManager, jobId);
          if (token) {
            wsUrl += `?token=${encodeURIComponent(token)}`;
            logger?.log(`WebSocket token attached for flow job: ${jobId}`);
          } else {
            // No token means cookie-based auth - this is fine
            logger?.log(
              `No token for flow WebSocket (using cookie-based auth): ${jobId}`,
            );
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          logger?.log(
            `Error getting auth token for flow WebSocket: ${errorMessage}`,
          );
          // Don't throw - allow cookie-based auth to proceed
          logger?.log(
            `Proceeding with cookie-based authentication for flow WebSocket: ${jobId}`,
          );
        }
      }

      const ws = webSocketFactory.create(wsUrl);

      ws.onopen = () => {
        logger?.log(`Flow WebSocket connection opened for job: ${jobId}`);
      };

      ws.onclose = () => {
        logger?.log(`Flow WebSocket connection closed for job: ${jobId}`);
      };

      ws.onerror = (error) => {
        logger?.log(`Flow WebSocket error for job ${jobId}: ${error}`);
      };

      return ws;
    },

    closeWebSocket: (ws: WebSocketLike) => {
      ws.close();
    },

    // Connection metrics
    getConnectionMetrics: () => {
      return httpClient.getMetrics();
    },

    getDetailedConnectionMetrics: () => {
      return httpClient.getDetailedMetrics();
    },

    warmupConnections: async (urls: string[]) => {
      return httpClient.warmupConnections(urls);
    },

    // Capabilities
    getCapabilities: async (storageId: string) => {
      const capabilitiesUrl = `${uploadEndpoint}/capabilities?storageId=${encodeURIComponent(storageId)}`;

      try {
        const response = await httpClient.request(capabilitiesUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          logger?.log(
            `Failed to fetch capabilities: ${response.status} ${response.statusText}`,
          );
          return defaultClientCapabilities;
        }

        const data = await response.json();
        return (data as { capabilities: DataStoreCapabilities }).capabilities;
      } catch (error) {
        logger?.log(
          `Failed to fetch server capabilities, using defaults: ${error}`,
        );
        return defaultClientCapabilities;
      }
    },
  };
}
