import { UploadistaError } from "@uploadista/core/errors";
import type { FlowServerShape } from "@uploadista/core/flow";
import type { UploadServerShape } from "@uploadista/core/upload";
import { Effect } from "effect";
import type {
  WebSocketConnection,
  WebSocketConnectionRequest,
} from "../websocket-routes";
import {
  handleSubscribeToFlowEvents,
  handleUnsubscribeFromFlowEvents,
} from "./flow-websocket-handlers";
import {
  handleSubscribeToUploadEvents,
  handleUnsubscribeFromUploadEvents,
} from "./upload-websocket-handlers";

export type {
  WebSocketConnection,
  WebSocketConnectionRequest,
} from "../websocket-routes";

/**
 * Handles WebSocket connection opening
 * Subscribes to the appropriate events based on the connection request
 */
export const handleWebSocketOpen = (
  request: WebSocketConnectionRequest,
  uploadServer: UploadServerShape,
  flowServer: FlowServerShape,
) => {
  const { connection, isFlowRoute, isUploadRoute, jobId, uploadId, eventId } =
    request;

  return Effect.gen(function* () {
    // Subscribe to flow events if this is a flow route
    if (isFlowRoute) {
      yield* handleSubscribeToFlowEvents(flowServer, jobId, connection);
    }

    // Subscribe to upload events if this is an upload route
    if (isUploadRoute) {
      yield* handleSubscribeToUploadEvents(uploadServer, uploadId, connection);
    }

    // Send connection confirmation
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
};

/**
 * Handles incoming WebSocket messages
 * Currently supports ping/pong for connection keep-alive
 */
export const handleWebSocketMessage = (
  message: string,
  connection: WebSocketConnection,
) => {
  return Effect.sync(() => {
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
  });
};

/**
 * Handles WebSocket connection closing
 * Unsubscribes from all events and cleans up resources
 */
export const handleWebSocketClose = (
  request: WebSocketConnectionRequest,
  uploadServer: UploadServerShape,
  flowServer: FlowServerShape,
) => {
  const { isFlowRoute, isUploadRoute, jobId, uploadId } = request;

  return Effect.gen(function* () {
    // Unsubscribe from flow events if this was a flow route
    if (isFlowRoute) {
      yield* handleUnsubscribeFromFlowEvents(flowServer, jobId);
    }

    // Unsubscribe from upload events if this was an upload route
    if (isUploadRoute) {
      yield* handleUnsubscribeFromUploadEvents(uploadServer, uploadId);
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
};

/**
 * Handles WebSocket errors
 */
export const handleWebSocketError = (error: unknown, eventId?: string) => {
  return Effect.sync(() => {
    console.error(`WebSocket error for event ${eventId}:`, error);
  });
};
