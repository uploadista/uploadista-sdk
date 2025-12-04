import type { UploadistaRequest, UploadistaResponse } from "@uploadista/server";
import { Effect } from "effect";
import type { ExpressContext } from "./express-adapter";

/**
 * Helper to parse JSON body if not already parsed
 */
const parseJsonBody = async (
  req: ExpressContext["request"],
): Promise<unknown> => {
  // If body is already parsed, return it
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  // Manually parse JSON body
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const body = Buffer.concat(chunks).toString();
  return JSON.parse(body);
};

export const extractExpressRequest = (
  ctx: ExpressContext,
  { baseUrl }: { baseUrl: string },
) => {
  // Run the routing logic as an Effect program
  return Effect.promise(async () => {
    // Get request details
    const url = new URL(ctx.request.url, `http://${ctx.request.get("host")}`);
    const acceptHeader = ctx.request.get("Accept");

    // Check for health check endpoints first (at /{baseUrl}/health, not under /api/)
    const healthPrefix = `/${baseUrl}/`;
    if (url.pathname.startsWith(healthPrefix) && ctx.request.method === "GET") {
      const healthPath = url.pathname.slice(healthPrefix.length);

      // /health or /healthz - Liveness probe
      if (healthPath === "health" || healthPath === "healthz") {
        return {
          type: "health",
          acceptHeader,
        } as UploadistaRequest;
      }

      // /ready or /readyz - Readiness probe
      if (healthPath === "ready" || healthPath === "readyz") {
        return {
          type: "health-ready",
          acceptHeader,
        } as UploadistaRequest;
      }

      // /health/components - Detailed component status
      if (healthPath === "health/components") {
        return {
          type: "health-components",
          acceptHeader,
        } as UploadistaRequest;
      }
    }

    // Check for baseUrl/api/ prefix for other routes
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
      switch (ctx.request.method) {
        case "POST": {
          // Parse JSON body if not already parsed
          const data = await parseJsonBody(ctx.request);
          return {
            type: "create-upload",
            data,
          } as UploadistaRequest;
        }
        case "GET": {
          const lastSegment = routeSegments[routeSegments.length - 1];

          if (lastSegment === "capabilities") {
            const storageId = url.searchParams.get("storageId");
            const storageIdFromPath = routeSegments[routeSegments.length - 2];

            // Only use path segment if it's not "upload"
            const finalStorageId =
              storageId || (storageIdFromPath !== "upload" ? storageIdFromPath : null);

            if (!finalStorageId) {
              return {
                type: "bad-request",
                message: "Storage ID is required",
              } as UploadistaRequest;
            }
            return {
              type: "get-capabilities",
              storageId: finalStorageId,
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
          if (routeSegments.length < 2) {
            return {
              type: "bad-request",
              message: "Upload ID is required",
            } as UploadistaRequest;
          }
          // Convert Node.js Readable stream to web ReadableStream
          const body = new ReadableStream({
            start(controller) {
              ctx.request.on("data", (chunk: Buffer) => {
                controller.enqueue(chunk);
              });
              ctx.request.on("end", () => {
                controller.close();
              });
              ctx.request.on("error", (error: Error) => {
                controller.error(error);
              });
            },
          });

          return {
            type: "upload-chunk",
            uploadId: routeSegments[1],
            data: body,
          } as UploadistaRequest;
        }
        default:
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
      }
    } else if (routeSegments[0] === "flow" || routeSegments.includes("flow")) {
      switch (ctx.request.method) {
        case "GET":
          return {
            type: "get-flow",
            flowId: routeSegments[1],
          } as UploadistaRequest;
        case "POST": {
          // Parse JSON body if not already parsed
          const params = await parseJsonBody(ctx.request);
          if (!params || typeof params !== "object" || !("inputs" in params)) {
            return {
              type: "bad-request",
              message: "Inputs are required",
            } as UploadistaRequest;
          }
          return {
            type: "run-flow",
            flowId: routeSegments[1],
            storageId: routeSegments[2],
            inputs: (params as { inputs: unknown }).inputs,
          } as UploadistaRequest;
        }
        default:
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
      }
    } else if (routeSegments[0] === "dlq" || routeSegments.includes("dlq")) {
      // DLQ Admin routes: /api/dlq, /api/dlq/:itemId, /api/dlq/:itemId/retry, etc.
      switch (ctx.request.method) {
        case "GET": {
          if (routeSegments.length === 1) {
            // GET /api/dlq - List DLQ items
            const status = url.searchParams.get("status") as string | undefined;
            const flowId = url.searchParams.get("flowId") as string | undefined;
            const clientId = url.searchParams.get("clientId") as
              | string
              | undefined;
            const limit = url.searchParams.get("limit")
              ? Number.parseInt(url.searchParams.get("limit") as string)
              : undefined;
            const offset = url.searchParams.get("offset")
              ? Number.parseInt(url.searchParams.get("offset") as string)
              : undefined;
            return {
              type: "dlq-list",
              options: { status, flowId, clientId, limit, offset },
            } as UploadistaRequest;
          }
          if (routeSegments[1] === "stats") {
            // GET /api/dlq/stats - Get DLQ statistics
            return {
              type: "dlq-stats",
            } as UploadistaRequest;
          }
          // GET /api/dlq/:itemId - Get specific DLQ item
          return {
            type: "dlq-get",
            itemId: routeSegments[1],
          } as UploadistaRequest;
        }
        case "POST": {
          if (routeSegments[1] === "cleanup") {
            // POST /api/dlq/cleanup - Cleanup old items
            const body = await parseJsonBody(ctx.request).catch(() => ({}));
            return {
              type: "dlq-cleanup",
              options: body,
            } as UploadistaRequest;
          }
          if (routeSegments[1] === "retry-all") {
            // POST /api/dlq/retry-all - Retry all matching items
            const body = await parseJsonBody(ctx.request).catch(() => ({}));
            return {
              type: "dlq-retry-all",
              options: body,
            } as UploadistaRequest;
          }
          if (routeSegments[2] === "retry") {
            // POST /api/dlq/:itemId/retry - Retry specific item
            return {
              type: "dlq-retry",
              itemId: routeSegments[1],
            } as UploadistaRequest;
          }
          if (routeSegments[2] === "resolve") {
            // POST /api/dlq/:itemId/resolve - Manually resolve item
            return {
              type: "dlq-resolve",
              itemId: routeSegments[1],
            } as UploadistaRequest;
          }
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
        }
        case "DELETE": {
          // DELETE /api/dlq/:itemId - Delete a DLQ item
          if (routeSegments.length < 2) {
            return {
              type: "bad-request",
              message: "Item ID is required",
            } as UploadistaRequest;
          }
          return {
            type: "dlq-delete",
            itemId: routeSegments[1],
          } as UploadistaRequest;
        }
        default:
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
      }
    } else if (routeSegments[0] === "jobs" || routeSegments.includes("jobs")) {
      if (ctx.request.method === "GET" && url.pathname.endsWith("/status")) {
        // Need at least 3 segments: jobs, jobId, status
        if (routeSegments.length < 3) {
          return {
            type: "bad-request",
            message: "Job ID is required",
          } as UploadistaRequest;
        }
        const jobId = routeSegments[1];
        return {
          type: "job-status",
          jobId,
        } as UploadistaRequest;
      } else if (
        ctx.request.method === "PATCH" &&
        routeSegments.includes("resume")
      ) {
        const jobId = routeSegments[1];
        if (!jobId) {
          return {
            type: "bad-request",
            message: "Job ID is required",
          } as UploadistaRequest;
        }
        const nodeId = routeSegments[3];
        if (!nodeId) {
          return {
            type: "bad-request",
            message: "Node ID is required",
          } as UploadistaRequest;
        }

        const contentType = ctx.request.get("content-type");
        let newData: unknown;

        // Handle different content types
        if (contentType?.includes("application/octet-stream")) {
          // For streaming data, pass the req object (Express handles streams)
          // Express doesn't expose ReadableStream like Hono, use req itself
          newData = ctx.request;
        } else if (contentType?.includes("application/json")) {
          // Parse JSON body if not already parsed
          const body = await parseJsonBody(ctx.request);

          if (!body || typeof body !== "object" || !("newData" in body)) {
            return {
              type: "bad-request",
              message: "Missing newData",
            } as UploadistaRequest;
          }

          newData = (body as { newData: unknown }).newData;
        } else {
          return {
            type: "unsupported-content-type",
          } as UploadistaRequest;
        }

        return {
          type: "resume-flow",
          jobId,
          nodeId,
          newData,
        } as UploadistaRequest;
      } else if (
        ctx.request.method === "POST" &&
        url.pathname.endsWith("/pause")
      ) {
        return {
          type: "pause-flow",
          jobId: routeSegments[1],
        } as UploadistaRequest;
      } else if (
        ctx.request.method === "POST" &&
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
};

export const sendExpressResponse = (
  response: UploadistaResponse,
  ctx: ExpressContext,
) =>
  Effect.sync(() => {
    // Set default Content-Type header if not provided
    const headers = response.headers || {};
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Set headers
    for (const [key, value] of Object.entries(headers)) {
      ctx.response.set(key, value);
    }

    return ctx.response.status(response.status).send(response.body);
  });
