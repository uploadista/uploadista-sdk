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

// Upload-related types (re-using types from upload-api to avoid duplication)
export type UploadistaUploadResponse = {
  upload?: UploadFile;
  status: number;
};

export type UploadistaDeleteUploadResponse =
  | {
      status: 204;
    }
  | {
      status: number;
    };

// Flow-related types
export type FlowResponse = {
  status: number;
  flow: FlowData;
};

/**
 * Unified Uploadista API - combines upload and flow operations
 */
export type UploadistaApi = {
  // Upload operations
  getUpload: (uploadId: string) => Promise<UploadistaUploadResponse>;
  deleteUpload: (uploadId: string) => Promise<UploadistaDeleteUploadResponse>;
  createUpload: (body: InputFile) => Promise<UploadistaUploadResponse>;
  uploadChunk: (
    uploadId: string,
    data: Uint8Array | null,
    options: {
      abortController?: AbortControllerLike;
      onProgress?: (bytes: number, total: number) => void;
    },
  ) => Promise<UploadistaUploadResponse>;

  // Flow operations
  getFlow: (flowId: string) => Promise<FlowResponse>;
  runFlow: (
    flowId: string,
    storageId: string,
    inputs: Record<string, unknown>,
  ) => Promise<{ status: number; job: FlowJob }>;
  continueFlow: (
    jobId: string,
    nodeId: string,
    newData: unknown,
    options?: {
      contentType?: "application/json" | "application/octet-stream";
    },
  ) => Promise<FlowJob>;

  // Unified job operations
  getJobStatus: (jobId: string) => Promise<FlowJob>;

  // WebSocket operations
  openUploadWebSocket: (uploadId: string) => Promise<WebSocketLike>;
  openFlowWebSocket: (jobId: string) => Promise<WebSocketLike>;
  closeWebSocket: (ws: WebSocketLike) => void;

  // Connection metrics
  getConnectionMetrics: () => ConnectionMetrics;
  getDetailedConnectionMetrics: () => DetailedConnectionMetrics;
  warmupConnections: (urls: string[]) => Promise<void>;

  // Capabilities
  getCapabilities: (storageId: string) => Promise<DataStoreCapabilities>;
};

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
   * Supports both DirectAuthManager (extracts from headers) and SaasAuthManager (gets cached token).
   */
  const getAuthTokenForWebSocket = async (
    manager: AuthManager,
    jobId?: string,
  ): Promise<string | null> => {
    logger?.log(`Getting auth token for WebSocket (jobId: ${jobId})`);

    // Check if this is a SaasAuthManager (has attachToken method)
    if ("attachToken" in manager) {
      logger?.log("Detected SaasAuthManager, calling attachToken");
      const headers = await manager.attachToken({}, jobId);
      const authHeader = headers.Authorization;
      if (authHeader?.startsWith("Bearer ")) {
        logger?.log("Successfully extracted Bearer token from SaasAuthManager");
        return authHeader.substring(7); // Remove "Bearer " prefix
      }
      logger?.log(
        `No valid Authorization header from SaasAuthManager: ${authHeader}`,
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

    continueFlow: async (
      jobId: string,
      nodeId: string,
      newData: unknown,
      options?: {
        contentType?: "application/json" | "application/octet-stream";
      },
    ) => {
      logger?.log(`continueFlow: ${jobId} at node: ${nodeId}`);

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
        `${jobsEndpoint}/${jobId}/continue/${nodeId}`,
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
          "FLOW_CONTINUE_FAILED",
        );
        const errorMessage =
          errorData.error ||
          errorData.message ||
          `Failed to continue flow for job ${jobId}`;

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
