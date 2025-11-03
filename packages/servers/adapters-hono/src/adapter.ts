import { FlowServer, FlowServerShape, UploadServer, UploadServerShape } from "@uploadista/core";
import type {
  AuthResult,
  ServerAdapter,
  UploadistaRequest,
  UploadistaResponse,
} from "@uploadista/server";
import { Effect } from "effect";
import type { Context, Env } from "hono";
import type { WSEvents } from "hono/ws";
import { createUploadistaWebSocketHandler, type DurableObjectWebSocketHandlerOptions } from "./uploadista-websocket-handler";

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
): ServerAdapter<Context<TEnv>, Response, WSEvents> => {
  const { authMiddleware, durableObjectWebSocket } = options;

    return {
    /**
     * Extract standard request details from Hono Context.
     *
     * Converts Hono's Context into a framework-agnostic StandardRequest
     * by extracting the underlying Web API Request and its properties.
     */
    extractRequest: (c: Context<TEnv>, { baseUrl }: { baseUrl: string }) => {
      // Run the routing logic as an Effect program
      return Effect.promise(async () => {
        // Get request details
        const req = c.req.raw;
        const url = new URL(req.url);


        // Check for baseUrl/api/ prefix
        const expectedPrefix = `/${baseUrl}/api/`;
        if (!url.pathname.includes(expectedPrefix)) {
          return {
            type: "not-found",
          } as UploadistaRequest;
        }

        // Remove the prefix and get the actual route segments
        const routeSegments = url.pathname
        .replace(`${baseUrl}/api/`, "")
        .split("/")
        .filter(Boolean);



        // Route based on first segment
        if (routeSegments[0] === "upload" || routeSegments.includes("upload")) {
          switch (req.method) {
            case "POST": {
              const data = await req.json();
              return {
                type: "create-upload",
                data,
              } as UploadistaRequest;
            }
            case "GET": {
              const lastSegment = routeSegments[routeSegments.length - 1];

              if (lastSegment === "capabilities") {
                const storageId =
                  url.searchParams.get("storageId") ||
                  routeSegments[routeSegments.length - 2];

                if (!storageId) {
                  return {
                    type: "bad-request",
                    message: "Storage ID is required",
                  } as UploadistaRequest;
                }
                return {
                  type: "get-capabilities",
                  storageId,
                } as UploadistaRequest;
              }
              if (routeSegments.length < 2) {
                return {
                  type: "bad-request",
                  message: "Upload ID is required",
                } as UploadistaRequest;
              }
              return {
                type: "get-upload",
                uploadId: routeSegments[1],
              } as UploadistaRequest;
            }
            case "PATCH": {
              if (!req.body) {
                return {
                  type: "bad-request",
                  message: "Request body is required",
                } as UploadistaRequest;
              }
              if (routeSegments.length < 2) {
                return {
                  type: "bad-request",
                  message: "Upload ID is required",
                } as UploadistaRequest;
              }
              return {
                type: "upload-chunk",
                uploadId: routeSegments[1],
                data: await req.body,
              } as UploadistaRequest;
            }
            default:
              return {
                type: "method-not-allowed",
              } as UploadistaRequest;
          }
        } else if (
          routeSegments[0] === "flow" ||
          routeSegments.includes("flow")
        ) {
          switch (req.method) {
            case "GET":
              return {
                type: "get-flow",
                flowId: routeSegments[1],
              } as UploadistaRequest;
            case "POST":
              return {
                type: "run-flow",
                flowId: routeSegments[1],
                storageId: routeSegments[2],
                inputs: await req.json(),
              } as UploadistaRequest;
            default:
              return {
                type: "method-not-allowed",
              } as UploadistaRequest;
          }
        } else if (
          routeSegments[0] === "jobs" ||
          routeSegments.includes("jobs")
        ) {
          if (req.method === "GET" && url.pathname.endsWith("/status")) {
            const jobId = routeSegments[1];
            if (!jobId) {
              return {
                type: "bad-request",
                message: "Job ID is required",
              } as UploadistaRequest;
            }
            return {
              type: "job-status",
              jobId,
            } as UploadistaRequest;
          } else if (
            req.method === "PATCH" &&
            routeSegments.includes("resume")
          ) {
            const jobId = routeSegments[1];
            if (!jobId) {
              return {
                type: "bad-request",
                message: "Job ID is required",
              } as UploadistaRequest;
            }
            const nodeId = routeSegments[2];
            if (!nodeId) {
              return {
                type: "bad-request",
                message: "Node ID is required",
              } as UploadistaRequest;
            }
            const newData = await req.json();
            if (!newData) {
              return {
                type: "bad-request",
                message: "New data is required",
              } as UploadistaRequest;
            }
            return {
              type: "resume-flow",
              jobId,
              nodeId,
              newData,
            } as UploadistaRequest;
          } else if (req.method === "POST" && url.pathname.endsWith("/pause")) {
            return {
              type: "pause-flow",
              jobId: routeSegments[1],
            } as UploadistaRequest;
          } else if (
            req.method === "POST" &&
            url.pathname.endsWith("/cancel")
          ) {
            return {
              type: "cancel-flow",
              jobId: routeSegments[1],
            } as UploadistaRequest;
          }
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
        } else {
          return {
            type: "not-found",
          } as UploadistaRequest;
        }
      });
    },

    /**
     * Send standard response using Hono Context.
     *
     * Converts a StandardResponse into a Web API Response that Hono expects.
     * The response is returned from the handler, not sent via the context.
     */
    sendResponse: (response: UploadistaResponse) =>
      Effect.sync(() => {
        // Hono expects handlers to return Response objects
        // The context is passed but we don't use it for sending
        // Instead, we construct a Web API Response
        const headers = new Headers(response.headers);
        if (!headers.has("Content-Type")) {
          headers.set("Content-Type", "application/json");
        }

        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers,
        });
      }),

    webSocketHandler: (
      {
        baseUrl,
      }: {
        baseUrl: string;
      },
    ) => Effect.gen(function* () {
      const uploadServer = yield* UploadServer;
      const flowServer = yield* FlowServer;
      const webSocketHandler = createUploadistaWebSocketHandler(baseUrl, uploadServer, flowServer, authMiddleware);
      return webSocketHandler;
    }),

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
