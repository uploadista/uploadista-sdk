import type { AuthResult, ServerAdapter } from "@uploadista/server";
import { Effect } from "effect";
import type { Request, Response } from "express";
import {
  extractExpressRequest,
  sendExpressResponse,
} from "./express-http-handler";
import {
  type ExpressWebSocketHandler,
  expressWebSocketHandler,
} from "./express-websocket-handler";

export type ExpressContext = {
  request: Request;
  response: Response;
  next?: (error?: Error) => void;
};

/**
 * Options for creating an Express server adapter.
 */
export interface ExpressAdapterOptions {
  /**
   * Optional authentication middleware function.
   * Called for each request to authenticate the user.
   *
   * @param ctx - Express context
   * @returns Promise resolving to AuthResult (AuthContext or null)
   */
  authMiddleware?: (ctx: ExpressContext) => Promise<AuthResult>;
}

// WebSocket interface from ws package
export interface WebSocket {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  off: (event: string, listener: (...args: unknown[]) => void) => void;
}

/**
 * Creates an Express server adapter that implements the ServerAdapter interface.
 *
 * This adapter translates between Express's Request/Response API and the core server's
 * standard request/response model. It supports:
 * - Request extraction from Express Request
 * - Response sending via Express Response
 * - Optional authentication middleware
 * - WebSocket handling
 *
 * @param options - Adapter configuration options
 * @returns ServerAdapter implementation for Express
 *
 * @example
 * ```typescript
 * import { expressAdapter } from "@uploadista/adapters-express";
 * import { createUploadistaServer } from "@uploadista/server";
 *
 * const adapter = expressAdapter({
 *   authMiddleware: async (req, res) => {
 *     const userId = req.header("x-user-id");
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
export const expressAdapter = (
  options: ExpressAdapterOptions = {},
): ServerAdapter<ExpressContext, Response, ExpressWebSocketHandler> => {
  const { authMiddleware } = options;

  return {
    /**
     * Extract standard request details from Express Request.
     *
     * Converts Express's Request into a framework-agnostic UploadistaRequest
     * by parsing the URL, headers, and body.
     */
    extractRequest: extractExpressRequest,

    /**
     * Send standard response using Express Response format.
     *
     * Converts a UploadistaResponse into an object with status, headers, and body
     * that the Express handler can send.
     */
    sendResponse: sendExpressResponse,

    /**
     * WebSocket handler for Express with ws package.
     */
    webSocketHandler: ({ baseUrl }: { baseUrl: string }) =>
      expressWebSocketHandler(baseUrl, authMiddleware),

    /**
     * Run framework-specific auth middleware.
     *
     * If provided, executes the Express-specific authentication middleware
     * with access to the full Express Request and Response objects.
     */
    runAuthMiddleware: authMiddleware
      ? (ctx: ExpressContext) =>
          Effect.tryPromise(() => authMiddleware(ctx)).pipe(
            Effect.catchAll((error) => {
              console.error("Express auth middleware failed:", error);
              // Return null to indicate auth failure (not an error in the Effect sense)
              return Effect.succeed(null);
            }),
          )
      : undefined,
  };
};
