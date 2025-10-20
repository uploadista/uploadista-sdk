import type { IncomingMessage } from "node:http";
import { UploadistaError } from "@uploadista/core/errors";
import type { FlowServerShape } from "@uploadista/core/flow";
import type { UploadServerShape } from "@uploadista/core/upload";
import { Effect } from "effect";
import type {
  WebSocketConnection,
  WebSocketHandlers,
} from "./uploadista-adapter-layer";

export const createUploadistaWebSocketHandler = (
  baseUrl: string,
  uploadServer: UploadServerShape,
  flowServer: FlowServerShape,
) => {
  return (
    req: IncomingMessage,
    connection: WebSocketConnection,
  ): WebSocketHandlers => {
    // Check for ws/uploadista prefix
    const url = req.url || "";

    if (!url.includes(`${baseUrl}/ws/`)) {
      connection.send(
        JSON.stringify({
          type: "error",
          message: `WebSocket path must start with ${baseUrl}/ws/`,
        }),
      );
      connection.close(1000, "Invalid path");
      // Return no-op handlers since connection is closed
      return {
        onMessage: () => {},
        onClose: () => {},
        onError: () => {},
      };
    }

    // Remove the prefix and get the actual route segments
    const routeSegments = url
      .replace(`${baseUrl}/ws/`, "")
      .split("/")
      .filter(Boolean);

    const isUploadRoute = routeSegments.includes("upload");
    const isFlowRoute = routeSegments.includes("flow");

    // Extract jobId and uploadId from URL path or query parameters
    // Path format: /uploadista/ws/flow/{jobId} or /uploadista/ws/upload/{uploadId}
    let jobId = extractQueryParam(url, "jobId");
    let uploadId = extractQueryParam(url, "uploadId");

    // If not in query params, extract from path segments
    if (!jobId && !uploadId && routeSegments.length >= 2) {
      const routeType = routeSegments[0]; // 'flow' or 'upload'
      const id = routeSegments[1]; // the actual ID

      if (routeType === "flow") {
        jobId = id;
      } else if (routeType === "upload") {
        uploadId = id;
      }
    }

    // Use jobId if available, otherwise use uploadId
    const eventId = jobId || uploadId;

    console.log("Uploadista websocket handler", { jobId, uploadId, eventId });

    const subscribeEffect = Effect.gen(function* () {
      // Subscribe to flow events if we had a jobId
      if (isFlowRoute && jobId) {
        // Subscribe to flow events (this handles job tracking)
        yield* flowServer.subscribeToFlowEvents(jobId, connection);
      }

      // If we have an uploadId, also subscribe to upload events
      // These will be treated as task events within the job
      if (isUploadRoute && uploadId) {
        yield* uploadServer.subscribeToUploadEvents(uploadId, connection);
      }

      connection.send(
        JSON.stringify({
          type: "connection",
          message: "Uploadista WebSocket connected",
          id: eventId,
          jobId,
          uploadId,
          timestamp: new Date().toISOString(),
        }),
      );
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error("Error subscribing to events:", error);
          const errorMessage =
            error instanceof UploadistaError
              ? error.body
              : "Failed to subscribe to events";
          connection.send(
            JSON.stringify({
              type: "error",
              message: errorMessage,
              code:
                error instanceof UploadistaError
                  ? error.code
                  : "SUBSCRIPTION_ERROR",
            }),
          );
        }),
      ),
    );

    Effect.runFork(subscribeEffect);

    // Return handlers for WebSocket events
    return {
      onMessage: createWebSocketMessageHandler(
        uploadServer,
        flowServer,
        uploadId,
        jobId,
        connection,
      ),
      onClose: createWebSocketCloseHandler(
        uploadServer,
        flowServer,
        uploadId,
        jobId,
      ),
      onError: createWebSocketErrorHandler(eventId),
    };
  };
};

export const createWebSocketMessageHandler = (
  _uploadServer: UploadServerShape,
  _flowServer: FlowServerShape,
  _uploadId: string | undefined,
  _jobId: string | undefined,
  connection: WebSocketConnection,
) => {
  return (message: string): void => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === "ping") {
        connection.send(
          JSON.stringify({
            type: "pong",
            timestamp: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      console.error("Error handling WebSocket message:", error);
      connection.send(
        JSON.stringify({
          type: "error",
          message: "Invalid message format",
        }),
      );
    }
  };
};

export const createWebSocketCloseHandler = (
  uploadServer: UploadServerShape,
  flowServer: FlowServerShape,
  uploadId: string | undefined,
  jobId: string | undefined,
) => {
  return (): void => {
    const unsubscribeEffect = Effect.gen(function* () {
      // Unsubscribe from flow events if we had a jobId
      if (jobId) {
        yield* flowServer.unsubscribeFromFlowEvents(jobId);
      }

      // Unsubscribe from upload events if we had an uploadId
      if (uploadId) {
        yield* uploadServer.unsubscribeFromUploadEvents(uploadId);
      }
    }).pipe(
      Effect.catchAll((error) =>
        Effect.sync(() => {
          console.error(
            "Error unsubscribing from events:",
            error instanceof UploadistaError ? error.body : error,
          );
        }),
      ),
    );

    Effect.runFork(unsubscribeEffect);
  };
};

export const createWebSocketErrorHandler = (eventId: string | undefined) => {
  return (error: Error): void => {
    console.error(`WebSocket error for event ${eventId}:`, error);
  };
};

function extractQueryParam(url: string, param: string): string | undefined {
  const regex = new RegExp(`[?&]${param}=([^&]*)`);
  const match = url.match(regex);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}
