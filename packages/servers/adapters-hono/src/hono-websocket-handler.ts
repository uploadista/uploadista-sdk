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
import type { Context, Env } from "hono";
import type { WSEvents } from "hono/ws";

export type HonoWebSocketHandler<TEnv extends Env = Env> = (
  c: Context<TEnv>,
) => WSEvents;

/**
 * Cache for storing auth context per WebSocket connection
 * Maps connection ID to auth context
 */
const wsAuthCache = new Map<string, AuthResult>();

/**
 * Extracts WebSocket connection request details from Hono context
 * This is the adapter's responsibility - converting Hono-specific details
 * into the framework-agnostic WebSocketConnectionRequest format
 */
const extractWebSocketRequest = (
  c: Context,
  baseUrl: string,
):
  | WebSocketConnectionRequest
  | { type: "invalid-path"; expectedPrefix: string } => {
  const url = new URL(c.req.url);
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

  // Support both jobId (for flows) and uploadId (for uploads)
  const jobId = c.req.query("jobId") || c.req.param("jobId");
  const uploadId = c.req.query("uploadId") || c.req.param("uploadId");

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
 * Handles both token-based and cookie-based authentication
 */
const authenticateWebSocket = async <TEnv extends Env>(
  c: Context<TEnv>,
  authMiddleware: (c: Context<TEnv>) => Promise<AuthResult>,
): Promise<{
  success: boolean;
  authResult?: AuthResult;
  error?: { message: string; code: number; authMethod: string };
}> => {
  try {
    // Extract token from query parameter (optional for token-based auth)
    const token = c.req.query("token");

    let authResult: AuthResult | null = null;

    if (token) {
      // Token-based authentication (for UploadistaCloud mode or explicit token auth)
      // Create a mock request context with the token as Authorization header
      const mockRequest = new Request(c.req.url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const mockContext = {
        ...c,
        req: {
          ...c.req,
          header: (name: string) => {
            if (name.toLowerCase() === "authorization") {
              return `Bearer ${token}`;
            }
            return c.req.header(name);
          },
          raw: mockRequest,
        },
      } as Context<TEnv>;

      authResult = await authMiddleware(mockContext);
    } else {
      // Cookie-based authentication (for Direct mode with HttpOnly cookies)
      // Pass the original context so auth middleware can read cookies from the upgrade request
      // The browser automatically sends cookies with the WebSocket upgrade request
      authResult = await authMiddleware(c);
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
 * Creates a Hono WebSocket handler that delegates to core WebSocket handlers.
 *
 * This handler works with standard WebSocket connections and requires an event
 * broadcaster to synchronize state across multiple worker instances.
 *
 * For Cloudflare Durable Objects, use `honoDurableObjectAdapter` instead,
 * which provides a different architecture better suited for DO's hibernatable
 * WebSocket pattern.
 *
 * This adapter is responsible for:
 * 1. Extracting WebSocket connection details from Hono's WSEvents
 * 2. Wrapping Hono's WebSocket in the framework-agnostic WebSocketConnection interface
 * 3. Handling Hono-specific authentication
 * 4. Delegating all business logic to core handlers
 *
 * @param baseUrl - Base URL for WebSocket connections
 * @param authMiddleware - Optional authentication middleware
 * @returns Hono WSEvents handler
 */
export const honoWebSocketHandler = <TEnv extends Env = Env>(
  baseUrl: string,
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>,
) => {
  return Effect.gen(function* () {
    // Get the server instances from the Effect context
    const uploadServer = yield* UploadServer;
    const flowServer = yield* FlowServer;

    return (c: Context<TEnv>): WSEvents => {
      // Extract request details (adapter's responsibility)
      const requestOrError = extractWebSocketRequest(c, baseUrl);

      // Handle invalid path
      if ("type" in requestOrError && requestOrError.type === "invalid-path") {
        return {
          onOpen: (_event, ws) => {
            ws.send(
              JSON.stringify({
                type: "invalid-path",
                message: `WebSocket path must start with ${requestOrError.expectedPrefix}`,
                expectedPrefix: requestOrError.expectedPrefix,
              }),
            );
            ws.close(1000, "Invalid path");
          },
        } satisfies WSEvents;
      }

      // Type narrowing: at this point, requestOrError is WebSocketConnectionRequest
      const request = requestOrError as WebSocketConnectionRequest;

      return {
        async onOpen(_event, ws) {
          const rawWs = ws.raw as WebSocket;
          if (!rawWs) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Invalid WebSocket connection",
              }),
            );
            ws.close(1000, "Invalid connection");
            return;
          }

          // Create framework-agnostic connection wrapper (adapter's responsibility)
          const connection: WebSocketConnection = {
            id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
            send: (data: string) => rawWs.send(data),
            close: (code?: number, reason?: string) =>
              rawWs.close(code, reason),
            readyState: rawWs.readyState,
          };

          // Update request with connection
          request.connection = connection;

          // Validate authentication if auth middleware is configured (adapter's responsibility)
          if (authMiddleware) {
            const authResult = await authenticateWebSocket(c, authMiddleware);

            if (!authResult.success) {
              ws.send(
                JSON.stringify({
                  type: "auth-failed",
                  message: authResult.error?.message,
                  code: "AUTH_FAILED",
                  authMethod: authResult.error?.authMethod,
                }),
              );
              ws.close(
                authResult.error?.code || 4001,
                authResult.error?.message,
              );
              return;
            }

            // Cache auth context for this connection
            if (authResult.authResult) {
              wsAuthCache.set(connection.id, authResult.authResult);
            }
          }

          // Delegate to core handler for business logic
          const openEffect = handleWebSocketOpen(
            request,
            uploadServer,
            flowServer,
          );
          Effect.runFork(openEffect);
        },

        async onMessage(event, ws) {
          const rawWs = ws.raw as WebSocket;
          if (!rawWs) return;

          const connection: WebSocketConnection = {
            id: request.connection?.id || "unknown",
            send: (data: string) => rawWs.send(data),
            close: (code?: number, reason?: string) =>
              rawWs.close(code, reason),
            readyState: rawWs.readyState,
          };

          // Delegate to core handler for message handling
          const messageEffect = handleWebSocketMessage(
            event.data as string,
            connection,
          );
          Effect.runFork(messageEffect);
        },

        async onClose() {
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
        },

        onError(error) {
          // Delegate to core handler for error handling
          const errorEffect = handleWebSocketError(error, request.eventId);
          Effect.runFork(errorEffect);
        },
      } satisfies WSEvents;
    };
  });
};
