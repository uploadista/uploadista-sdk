import { UploadistaError } from "@uploadista/core/errors";
import type {
  WebSocketConnection,
  WebSocketMessage,
} from "@uploadista/core/types";
import {
  type BaseEventEmitter,
  BaseEventEmitterService,
  type EventBroadcasterService,
} from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import {
  type WebSocketManager,
  WebSocketManagerService,
  webSocketManager,
} from "./websocket-manager";

export function webSocketBaseEventEmitter(
  webSocketManager: WebSocketManager,
): BaseEventEmitter {
  return {
    emit: (eventKey: string, message: string) => {
      return Effect.try({
        try: () => {
          webSocketManager.emitToEvents(eventKey, message);
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
    subscribe: (eventKey: string, connection: WebSocketConnection) => {
      return Effect.try({
        try: () => {
          webSocketManager.addConnection(connection.id, connection);
          webSocketManager.subscribeToEvents(eventKey, connection.id);

          // Send confirmation message
          connection.send(
            JSON.stringify({
              type: "subscribed",
              payload: { eventKey },
              timestamp: new Date().toISOString(),
            } satisfies WebSocketMessage),
          );
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
    unsubscribe: (eventKey: string) => {
      return Effect.try({
        try: () => {
          // Note: We need connectionId for proper cleanup, but the interface only provides eventKey
          // For now, we'll remove all connections for this eventKey
          // This could be improved by tracking connection mapping
          const connections = webSocketManager.getConnections();
          for (const [connectionId] of connections) {
            webSocketManager.unsubscribeFromEvents(eventKey, connectionId);
          }
        },
        catch: (cause) => {
          return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
        },
      });
    },
  };
}

// Effect-based implementation using webSocketManagerService
export const makeBaseEventEmitter = Effect.gen(function* () {
  const webSocketManager = yield* WebSocketManagerService;
  return webSocketBaseEventEmitter(webSocketManager);
});

export const webSocketEventEmitter = (
  eventBroadcaster: Layer.Layer<EventBroadcasterService>,
) =>
  Layer.effect(BaseEventEmitterService, makeBaseEventEmitter).pipe(
    Layer.provide(webSocketManager),
    Layer.provide(eventBroadcaster),
  );
