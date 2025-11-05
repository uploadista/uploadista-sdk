import type { DurableObjectNamespace } from "@cloudflare/workers-types";
import type { AuthResult, ServerAdapter } from "@uploadista/server";
import { Effect } from "effect";
import type { Context, Env } from "hono";
import { routeWebSocketToDurableObject } from "./hono-durable-object-helpers";
import { extractHonoRequest, sendHonoResponse } from "./hono-http-handler";

/**
 * Durable Object WebSocket handler type.
 * Returns a Promise<Response> for WebSocket upgrade requests.
 */
export type HonoDurableObjectWebSocketHandler<TEnv extends Env = Env> = (
  c: Context<TEnv>,
) => Promise<Response>;

/**
 * Durable Object-specific configuration for Cloudflare Workers.
 *
 * When using Durable Objects for WebSocket management, the WebSocket lifecycle
 * is handled entirely within the Durable Object instance, not by the adapter.
 *
 * @template TEnv - Hono environment type
 */
export interface HonoDurableObjectAdapterOptions<TEnv extends Env = Env> {
  /**
   * Optional authentication middleware function.
   * Called for each HTTP request to authenticate the user.
   *
   * Note: For WebSocket connections, auth is typically handled in the
   * Durable Object's fetch() handler when accepting the WebSocket upgrade.
   *
   * @param c - Hono context
   * @returns Promise resolving to AuthResult (AuthContext or null)
   */
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>;

  /**
   * Durable Object namespace for WebSocket connections.
   * Required for the adapter to route WebSocket requests to DO instances.
   *
   * @example
   * ```typescript
   * durableObjectNamespace: (c) => c.env.UPLOADISTA_DO
   * ```
   */
  durableObjectNamespace?: (c: Context<TEnv>) => DurableObjectNamespace;
}

/**
 * Creates a Hono server adapter specifically for Cloudflare Durable Objects.
 *
 * This adapter is designed for Cloudflare Workers environments where:
 * - WebSocket connections are managed by Durable Objects
 * - Each upload/flow gets its own Durable Object instance
 * - WebSockets use hibernation API for efficient resource usage
 * - No external broadcaster is needed (DO is the single source of truth)
 *
 * **Key Differences from Standard Adapter:**
 * - No `webSocketHandler` - WebSockets are handled in DO's fetch() method
 * - No broadcaster dependency - DO manages its own WebSocket state
 * - HTTP requests go through normal adapter flow
 * - WebSocket upgrade requests should be routed directly to DO instances
 *
 * **Usage Pattern:**
 *
 * 1. Use this adapter for HTTP endpoints (upload creation, status checks, etc.)
 * 2. Route WebSocket upgrade requests directly to your Durable Object class
 * 3. In your DO class, use `state.acceptWebSocket()` and hibernation API
 *
 * @template TEnv - Hono environment type
 * @param options - Adapter configuration options
 * @returns ServerAdapter implementation for Hono with Durable Objects
 *
 * @example
 * ```typescript
 * import { honoDurableObjectAdapter } from "@uploadista/adapters-hono";
 * import { createUploadistaServer } from "@uploadista/server";
 * import { durableObjectEventEmitter } from "@uploadista/event-emitter-durable-object";
 *
 * // Create adapter for HTTP endpoints
 * const adapter = honoDurableObjectAdapter({
 *   authMiddleware: async (c) => {
 *     const userId = c.req.header("x-user-id");
 *     return userId ? { clientId: userId } : null;
 *   }
 * });
 *
 * // Create server with DO-specific event emitter
 * const server = await createUploadistaServer({
 *   flows: getFlows,
 *   dataStore: { type: "r2", config: { bucket: "uploads" } },
 *   kvStore: durableObjectKvStore,
 *   eventEmitter: durableObjectEventEmitter(env.UPLOAD_DO),
 *   adapter
 * });
 *
 * // HTTP routes use the adapter
 * app.all("/uploadista/api/*", server.handler);
 *
 * // WebSocket routes go directly to Durable Object
 * app.get("/uploadista/ws/:uploadId", async (c) => {
 *   const uploadId = c.req.param("uploadId");
 *   const id = env.UPLOAD_DO.idFromName(uploadId);
 *   const stub = env.UPLOAD_DO.get(id);
 *   return stub.fetch(c.req.raw);
 * });
 * ```
 *
 * @example
 * ```typescript
 * // In your Durable Object class
 * import { DurableObject } from "cloudflare:workers";
 *
 * export class UploadDurableObject extends DurableObject {
 *   async fetch(request: Request): Promise<Response> {
 *     // Check for WebSocket upgrade
 *     const upgradeHeader = request.headers.get("Upgrade");
 *     if (upgradeHeader === "websocket") {
 *       const { 0: client, 1: server } = new WebSocketPair();
 *
 *       // Accept WebSocket with hibernation
 *       this.ctx.acceptWebSocket(server);
 *
 *       return new Response(null, {
 *         status: 101,
 *         webSocket: client,
 *       });
 *     }
 *
 *     // Handle regular HTTP requests if needed
 *     return new Response("Not found", { status: 404 });
 *   }
 *
 *   async webSocketMessage(ws: WebSocket, message: string) {
 *     // Handle incoming WebSocket messages
 *     // This is called automatically when messages arrive (hibernation API)
 *   }
 *
 *   async webSocketClose(ws: WebSocket, code: number, reason: string) {
 *     // Handle WebSocket close
 *   }
 * }
 * ```
 */
