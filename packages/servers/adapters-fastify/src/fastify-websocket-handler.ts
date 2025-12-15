// Import WebSocket type from @fastify/websocket
import type * as fastifyWebsocket from "@fastify/websocket";
import { FlowEngine, UploadEngine } from "@uploadista/core";
import type { AuthResult } from "@uploadista/server";
import {
  handleWebSocketClose,
  handleWebSocketError,
  handleWebSocketMessage,
  handleWebSocketOpen,
  type WebSocketConnection,
  type WebSocketConnectionRequest,
} from "@uploadista/server";
import { Effect } from "effect";
import type { FastifyRequest } from "fastify";
import type { FastifyContext } from "./fastify-adapter";

type WebSocket = fastifyWebsocket.WebSocket;

export type FastifyWebSocketHandler = (
  ws: WebSocket,
  req: FastifyRequest,
) => void;

function extractQueryParam(url: string, param: string): string | undefined {
  const regex = new RegExp(`[?&]${param}=([^&]*)`);
  const match = url.match(regex);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

/**
 * Cache for storing auth context per WebSocket connection
 */
const wsAuthCache = new Map<string, AuthResult>();

/**
 * Extracts WebSocket connection request details from Fastify/Node.js request
 */
const extractWebSocketRequest = (
  req: FastifyRequest,
  baseUrl: string,
):
  | WebSocketConnectionRequest
  | { type: "invalid-path"; expectedPrefix: string } => {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const expectedPrefix = `${baseUrl}/ws/`;

  // Check for ws/uploadista prefix
  if (!url.pathname.includes(expectedPrefix)) {
    return {
      type: "invalid-path",
      expectedPrefix,
    };
  }

  // Remove the prefix and get the actual route segments
  const routeSegments = url.pathname
    .replace(expectedPrefix, "")
    .split("/")
    .filter(Boolean);

  const isUploadRoute = routeSegments.includes("upload");
  const isFlowRoute = routeSegments.includes("flow");

  // Extract jobId and uploadId from URL path or query parameters
  // Path format: /uploadista/ws/flow/{jobId} or /uploadista/ws/upload/{uploadId}
  let jobId = extractQueryParam(req.url || "", "jobId");
  let uploadId = extractQueryParam(req.url || "", "uploadId");

  // If not in query params, extract from path segments
  if (!jobId && !uploadId && routeSegments.length >= 2) {
    const routeType = routeSegments[0]; // 'flow' or 'upload'
    const id = routeSegments[1]; // the actual ID

    if (routeType === "flow") {
      jobId = id;
    } else if (routeType === "upload") {
      uploadId = id;
    }
  }

  // Use jobId if available, otherwise use uploadId
  const eventId = jobId || uploadId;

  return {
    baseUrl,
    pathname: url.pathname,
    routeSegments,
    isUploadRoute,
    isFlowRoute,
    jobId,
    uploadId,
    eventId,
    // Connection will be set when WebSocket opens
    connection: null as unknown as WebSocketConnection,
  };
};

/**
 * Authenticates a WebSocket connection using the provided auth middleware
 */
const authenticateWebSocket = async (
  req: FastifyRequest,
  authMiddleware: (ctx: FastifyContext) => Promise<AuthResult>,
): Promise<{
  success: boolean;
  authResult?: AuthResult;
  error?: { message: string; code: number; authMethod: string };
}> => {
  try {
    // Extract token from query parameter
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const token = url.searchParams.get("token");

    let authResult: AuthResult | null = null;

    if (token) {
      // Token-based authentication
      // Create a mock request with Authorization header
      const mockReq = {
        ...req,
        headers: {
          ...req.headers,
          authorization: `Bearer ${token}`,
        },
      } as unknown as FastifyRequest;

      authResult = await authMiddleware({
        request: mockReq,
        reply: {} as never,
      });
    } else {
      // Cookie-based authentication
      // Pass the original request so auth middleware can read cookies
      authResult = await authMiddleware({
        request: req as unknown as FastifyRequest,
        reply: {} as never,
      });
    }

    if (!authResult) {
      const authMethod = token ? "token" : "cookies";
      return {
        success: false,
        error: {
          message: `Authentication failed: invalid or expired ${authMethod}`,
          code: 4001,
          authMethod,
        },
      };
    }

    return { success: true, authResult };
  } catch (error) {
    console.error("WebSocket auth error:", error);
    return {
      success: false,
      error: {
        message: "Authentication error",
        code: 4000,
        authMethod: "unknown",
      },
    };
  }
};

/**
 * Creates a WebSocket handler for Fastify with @fastify/websocket
 */
export const fastifyWebSocketHandler = (
  baseUrl: string,
  authMiddleware?: (ctx: FastifyContext) => Promise<AuthResult>,
): Effect.Effect<FastifyWebSocketHandler, never, UploadEngine | FlowEngine> => {
  return Effect.gen(function* () {
    const uploadEngine = yield* UploadEngine;
    const flowEngine = yield* FlowEngine;

    return (ws: WebSocket, req: FastifyRequest) => {
      // Extract WebSocket request details
      const wsRequest = extractWebSocketRequest(req, baseUrl);

      // Check if path is valid
      if ("type" in wsRequest && wsRequest.type === "invalid-path") {
        ws.close(
          4004,
          `Invalid WebSocket path. Expected prefix: ${wsRequest.expectedPrefix}`,
        );
        return;
      }

      // Type guard: now TypeScript knows wsRequest is WebSocketConnectionRequest
      const validWsRequest = wsRequest as WebSocketConnectionRequest;

      // Authenticate the connection if middleware is provided
      if (authMiddleware) {
        authenticateWebSocket(req, authMiddleware)
          .then((authResponse) => {
            if (!authResponse.success || !authResponse.authResult) {
              ws.close(
                authResponse.error?.code || 4001,
                authResponse.error?.message || "Authentication failed",
              );
              return;
            }

            // Store auth result for this connection
            const connectionId = `${validWsRequest.eventId}-${Date.now()}`;
            wsAuthCache.set(connectionId, authResponse.authResult);

            // Setup WebSocket handlers with auth context
            setupWebSocketHandlers(
              ws,
              validWsRequest,
              connectionId,
              uploadEngine,
              flowEngine,
            );
          })
          .catch((error) => {
            console.error("WebSocket auth failed:", error);
            ws.close(4000, "Authentication error");
          });
      } else {
        // No auth required, setup handlers directly
        const connectionId = `${validWsRequest.eventId}-${Date.now()}`;
        setupWebSocketHandlers(
          ws,
          validWsRequest,
          connectionId,
          uploadEngine,
          flowEngine,
        );
      }
    };
  });
};

/**
 * Sets up WebSocket event handlers for a connection
 */
function setupWebSocketHandlers(
  ws: WebSocket,
  wsRequest: WebSocketConnectionRequest,
  connectionId: string,
  uploadEngine: ReturnType<typeof UploadEngine.of>,
  flowEngine: ReturnType<typeof FlowEngine.of>,
) {
  // Create WebSocket connection object
  const connection: WebSocketConnection = {
    id: connectionId,
    readyState: ws.readyState,
    send: (data: string) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(data);
      }
    },
    close: (code?: number, reason?: string) => ws.close(code, reason),
  };

  // Update request with connection
  wsRequest.connection = connection;

  // Handle WebSocket open
  const openProgram = handleWebSocketOpen(wsRequest, uploadEngine, flowEngine);
  Effect.runPromise(openProgram).catch((error) => {
    console.error("WebSocket open handler error:", error);
    ws.close(1011, "Internal server error");
  });

  // Handle incoming messages
  ws.on("message", (data: Buffer) => {
    const message = data.toString();

    const messageProgram = handleWebSocketMessage(message, connection);
    Effect.runPromise(messageProgram).catch((error) => {
      console.error("WebSocket message handler error:", error);
    });
  });

  // Handle close
  ws.on("close", (_code: number, _reason: Buffer) => {
    // Clean up auth cache
    wsAuthCache.delete(connectionId);

    const closeProgram = handleWebSocketClose(
      wsRequest,
      uploadEngine,
      flowEngine,
    );
    Effect.runPromise(closeProgram).catch((error) => {
      console.error("WebSocket close handler error:", error);
    });
  });

  // Handle errors
  ws.on("error", (error: Error) => {
    const errorProgram = handleWebSocketError(error, wsRequest.eventId);
    Effect.runPromise(errorProgram).catch((err) => {
      console.error("WebSocket error handler error:", err);
    });
  });
}
