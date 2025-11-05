import type { UploadistaRequest, UploadistaResponse } from "@uploadista/server";
import { Effect } from "effect";
import type { Context, Env } from "hono";

export const extractHonoRequest = <TEnv extends Env>(
  c: Context<TEnv>,
  { baseUrl }: { baseUrl: string },
) => {
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
    } else if (routeSegments[0] === "flow" || routeSegments.includes("flow")) {
      switch (req.method) {
        case "GET":
          return {
            type: "get-flow",
            flowId: routeSegments[1],
          } as UploadistaRequest;
        case "POST": {
          const params = await req.json();
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
            inputs: params.inputs,
          } as UploadistaRequest;
        }
        default:
          return {
            type: "method-not-allowed",
          } as UploadistaRequest;
      }
    } else if (routeSegments[0] === "jobs" || routeSegments.includes("jobs")) {
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
      } else if (req.method === "PATCH" && routeSegments.includes("resume")) {
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

        const contentType = req.headers.get("Content-Type");
        let newData: unknown;

        // Handle different content types
        if (contentType?.includes("application/octet-stream")) {
          // For streaming data, pass the ReadableStream directly
          if (!req.body) {
            return {
              type: "bad-request",
              message: "Missing body for octet-stream",
            } as UploadistaRequest;
          }
          newData = req.body;
        } else if (contentType?.includes("application/json")) {
          // For JSON data, parse the body
          const body = await req.json();

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
      } else if (req.method === "POST" && url.pathname.endsWith("/pause")) {
        return {
          type: "pause-flow",
          jobId: routeSegments[1],
        } as UploadistaRequest;
      } else if (req.method === "POST" && url.pathname.endsWith("/cancel")) {
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

export const sendHonoResponse = <TEnv extends Env>(
  response: UploadistaResponse,
  _ctx: Context<TEnv>,
) =>
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
  });