export const honoDurableObjectAdapter = <TEnv extends Env = Env>(
  options: HonoDurableObjectAdapterOptions<TEnv> = {},
): ServerAdapter<
  Context<TEnv>,
  Response,
  HonoDurableObjectWebSocketHandler<TEnv>
> => {
  const { authMiddleware, durableObjectNamespace } = options;

  return {
    /**
     * Extract standard request details from Hono Context.
     *
     * Same as standard adapter - converts Hono Context to StandardRequest.
     */
    extractRequest: extractHonoRequest,

    /**
     * Send standard response using Hono Context.
     *
     * Same as standard adapter - converts StandardResponse to Web API Response.
     */
    sendResponse: sendHonoResponse,

    /**
     * WebSocket handler for Durable Objects.
     *
     * Routes WebSocket upgrade requests to Durable Object instances.
     * Extracts the entity ID from the request path and routes to the corresponding DO.
     *
     * If durableObjectNamespace is not provided, this will throw an error.
     */
    webSocketHandler: () =>
      Effect.sync(() => {
        if (!durableObjectNamespace) {
          throw new Error(
            "durableObjectNamespace is required for Durable Object WebSocket handling. " +
              "Provide it in adapter options: honoDurableObjectAdapter({ durableObjectNamespace: (c) => c.env.UPLOADISTA_DO })",
          );
        }

        // Return a handler function that routes to Durable Objects
        return async (c: Context<TEnv>): Promise<Response> => {
          const namespace = durableObjectNamespace(c);

          // Extract entity ID from path
          // Supports both /uploadista/ws/upload/:uploadId and /uploadista/ws/flow/:jobId
          const uploadId = c.req.param("uploadId");
          const jobId = c.req.param("jobId");
          const entityId = uploadId || jobId;

          if (!entityId) {
            return new Response("Missing entity ID (uploadId or jobId)", {
              status: 400,
            });
          }

          return routeWebSocketToDurableObject(c, namespace, {
            idParam: uploadId ? "uploadId" : "jobId",
          });
        };
      }),

    /**
     * Run framework-specific auth middleware for HTTP requests.
     *
     * Note: WebSocket authentication should be handled in your Durable Object's
     * fetch() method when accepting the WebSocket upgrade request.
     */
    runAuthMiddleware: authMiddleware
      ? (c: Context<TEnv>) =>
          Effect.tryPromise(() => authMiddleware(c)).pipe(
            Effect.catchAll((error) => {
              console.error("Hono auth middleware failed:", error);
              return Effect.succeed(null);
            }),
          )
      : undefined,

    /**
     * Extract waitUntil callback from Hono's execution context.
     *
     * This allows flows to execute beyond the HTTP response lifecycle in Cloudflare Workers.
     * The executionCtx.waitUntil() method tells Cloudflare to keep the execution alive
     * even after the response is sent.
     */
    extractWaitUntil: (c: Context<TEnv>) => {
      // Check if executionCtx is available (Cloudflare Workers environment)
      if (c.executionCtx && typeof c.executionCtx.waitUntil === "function") {
        return c.executionCtx.waitUntil.bind(c.executionCtx);
      }
      return undefined;
    },
  };
};
