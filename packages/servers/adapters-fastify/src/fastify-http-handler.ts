import type { UploadistaRequest, UploadistaResponse } from "@uploadista/server";
import { Effect } from "effect";
import type { FastifyContext } from "./fastify-adapter";

export const extractFastifyRequest = (
  ctx: FastifyContext,
  { baseUrl }: { baseUrl: string },
) => {
  // Run the routing logic as an Effect program
  return Effect.promise(async () => {
    // Get request details
    const { request } = ctx;
    const url = new URL(
      request.url,
      `${request.protocol}://${request.hostname}`,
    );

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
      switch (request.method) {
        case "POST": {
          // Fastify automatically parses JSON body
          const data = request.body;
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
              request.raw.on("data", (chunk: Buffer) => {
                controller.enqueue(chunk);
              });
              request.raw.on("end", () => {
                controller.close();
              });
              request.raw.on("error", (error: Error) => {
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
      switch (request.method) {
        case "GET":
          return {
            type: "get-flow",
            flowId: routeSegments[1],
          } as UploadistaRequest;
        case "POST": {
          // Fastify automatically parses JSON body
          const params = request.body as Record<string, unknown>;
          if (!params.inputs) {
            return {
              type: "bad-request",
              message: "Inputs are required",
            } as UploadistaRequest;
          }
          return {
            type: "run-flow",
            flowId: routeSegments[1],
            storageId: routeSegments[2],
            inputs: params.inputs as Record<string, unknown>,
          } as UploadistaRequest;
        }
        default:
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
      }
    } else if (routeSegments[0] === "dlq" || routeSegments.includes("dlq")) {
      // DLQ Admin routes: /api/dlq, /api/dlq/:itemId, /api/dlq/:itemId/retry, etc.
      switch (request.method) {
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
            const body = (request.body || {}) as Record<string, unknown>;
            return {
              type: "dlq-cleanup",
              options: body,
            } as UploadistaRequest;
          }
          if (routeSegments[1] === "retry-all") {
            // POST /api/dlq/retry-all - Retry all matching items
            const body = (request.body || {}) as Record<string, unknown>;
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
      if (request.method === "GET" && url.pathname.endsWith("/status")) {
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
        request.method === "PATCH" &&
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

        const contentType = request.headers["content-type"];
        let newData: unknown;

        // Handle different content types
        if (contentType?.includes("application/octet-stream")) {
          // For streaming data, convert Node.js stream to web ReadableStream
          newData = new ReadableStream({
            start(controller) {
              request.raw.on("data", (chunk: Buffer) => {
                controller.enqueue(chunk);
              });
              request.raw.on("end", () => {
                controller.close();
              });
              request.raw.on("error", (error: Error) => {
                controller.error(error);
              });
            },
          });
        } else if (contentType?.includes("application/json")) {
          // For JSON data, use parsed body
          const body = request.body as Record<string, unknown>;

          if (body.newData === undefined) {
            return {
              type: "bad-request",
              message: "Missing newData",
            } as UploadistaRequest;
          }

          newData = body.newData;
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
      } else if (request.method === "POST" && url.pathname.endsWith("/pause")) {
        return {
          type: "pause-flow",
          jobId: routeSegments[1],
        } as UploadistaRequest;
      } else if (
        request.method === "POST" &&
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

export const sendFastifyResponse = (
  response: UploadistaResponse,
  ctx: FastifyContext,
) =>
  Effect.sync(() => {
    // Fastify expects handlers to use the reply object
    const { reply } = ctx;

    // Set default Content-Type header if not provided
    const headers = response.headers || {};
    if (!headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Set headers
    for (const [key, value] of Object.entries(headers)) {
      reply.header(key, value);
    }

    // Send response
    return reply.status(response.status).send(response.body);
  });
