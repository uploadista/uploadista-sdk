import type { AuthResult, ServerAdapter } from "@uploadista/server";
import { Effect } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  extractFastifyRequest,
  sendFastifyResponse,
} from "./fastify-http-handler";
import {
  type FastifyWebSocketHandler,
  fastifyWebSocketHandler,
} from "./fastify-websocket-handler";

export type FastifyContext = {
  request: FastifyRequest;
  reply: FastifyReply;
};

/**
 * Options for creating a Fastify server adapter.
 */
export interface FastifyAdapterOptions {
  /**
   * Optional authentication middleware function.
   * Called for each request to authenticate the user.
   *
   * @param ctx - Fastify context
   * @returns Promise resolving to AuthResult (AuthContext or null)
   */
  authMiddleware?: (ctx: FastifyContext) => Promise<AuthResult>;
}

/**
 * Creates a Fastify server adapter that implements the ServerAdapter interface.
 *
 * This adapter translates between Fastify's Request/Reply API and the core server's
 * standard request/response model. It supports:
 * - Request extraction from Fastify Request
 * - Response sending via Fastify Reply
 * - Optional authentication middleware
 * - WebSocket handling
 *
 * @param options - Adapter configuration options
 * @returns ServerAdapter implementation for Fastify
 *
 * @example
 * ```typescript
 * import { fastifyAdapter } from "@uploadista/adapters-fastify";
 * import { createUploadistaServer } from "@uploadista/server";
 *
 * const adapter = fastifyAdapter({
 *   authMiddleware: async ({ request, reply }) => {
 *     const userId = request.headers["x-user-id"];
 *     return userId ? { clientId: userId } : null;
 *   }
 * });
 *
 * const server = await createUploadistaServer({
 *   flows: getFlows,
 *   dataStore: { type: "s3", config: { bucket: "uploads" } },
 *   kvStore: redisKvStore,
 *   eventEmitter: webSocketEventEmitter(),
 *   adapter
 * });
 * ```
 */
export const fastifyAdapter = (
  options: FastifyAdapterOptions = {},
): ServerAdapter<FastifyContext, FastifyReply, FastifyWebSocketHandler> => {
  const { authMiddleware } = options;

  return {
    /**
     * Extract standard request details from Fastify Request.
     *
     * Converts Fastify's Request into a framework-agnostic UploadistaRequest
     * by parsing the URL, headers, and body.
     */
    extractRequest: extractFastifyRequest,

    /**
     * Send standard response using Fastify Reply.
     *
     * Converts a UploadistaResponse into a Fastify reply using the reply object's
     * status() and send() methods.
     */
    sendResponse: sendFastifyResponse,

    /**
     * WebSocket handler for Fastify with @fastify/websocket.
     */
    webSocketHandler: ({ baseUrl }: { baseUrl: string }) =>
      fastifyWebSocketHandler(baseUrl, authMiddleware),

    /**
     * Run framework-specific auth middleware.
     *
     * If provided, executes the Fastify-specific authentication middleware
     * with access to the full Fastify Request and Reply objects.
     */
    runAuthMiddleware: authMiddleware
      ? (ctx: FastifyContext) =>
          Effect.tryPromise(() => authMiddleware(ctx)).pipe(
            Effect.catchAll((error) => {
              console.error("Fastify auth middleware failed:", error);
              // Return null to indicate auth failure (not an error in the Effect sense)
              return Effect.succeed(null);
            }),
          )
      : undefined,
  };
};
