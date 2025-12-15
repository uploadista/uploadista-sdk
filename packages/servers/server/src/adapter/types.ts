import type { FlowEngine, UploadEngine } from "@uploadista/core";
import type { Effect } from "effect";
import type { UploadistaRequest, UploadistaResponse } from "../core/routes";
import type { AuthResult } from "../types";

/**
 * Standard request representation extracted from framework-specific request objects.
 *
 * This interface provides a framework-agnostic way to represent HTTP requests,
 * allowing the core server logic to work uniformly across Hono, Express, Fastify,
 * and other frameworks.
 *
 * @example
 * ```typescript
 * const standardRequest: StandardRequest = {
 *   method: "POST",
 *   url: new URL("https://example.com/uploadista/api/upload"),
 *   headers: { "content-type": "application/json" },
 *   body: { file: "data" }
 * };
 * ```
 */
export interface StandardRequest {
  /**
   * HTTP method (GET, POST, PATCH, etc.)
   */
  method: string;

  /**
   * Full URL of the request including protocol, host, path, and query parameters
   */
  url: URL;

  /**
   * Request headers as key-value pairs
   */
  headers: Record<string, string>;

  /**
   * Optional request body (parsed or raw)
   */
  body?: unknown;
}

/**
 * Standard response representation to be sent by framework-specific adapters.
 *
 * The core server produces StandardResponse objects, which adapters then
 * translate into framework-specific response formats.
 *
 * @example
 * ```typescript
 * const standardResponse: StandardResponse = {
 *   status: 200,
 *   headers: { "content-type": "application/json" },
 *   body: { uploadId: "abc123" }
 * };
 * ```
 */
export interface StandardResponse {
  /**
   * HTTP status code (200, 404, 500, etc.)
   */
  status: number;

  /**
   * Optional response headers as key-value pairs
   */
  headers?: Record<string, string>;

  /**
   * Optional response body (will be JSON-stringified if object)
   */
  body?: unknown;
}

/**
 * WebSocket handler interface for framework-agnostic WebSocket management.
 *
 * This interface allows the core server to interact with WebSocket connections
 * without needing to know about framework-specific WebSocket APIs.
 *
 * @example
 * ```typescript
 * const wsHandler: WebSocketHandler = {
 *   onMessage: (message) => console.log("Received:", message),
 *   onClose: () => console.log("Connection closed"),
 *   onError: (error) => console.error("WebSocket error:", error)
 * };
 * ```
 */
export interface WebSocketHandler {
  /**
   * Callback invoked when a message is received from the client
   *
   * @param message - The message string received
   */
  onMessage: (message: string) => void;

  /**
   * Callback invoked when the WebSocket connection is closed
   */
  onClose: () => void;

  /**
   * Callback invoked when a WebSocket error occurs
   *
   * @param error - The error that occurred
   */
  onError: (error: Error) => void;
}

/**
 * ServerAdapter interface that framework adapters must implement.
 *
 * This interface defines the contract between the core server (framework-agnostic)
 * and framework-specific adapters (Hono, Express, Fastify, etc.).
 *
 * Each adapter translates between framework-specific request/response types
 * and the standard types used by the core server.
 *
 * @template TRequest - Framework-specific request type (e.g., Context for Hono, Request for Express)
 * @template TResponse - Framework-specific response type (e.g., Context for Hono, Response for Express)
 * @template TWebSocket - Framework-specific WebSocket type (optional, defaults to unknown)
 *
 * @example
 * ```typescript
 * // Hono adapter example
 * const honoAdapter: ServerAdapter<Context, Context, WSEvents> = {
 *   extractRequest: (c) => Effect.succeed({
 *     method: c.req.raw.method,
 *     url: new URL(c.req.raw.url),
 *     headers: Object.fromEntries(c.req.raw.headers.entries()),
 *     body: c.req.raw.body
 *   }),
 *   sendResponse: (c, response) => Effect.sync(() =>
 *     new Response(JSON.stringify(response.body), {
 *       status: response.status,
 *       headers: response.headers
 *     })
 *   ),
 *   runAuthMiddleware: (c) => Effect.tryPromise(() => authMiddleware(c)),
 *   createWebSocketHandler: (ws) => ({ ... })
 * };
 * ```
 */
export interface ServerAdapter<
  TContext,
  TResponse,
  TWebSocketHandler = unknown,
> {
  /**
   * Extract standard request details from framework-specific request.
   *
   * This method converts the framework's native request object into a
   * UploadistaRequest that the core server can process uniformly.
   *
   * @param req - Framework-specific request object
   * @returns Effect that produces UploadistaRequest on success
   */
  extractRequest(
    req: TContext,
    { baseUrl }: { baseUrl: string },
  ): Effect.Effect<UploadistaRequest, never, never>;

  /**
   * Send standard response using framework-specific response object.
   *
   * This method converts a UploadistaResponse from the core server into
   * the format required by the framework (e.g., Web API Response, Express res.json()).
   *
   * @param response - Standard response to send
   * @returns Effect that completes when response is sent
   */
  sendResponse(
    response: UploadistaResponse,
    context: TContext,
  ): Effect.Effect<TResponse, never, never>;

  /**
   * Optional: Run framework-specific auth middleware.
   *
   * If provided, this method is called before each request is processed.
   * It should execute the framework's authentication middleware and return
   * an AuthResult (AuthContext on success, null on failure).
   *
   * If not provided, the adapter assumes no authentication is required.
   *
   * @param ctx - Framework-specific context object
   * @param res - Framework-specific response object
   * @returns Effect that produces AuthResult (AuthContext or null)
   */
  runAuthMiddleware?(ctx: TContext): Effect.Effect<AuthResult, never, never>;

  /**
   * Optional: Create WebSocket handler for real-time updates.
   *
   * Only needed if the framework supports WebSocket connections for
   * real-time upload progress and flow status updates.
   *
   * @param ws - Framework-specific WebSocket object
   * @param ctx - Framework-specific context object (for initial handshake)
   * @param context - Server context with baseUrl, uploadEngine, and flowServer
   * @returns WebSocketHandler with callbacks for message, close, and error events
   */
  webSocketHandler(context: {
    baseUrl: string;
  }): Effect.Effect<TWebSocketHandler, never, UploadEngine | FlowEngine>;

  /**
   * Optional: Extract waitUntil callback from the framework context.
   *
   * When provided, allows flows to execute beyond the HTTP response lifecycle.
   * This function is called per-request to extract the waitUntil callback from
   * the framework-specific context.
   *
   * @param ctx - Framework-specific context object
   * @returns The waitUntil callback or undefined if not available
   *
   * @example
   * ```typescript
   * // Cloudflare Workers with Hono:
   * extractWaitUntil: (c) => c.executionCtx.waitUntil.bind(c.executionCtx)
   * ```
   */
  extractWaitUntil?: (
    ctx: TContext,
  ) => ((promise: Promise<unknown>) => void) | undefined;
}
