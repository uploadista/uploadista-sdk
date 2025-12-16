import type { UploadEngineShape } from "@uploadista/core/upload";
import { Effect } from "effect";
import type { WebSocketConnection } from "../websocket-routes";

/**
 * Handles subscription to upload events
 * Subscribes the WebSocket connection to receive real-time upload progress events
 */
export const handleSubscribeToUploadEvents = (
  uploadEngine: UploadEngineShape,
  uploadId: string | undefined,
  connection: WebSocketConnection,
) => {
  return Effect.gen(function* () {
    if (!uploadId) {
      yield* Effect.sync(() => {
        connection.send(
          JSON.stringify({
            type: "error",
            message: "Upload ID is required for upload event subscription",
            code: "MISSING_UPLOAD_ID",
          }),
        );
      });
      return;
    }

    yield* uploadEngine.subscribeToUploadEvents(uploadId, connection);
  });
};

/**
 * Handles unsubscription from upload events
 * Removes the WebSocket connection from receiving upload events
 */
export const handleUnsubscribeFromUploadEvents = (
  uploadEngine: UploadEngineShape,
  uploadId: string | undefined,
) => {
  return Effect.gen(function* () {
    if (!uploadId) {
      return;
    }

    yield* uploadEngine.unsubscribeFromUploadEvents(uploadId);
  });
};
