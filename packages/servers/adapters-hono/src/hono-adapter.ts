import type { AuthResult, ServerAdapter } from "@uploadista/server";
import { Effect } from "effect";
import type { Context, Env } from "hono";
import { extractHonoRequest, sendHonoResponse } from "./hono-http-handler";
import {
  type DurableObjectWebSocketHandlerOptions,
  type HonoWebSocketHandler,
  honoWebSocketHandler,
} from "./hono-websocket-handler";

/**
 * Options for creating a Hono server adapter.
 *
 * @template TEnv - Hono environment type
 */
export interface HonoAdapterOptions<TEnv extends Env = Env> {
  /**
   * Optional authentication middleware function.
   * Called for each request to authenticate the user.
   *
   * @param c - Hono context
   * @returns Promise resolving to AuthResult (AuthContext or null)
   */
  authMiddleware?: (c: Context<TEnv>) => Promise<AuthResult>;

  /**
   * Optional Durable Object WebSocket configuration.
   * Used for Cloudflare Workers with Durable Objects.
   */
  durableObjectWebSocket?: DurableObjectWebSocketHandlerOptions;
}

/**
 * Creates a Hono server adapter that implements the ServerAdapter interface.
 *
 * This adapter translates between Hono's Context-based API and the core server's
 * standard request/response model. It supports:
 * - Request extraction from Hono Context
 * - Response sending via Web API Response
 * - Optional authentication middleware
 * - WebSocket handling
 * - Cloudflare Durable Objects integration
 *
 * @template TEnv - Hono environment type
 * @param options - Adapter configuration options
 * @returns ServerAdapter implementation for Hono
 *
 * @example
 * ```typescript
 * import { honoAdapter } from "@uploadista/adapters-hono";
 * import { createUploadistaServer } from "@uploadista/server";
 *
 * const adapter = honoAdapter({
 *   authMiddleware: async (c) => {
 *     const userId = c.req.header("x-user-id");
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
export const honoAdapter = <TEnv extends Env = Env>(
  options: HonoAdapterOptions<TEnv> = {},
): ServerAdapter<Context<TEnv>, Response, HonoWebSocketHandler<TEnv>> => {
  const { authMiddleware, durableObjectWebSocket } = options;

  return {
    /**
     * Extract standard request details from Hono Context.
     *
     * Converts Hono's Context into a framework-agnostic StandardRequest
     * by extracting the underlying Web API Request and its properties.
     */
    extractRequest: extractHonoRequest,

    /**
     * Send standard response using Hono Context.
     *
     * Converts a StandardResponse into a Web API Response that Hono expects.
     * The response is returned from the handler, not sent via the context.
     */
    sendResponse: sendHonoResponse,

    webSocketHandler: ({ baseUrl }: { baseUrl: string }) =>
      honoWebSocketHandler(baseUrl, authMiddleware),

    /**
     * Run framework-specific auth middleware.
     *
     * If provided, executes the Hono-specific authentication middleware
     * with access to the full Hono Context.
     */
    runAuthMiddleware: authMiddleware
      ? (c: Context<TEnv>) =>
          Effect.tryPromise(() => authMiddleware(c)).pipe(
            Effect.catchAll((error) => {
              console.error("Hono auth middleware failed:", error);
              // Return null to indicate auth failure (not an error in the Effect sense)
              return Effect.succeed(null);
            }),
          )
      : undefined,

    /**
     * Framework-specific extensions for Hono.
     *
     * Includes Durable Object configuration for Cloudflare Workers.
     */
    extensions: durableObjectWebSocket,
  };
};
