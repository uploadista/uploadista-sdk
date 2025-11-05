import type {
  Request as CloudflareRequest,
  DurableObjectNamespace,
} from "@cloudflare/workers-types";
import type { Context } from "hono";

/**
 * Helper function to route WebSocket upgrade requests to Durable Objects.
 *
 * This function extracts the entity ID from the request (uploadId or jobId),
 * creates or retrieves the corresponding Durable Object instance, and forwards
 * the WebSocket upgrade request to it.
 *
 * @param c - Hono context
 * @param durableObjectNamespace - The Durable Object namespace binding
 * @param options - Configuration options
 * @returns Response from the Durable Object (WebSocket upgrade or error)
 *
 * @example
 * ```typescript
 * import { Hono } from "hono";
 * import { routeWebSocketToDurableObject } from "@uploadista/adapters-hono";
 *
 * const app = new Hono<{ Bindings: { UPLOAD_DO: DurableObjectNamespace } }>();
 *
 * // Route upload WebSocket connections to Durable Objects
 * app.get("/uploadista/ws/upload/:uploadId", async (c) => {
 *   return routeWebSocketToDurableObject(c, c.env.UPLOAD_DO, {
 *     idParam: "uploadId",
 *   });
 * });
 *
 * // Route flow WebSocket connections to Durable Objects
 * app.get("/uploadista/ws/flow/:jobId", async (c) => {
 *   return routeWebSocketToDurableObject(c, c.env.FLOW_DO, {
 *     idParam: "jobId",
 *   });
 * });
 * ```
 */
export const routeWebSocketToDurableObject = async (
  c: Context,
  durableObjectNamespace: DurableObjectNamespace,
  options: {
    /**
     * Name of the route parameter containing the entity ID.
     * Defaults to "uploadId".
     */
    idParam?: string;
    /**
     * Optional function to validate the entity ID before routing.
     * Return false to reject the connection with a 400 error.
     */
    validateId?: (id: string) => boolean | Promise<boolean>;
    /**
     * Optional error handler for validation failures.
     * If not provided, returns a plain text 400 response.
     */
    onValidationError?: (id: string) => Response;
  } = {},
): Promise<Response> => {
  const { idParam = "uploadId", validateId, onValidationError } = options;

  // Extract the entity ID from route params
  const entityId = c.req.param(idParam);

  if (!entityId) {
    return new Response(`Missing ${idParam} parameter`, { status: 400 });
  }

  // Validate ID if validator is provided
  if (validateId) {
    const isValid = await validateId(entityId);
    if (!isValid) {
      if (onValidationError) {
        return onValidationError(entityId);
      }
      return new Response(`Invalid ${idParam}: ${entityId}`, { status: 400 });
    }
  }

  // Check for WebSocket upgrade header
  const upgradeHeader = c.req.header("Upgrade");
  if (!upgradeHeader || upgradeHeader !== "websocket") {
    return new Response("Expected WebSocket upgrade request", { status: 400 });
  }

  // Get the Durable Object instance for this entity
  const id = durableObjectNamespace.idFromName(entityId);
  const stub = durableObjectNamespace.get(id);

  // Forward the WebSocket upgrade request to the Durable Object
  const request = c.req.raw as unknown as CloudflareRequest;

  try {
    const response = await stub.fetch(request);
    return response as unknown as Response;
  } catch (error) {
    console.error(`Error routing WebSocket to Durable Object:`, error);
    return new Response("Internal Server Error", { status: 500 });
  }
};

/**
 * Creates a reusable Hono route handler for WebSocket to Durable Object routing.
 *
 * This is a convenience wrapper around `routeWebSocketToDurableObject` that
 * returns a route handler function you can use directly in Hono routes.
 *
 * @param durableObjectNamespace - The Durable Object namespace binding
 * @param options - Configuration options (same as routeWebSocketToDurableObject)
 * @returns Hono route handler function
 *
 * @example
 * ```typescript
 * import { Hono } from "hono";
 * import { createDurableObjectWebSocketHandler } from "@uploadista/adapters-hono";
 *
 * const app = new Hono<{ Bindings: { UPLOAD_DO: DurableObjectNamespace } }>();
 *
 * // Create a reusable handler
 * const uploadWebSocketHandler = createDurableObjectWebSocketHandler(
 *   (c) => c.env.UPLOAD_DO,
 *   {
 *     idParam: "uploadId",
 *     validateId: async (id) => {
 *       // Check if upload exists in database
 *       return await db.uploads.exists(id);
 *     },
 *   }
 * );
 *
 * app.get("/uploadista/ws/upload/:uploadId", uploadWebSocketHandler);
 * ```
 */
export const createDurableObjectWebSocketHandler = (
  getDurableObjectNamespace: (c: Context) => DurableObjectNamespace,
  options: Parameters<typeof routeWebSocketToDurableObject>[2] = {},
) => {
  return async (c: Context): Promise<Response> => {
    const namespace = getDurableObjectNamespace(c);
    return routeWebSocketToDurableObject(c, namespace, options);
  };
};

/**
 * Type helper for Cloudflare Workers environment bindings with Durable Objects.
 *
 * @example
 * ```typescript
 * import type { DurableObjectEnv } from "@uploadista/adapters-hono";
 *
 * interface Env extends DurableObjectEnv {
 *   UPLOAD_DO: DurableObjectNamespace;
 *   FLOW_DO: DurableObjectNamespace;
 *   DATABASE_URL: string;
 * }
 *
 * const app = new Hono<{ Bindings: Env }>();
 * ```
 */
export interface DurableObjectEnv {
  [key: string]: unknown;
}
