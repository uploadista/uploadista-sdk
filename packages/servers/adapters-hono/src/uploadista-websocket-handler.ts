import type { Request as CloudflareRequest } from "@cloudflare/workers-types";
import { UploadistaError } from "@uploadista/core/errors";
import type { FlowServerShape } from "@uploadista/core/flow";
import type { UploadEvent } from "@uploadista/core/types";
import type { UploadServerShape } from "@uploadista/core/upload";
import type { EventEmitterDurableObject } from "@uploadista/event-emitter-durable-object";
import type { AuthContext, AuthResult } from "@uploadista/server";
import { Effect } from "effect";
import type { Context, Env } from "hono";
import type { WSEvents } from "hono/ws";

export type WebSocketConnection = {
  id: string;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  readyState: number;
};

export type DurableObjectWebSocketHandlerOptions = {
  durableObject: EventEmitterDurableObject<UploadEvent>;
};

/**
 * Cache for storing auth context per WebSocket connection
 * Maps connection ID to auth context
 */
const wsAuthCache = new Map<string, AuthContext>();

export const createUploadistaWebSocketHandler = <TEnv extends Env = Env>(
  baseUrl: string,
  uploadServer: UploadServerShape,
  flowServer: FlowServerShape,
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>,
) => {
  return (c: Context<TEnv>): WSEvents => {
    // Check for ws/uploadista prefix
    const url = new URL(c.req.url);

    if (!url.pathname.includes(`${baseUrl}/ws/`)) {
      return {
        onOpen: (_event, ws) => {
          ws.send(
            JSON.stringify({
              type: "error",
              message: `WebSocket path must start with ${baseUrl}/ws/`,
            }),
          );
          ws.close(1000, "Invalid path");
        },
      } satisfies WSEvents;
    }

    // Remove the prefix and get the actual route segments
    const routeSegments = url.pathname
      .replace(`${baseUrl}/ws/`, "")
      .split("/")
      .filter(Boolean);

    const isUploadRoute = routeSegments.includes("upload");
    const isFlowRoute = routeSegments.includes("flow");

    // Support both jobId (for flows) and uploadId (for uploads)
    const jobId = c.req.query("jobId") || c.req.param("jobId");
    const uploadId = c.req.query("uploadId") || c.req.param("uploadId");

    // Use jobId if available, otherwise use uploadId
    const eventId = jobId || uploadId;

    console.log("Uploadista websocket handler", { jobId, uploadId, eventId });

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

        const connection: WebSocketConnection = {
          id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          send: (data: string) => rawWs.send(data),
          close: (code?: number, reason?: string) => rawWs.close(code, reason),
          readyState: rawWs.readyState,
        };

        // Validate authentication if auth middleware is configured
        if (authMiddleware) {
          try {
            // Extract token from query parameter (optional for token-based auth)
            const token = c.req.query("token");

            let authResult: AuthResult | null = null;

            if (token) {
              // Token-based authentication (for SaaS mode or explicit token auth)
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
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: `Authentication failed: invalid or expired ${authMethod}`,
                  code: "AUTH_FAILED",
                }),
              );
              ws.close(4001, "Authentication failed");
              return;
            }

            // Cache auth context for this connection
            wsAuthCache.set(connection.id, authResult);

            console.log(
              `WebSocket authenticated for user: ${authResult.clientId}`,
            );
          } catch (error) {
            console.error("WebSocket auth error:", error);
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Authentication error",
                code: "AUTH_ERROR",
              }),
            );
            ws.close(4001, "Authentication error");
            return;
          }
        }

        const subscribeEffect = Effect.gen(function* () {
          // Subscribe to flow events if we had a jobId
          if (isFlowRoute) {
            // Subscribe to flow events (this handles job tracking)
            yield* flowServer.subscribeToFlowEvents(jobId, connection);
          }

          // If we have an uploadId, also subscribe to upload events
          // These will be treated as task events within the job
          if (isUploadRoute) {
            yield* uploadServer.subscribeToUploadEvents(uploadId, connection);
          }

          ws.send(
            JSON.stringify({
              type: "connection",
              message: "Uploadista WebSocket connected",
              id: eventId,
              jobId,
              uploadId,
              timestamp: new Date().toISOString(),
            }),
          );
        }).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.error("Error subscribing to events:", error);
              const errorMessage =
                error instanceof UploadistaError
                  ? error.body
                  : "Failed to subscribe to events";
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: errorMessage,
                  code:
                    error instanceof UploadistaError
                      ? error.code
                      : "SUBSCRIPTION_ERROR",
                }),
              );
            }),
          ),
        );

        Effect.runFork(subscribeEffect);
      },

      async onMessage(event, ws) {
        try {
          const message = JSON.parse(event.data as string);
          if (message.type === "ping") {
            ws.send(
              JSON.stringify({
                type: "pong",
                timestamp: new Date().toISOString(),
              }),
            );
          }
        } catch (error) {
          console.error("Error handling WebSocket message:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Invalid message format",
            }),
          );
        }
      },

      async onClose() {
        // Clear cached auth context for this connection
        // Note: We need to find the connection ID from the websocket
        // For now, we'll clear based on eventId as a workaround
        // In a production implementation, you'd track connection IDs more carefully
        for (const [connId, _authCtx] of wsAuthCache.entries()) {
          // Clean up stale connections (this is a simple heuristic)
          // A better approach would be to track connection-to-ID mapping
          if (connId.includes(eventId)) {
            wsAuthCache.delete(connId);
            console.log(
              `Cleared auth cache for WebSocket connection: ${connId}`,
            );
          }
        }

        const unsubscribeEffect = Effect.gen(function* () {
          // Unsubscribe from flow events if we had a jobId
          if (isFlowRoute) {
            yield* flowServer.unsubscribeFromFlowEvents(jobId);
          }

          // Unsubscribe from upload events if we had an uploadId
          if (isUploadRoute) {
            yield* uploadServer.unsubscribeFromUploadEvents(uploadId);
          }
        }).pipe(
          Effect.catchAll((error) =>
            Effect.sync(() => {
              console.error(
                "Error unsubscribing from events:",
                error instanceof UploadistaError ? error.body : error,
              );
            }),
          ),
        );

        Effect.runFork(unsubscribeEffect);
      },

      onError(error) {
        console.error(`WebSocket error for event ${eventId}:`, error);
      },
    } satisfies WSEvents;
  };
};

/**
 * Creates a raw request handler for Durable Object WebSocket delegation
 * This should be used in Cloudflare Workers when you want to delegate
 * WebSocket handling directly to a Durable Object.
 */
export const createUploadistaDurableObjectWebSocketRequestHandler = ({
  durableObject,
}: DurableObjectWebSocketHandlerOptions) => {
  return async (c: Context): Promise<Response> => {
    const uploadId = c.req.param("uploadId");

    if (!uploadId) {
      return c.text("Missing uploadId parameter", 400);
    }

    const upgradeHeader = c.req.header("Upgrade");
    if (!upgradeHeader || upgradeHeader !== "websocket") {
      return c.text("Expected websocket", 400);
    }

    // Get the Durable Object instance for this upload
    const id = durableObject.idFromName(uploadId);
    const stub = durableObject.get(id);

    // Forward the WebSocket upgrade request to the Durable Object
    const request = c.req.raw as unknown as CloudflareRequest;

    const cfResponse = await stub.fetch(request);

    // Return the response, type-cast to satisfy Hono's Response type
    return cfResponse as unknown as Response;
  };
};
