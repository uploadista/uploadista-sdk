import type { WebSocketConnection } from "@uploadista/core/types";
import { EventBroadcasterService } from "@uploadista/core/types";
import { Context, Effect, Layer } from "effect";

// Base untyped WebSocketManager - works with raw string messages
export interface WebSocketManager {
  readonly getConnection: (key: string) => WebSocketConnection | null;
  readonly getConnections: () => Map<string, WebSocketConnection>;
  readonly addConnection: (
    key: string,
    connection: WebSocketConnection,
  ) => void;
  readonly removeConnection: (key: string) => void;
  readonly subscribeToEvents: (eventKey: string, connectionId: string) => void;
  readonly unsubscribeFromEvents: (
    eventKey: string,
    connectionId: string,
  ) => void;
  readonly emitToEvents: (eventKey: string, event: string) => void;
}

export const makeWebSocketManager = Effect.gen(function* () {
  const broadcaster = yield* EventBroadcasterService;

  const connections = new Map<string, WebSocketConnection>();
  const subscriptions = new Map<string, Set<string>>(); // eventKey -> Set<connectionId>

  // Helper to send messages to local connections for a given eventKey
  const emitToLocalConnections = (eventKey: string, message: string): void => {
    const connectionIds = subscriptions.get(eventKey);
    if (!connectionIds) return;

    for (const connectionId of connectionIds) {
      const connection = connections.get(connectionId);
      if (connection && connection.readyState === 1) {
        try {
          connection.send(message);
        } catch (error) {
          console.warn(
            `Failed to send message to connection ${connectionId}:`,
            error,
          );
          removeConnection(connectionId);
        }
      } else {
        removeConnection(connectionId);
      }
    }
  };

  // Subscribe to broadcast events from other instances
  yield* broadcaster
    .subscribe("uploadista:events", (broadcastMessage) => {
      try {
        const { eventKey, message } = JSON.parse(broadcastMessage);
        emitToLocalConnections(eventKey, message);
      } catch (error) {
        console.warn("Failed to parse broadcast message:", error);
      }
    })
    .pipe(
      Effect.catchAll((error) => {
        console.error("Failed to subscribe to broadcast events:", error);
        return Effect.void;
      }),
    );

  const getConnection = (key: string): WebSocketConnection | null => {
    return connections.get(key) || null;
  };

  const getConnections = (): Map<string, WebSocketConnection> => {
    return connections;
  };

  const addConnection = (
    key: string,
    connection: WebSocketConnection,
  ): void => {
    connections.set(key, connection);
  };

  const removeConnection = (key: string): void => {
    connections.delete(key);
    // Clean up subscriptions
    for (const [eventKey, connectionIds] of subscriptions.entries()) {
      connectionIds.delete(key);
      if (connectionIds.size === 0) {
        subscriptions.delete(eventKey);
      }
    }
  };

  const subscribeToEvents = (eventKey: string, connectionId: string): void => {
    if (!subscriptions.has(eventKey)) {
      subscriptions.set(eventKey, new Set());
    }
    subscriptions.get(eventKey)?.add(connectionId);
  };

  const unsubscribeFromEvents = (
    eventKey: string,
    connectionId: string,
  ): void => {
    const connectionIds = subscriptions.get(eventKey);
    if (connectionIds) {
      connectionIds.delete(connectionId);
      if (connectionIds.size === 0) {
        subscriptions.delete(eventKey);
      }
    }
  };

  const emitToEvents = (eventKey: string, message: string): void => {
    // Publish to broadcaster so all instances (including this one) receive it
    Effect.runPromise(
      broadcaster.publish(
        "uploadista:events",
        JSON.stringify({ eventKey, message }),
      ),
    ).catch((error) => {
      console.error("Failed to publish event to broadcaster:", error);
    });
  };

  return {
    getConnection,
    getConnections,
    addConnection,
    removeConnection,
    subscribeToEvents,
    unsubscribeFromEvents,
    emitToEvents,
  };
});

// Context tags
export class WebSocketManagerService extends Context.Tag(
  "BaseWebSocketManagerService",
)<WebSocketManagerService, WebSocketManager>() {}

// Base layer
export const webSocketManager = Layer.effect(
  WebSocketManagerService,
  makeWebSocketManager,
);
