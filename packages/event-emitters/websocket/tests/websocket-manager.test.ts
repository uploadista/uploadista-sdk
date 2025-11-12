import { createMemoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import type { WebSocketManager } from "@uploadista/core/types";
import { EventBroadcasterService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { makeWebSocketManager } from "../src/websocket-manager";
import { createMockWebSocketConnection } from "./utils/mock-websocket";

// Create test layer with memory broadcaster
const createTestManager = (): Effect.Effect<WebSocketManager, never, never> => {
  const broadcaster = createMemoryEventBroadcaster();
  const broadcasterLayer = Layer.succeed(EventBroadcasterService, broadcaster);

  return makeWebSocketManager.pipe(Effect.provide(broadcasterLayer));
};

describe("WebSocketManager", () => {
  describe("Connection Management", () => {
    it("should add and retrieve connections", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-1");
          wsManager.addConnection("conn-1", connection);

          const retrieved = wsManager.getConnection("conn-1");
          expect(retrieved).toBe(connection);

          const allConnections = wsManager.getConnections();
          expect(allConnections.size).toBe(1);
          expect(allConnections.get("conn-1")).toBe(connection);
        }),
      );
    });

    it("should remove connections", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-2");
          wsManager.addConnection("conn-2", connection);
          wsManager.removeConnection("conn-2");

          const retrieved = wsManager.getConnection("conn-2");
          expect(retrieved).toBeNull();
        }),
      );
    });

    it("should clean up subscriptions when removing connection", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-cleanup");
          wsManager.addConnection("conn-cleanup", connection);
          wsManager.subscribeToEvents("event-1", "conn-cleanup");
          wsManager.subscribeToEvents("event-2", "conn-cleanup");

          wsManager.removeConnection("conn-cleanup");

          const retrieved = wsManager.getConnection("conn-cleanup");
          expect(retrieved).toBeNull();
        }),
      );
    });
  });

  describe("Event Subscriptions", () => {
    it("should subscribe connection to events", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-3");
          wsManager.addConnection("conn-3", connection);
          wsManager.subscribeToEvents("event-1", "conn-3");

          // Connection is registered
          expect(wsManager.getConnection("conn-3")).toBe(connection);
        }),
      );
    });

    it("should unsubscribe connection from events", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-4");
          wsManager.addConnection("conn-4", connection);
          wsManager.subscribeToEvents("event-2", "conn-4");
          wsManager.unsubscribeFromEvents("event-2", "conn-4");

          // Connection still exists
          expect(wsManager.getConnection("conn-4")).toBe(connection);
        }),
      );
    });

    it("should support multiple subscriptions for one connection", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-multi");
          wsManager.addConnection("conn-multi", connection);
          wsManager.subscribeToEvents("event-a", "conn-multi");
          wsManager.subscribeToEvents("event-b", "conn-multi");
          wsManager.subscribeToEvents("event-c", "conn-multi");

          // Connection exists and can subscribe to multiple events
          expect(wsManager.getConnection("conn-multi")).toBe(connection);
        }),
      );
    });
  });

  describe("Message Emission", () => {
    it("should emit messages to subscribed connections", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const wsManager = yield* createTestManager();

          const connection = createMockWebSocketConnection("conn-5");
          wsManager.addConnection("conn-5", connection);
          wsManager.subscribeToEvents("upload-123", "conn-5");

          // Emit event
          wsManager.emitToEvents("upload-123", "test-message");

          // Give time for broadcaster to deliver
          yield* Effect.sleep(100);

          // Check message was received
          expect(connection.sentMessages.length).toBeGreaterThan(0);
          const lastMessage = connection.getLastMessage();
          expect(lastMessage).toBe("test-message");
        }),
      );
    });
  });
});
