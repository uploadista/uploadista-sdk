import type { FlowEngineShape } from "@uploadista/core/flow";
import { Effect } from "effect";
import type { WebSocketConnection } from "../websocket-routes";

/**
 * Handles subscription to flow events
 * Subscribes the WebSocket connection to receive real-time flow execution events
 */
export const handleSubscribeToFlowEvents = (
  flowEngine: FlowEngineShape,
  jobId: string | undefined,
  connection: WebSocketConnection,
) => {
  return Effect.gen(function* () {
    if (!jobId) {
      yield* Effect.sync(() => {
        connection.send(
          JSON.stringify({
            type: "error",
            message: "Job ID is required for flow event subscription",
            code: "MISSING_JOB_ID",
          }),
        );
      });
      return;
    }

    yield* flowEngine.subscribeToFlowEvents(jobId, connection);
  });
};

/**
 * Handles unsubscription from flow events
 * Removes the WebSocket connection from receiving flow events
 */
export const handleUnsubscribeFromFlowEvents = (
  flowEngine: FlowEngineShape,
  jobId: string | undefined,
) => {
  return Effect.gen(function* () {
    if (!jobId) {
      return;
    }

    yield* flowEngine.unsubscribeFromFlowEvents(jobId);
  });
};
