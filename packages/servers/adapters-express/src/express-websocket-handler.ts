import type { IncomingMessage } from "node:http";
import { FlowServer, UploadServer } from "@uploadista/core";
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
import type { Request, Response } from "express";
import type { WebSocket } from "ws";
import type { ExpressContext } from "./express-adapter";

export type ExpressWebSocketHandler = (
  ws: WebSocket,
  req: IncomingMessage,
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
 * Extracts WebSocket connection request details from Express/Node.js request
 */
const extractWebSocketRequest = (
  req: IncomingMessage,
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
  req: IncomingMessage,
  authMiddleware: (ctx: ExpressContext) => Promise<AuthResult>,
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
        header: (name: string) => {
          if (name.toLowerCase() === "authorization") {
            return `Bearer ${token}`;
          }
          return req.headers[name.toLowerCase()];
        },
      } as unknown as Request;

      authResult = await authMiddleware({
        request: mockReq as unknown as Request,
        response: {} as Response,
      });
    } else {
      // Cookie-based authentication
      // Pass the original request so auth middleware can read cookies
      authResult = await authMiddleware({
        request: req as unknown as Request,
        response: {} as Response,
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

    console.log(`WebSocket authenticated for user: ${authResult.clientId}`);
    return { success: true, authResult };
  } catch (error) {
    console.error("WebSocket auth error:", error);
    return {
      success: false,
      error: {
        message: "Authentication error",
        code: 4001,
        authMethod: "unknown",
      },
    };
  }
};

/**
 * Creates an Express WebSocket handler that delegates to core WebSocket handlers
 */
export const expressWebSocketHandler = (
  baseUrl: string,
  authMiddleware?: (ctx: ExpressContext) => Promise<AuthResult>,
): Effect.Effect<ExpressWebSocketHandler, never, UploadServer | FlowServer> => {
  return Effect.gen(function* () {
    // Get the server instances from the Effect context
    const uploadServer = yield* UploadServer;
    const flowServer = yield* FlowServer;

    return (ws: WebSocket, req: IncomingMessage) => {
      // Extract request details (adapter's responsibility)
      const requestOrError = extractWebSocketRequest(req, baseUrl);

      console.log("🔍 WebSocket request details:", requestOrError);

      // Handle invalid path
      if ("type" in requestOrError && requestOrError.type === "invalid-path") {
        ws.send(
          JSON.stringify({
            type: "invalid-path",
            message: `WebSocket path must start with ${requestOrError.expectedPrefix}`,
            expectedPrefix: requestOrError.expectedPrefix,
          }),
        );
        ws.close(1000, "Invalid path");
        return;
      }

      // Type narrowing: at this point, requestOrError is WebSocketConnectionRequest
      const request = requestOrError as WebSocketConnectionRequest;

      // Create framework-agnostic connection wrapper
      // Use a getter for readyState so it always reflects the current state
      const connection: WebSocketConnection = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        send: (data: string) => {
          if (ws.readyState === ws.OPEN) {
            console.log(`📤 Sending WebSocket message to connection ${connection.id}:`, data.substring(0, 100));
            ws.send(data);
          } else {
            console.warn(`⚠️ Cannot send message, WebSocket not open. State: ${ws.readyState}`);
          }
        },
        close: (code?: number, reason?: string) => ws.close(code, reason),
        get readyState() {
          return ws.readyState;
        },
      };

      // Update request with connection
      request.connection = connection;

      // Handle WebSocket open
      (async () => {
        // Validate authentication if auth middleware is configured
        if (authMiddleware) {
          const authResult = await authenticateWebSocket(req, authMiddleware);

          if (!authResult.success) {
            ws.send(
              JSON.stringify({
                type: "auth-failed",
                message: authResult.error?.message,
                code: "AUTH_FAILED",
                authMethod: authResult.error?.authMethod,
              }),
            );
            ws.close(authResult.error?.code || 4001, authResult.error?.message);
            return;
          }

          // Cache auth context for this connection
          if (authResult.authResult) {
            wsAuthCache.set(connection.id, authResult.authResult);
          }
        }

        console.log(
          "🔍 WebSocket open for eventId:",
          request.eventId,
          "with connection id:",
          connection.id,
        );

        // Delegate to core handler for business logic
        const openEffect = handleWebSocketOpen(
          request,
          uploadServer,
          flowServer,
        );
        Effect.runFork(openEffect);
      })();

      // Handle WebSocket message
      ws.on("message", (data: unknown) => {
        const messageEffect = handleWebSocketMessage(
          data as string,
          connection,
        );
        Effect.runFork(messageEffect);
      });

      // Handle WebSocket close
      ws.on("close", () => {
        // Clear cached auth context for this connection
        if (request.connection?.id) {
          wsAuthCache.delete(request.connection.id);
          console.log(
            `Cleared auth cache for WebSocket connection: ${request.connection.id}`,
          );
        }

        // Delegate to core handler for cleanup
        const closeEffect = handleWebSocketClose(
          request,
          uploadServer,
          flowServer,
        );
        Effect.runFork(closeEffect);
      });

      // Handle WebSocket error
      ws.on("error", (...args: unknown[]) => {
        const error = args[0] as Error;
        const errorEffect = handleWebSocketError(error, request.eventId);
        Effect.runFork(errorEffect);
      });
    };
  });
};
