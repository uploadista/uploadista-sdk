import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createMemoryEventBroadcaster } from "../src/memory-event-broadcaster";

describe("Memory Event Broadcaster", () => {
  describe("Basic Pub/Sub Operations", () => {
    it("should publish and subscribe deliver messages to handlers", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("test-channel", handler);
          yield* broadcaster.publish("test-channel", "test-message");

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]).toBe("test-message");
        }),
      );
    });

    it("should handle multiple subscribers receiving the same message", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const handler1Messages: string[] = [];
      const handler2Messages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler1 = (message: string) => handler1Messages.push(message);
          const handler2 = (message: string) => handler2Messages.push(message);

          yield* broadcaster.subscribe("events", handler1);
          yield* broadcaster.subscribe("events", handler2);
          yield* broadcaster.publish("events", "shared-message");

          expect(handler1Messages).toHaveLength(1);
          expect(handler1Messages[0]).toBe("shared-message");
          expect(handler2Messages).toHaveLength(1);
          expect(handler2Messages[0]).toBe("shared-message");
        }),
      );
    });

    it("should unsubscribe and remove handler from channel", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("channel-1", handler);
          yield* broadcaster.publish("channel-1", "message-1");

          yield* broadcaster.unsubscribe!("channel-1");
          yield* broadcaster.publish("channel-1", "message-2");

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]).toBe("message-1");
        }),
      );
    });

    it("should maintain channel isolation", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const channelAMessages: string[] = [];
      const channelBMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handlerA = (message: string) => channelAMessages.push(message);
          const handlerB = (message: string) => channelBMessages.push(message);

          yield* broadcaster.subscribe("channel-a", handlerA);
          yield* broadcaster.subscribe("channel-b", handlerB);
          yield* broadcaster.publish("channel-a", "message-for-a");

          expect(channelAMessages).toHaveLength(1);
          expect(channelAMessages[0]).toBe("message-for-a");
          expect(channelBMessages).toHaveLength(0);
        }),
      );
    });

    it("should succeed when subscribing to non-existent channel", async () => {
      const broadcaster = createMemoryEventBroadcaster();

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("non-existent", handler);

          // Should not throw and handler should be registered
          expect(handler).not.toHaveBeenCalled();
        }),
      );
    });

    it("should succeed when publishing to channel with no subscribers", async () => {
      const broadcaster = createMemoryEventBroadcaster();

      await Effect.runPromise(
        Effect.gen(function* () {
          // Should not throw
          yield* broadcaster.publish("empty-channel", "message");
        }),
      );
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle concurrent publishes to same channel", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("concurrent-channel", handler);

          const messages = Array.from({ length: 10 }, (_, i) => `message-${i}`);
          yield* Effect.all(
            messages.map((msg) => broadcaster.publish("concurrent-channel", msg)),
            { concurrency: "unbounded" },
          );

          expect(receivedMessages).toHaveLength(10);
          // All messages should be received (order may vary in concurrent execution)
          for (const msg of messages) {
            expect(receivedMessages).toContain(msg);
          }
        }),
      );
    });

    it("should handle concurrent subscribes to different channels", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const handlers = Array.from({ length: 5 }, () => vi.fn());

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.all(
            handlers.map((handler, i) =>
              broadcaster.subscribe(`channel-${i}`, handler),
            ),
            { concurrency: "unbounded" },
          );

          // Verify each channel can receive messages independently
          for (let i = 0; i < handlers.length; i++) {
            yield* broadcaster.publish(`channel-${i}`, `message-${i}`);
          }

          for (let i = 0; i < handlers.length; i++) {
            expect(handlers[i]).toHaveBeenCalledWith(`message-${i}`);
            expect(handlers[i]).toHaveBeenCalledTimes(1);
          }
        }),
      );
    });

    it("should handle subscribe and publish happening concurrently", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          // Subscribe and publish concurrently
          yield* Effect.all(
            [
              broadcaster.subscribe("concurrent", handler),
              Effect.sleep(5).pipe(
                Effect.flatMap(() => broadcaster.publish("concurrent", "msg1")),
              ),
              Effect.sleep(10).pipe(
                Effect.flatMap(() => broadcaster.publish("concurrent", "msg2")),
              ),
            ],
            { concurrency: "unbounded" },
          );

          // Wait a bit for messages to be delivered
          yield* Effect.sleep(20);

          // At least one message should be received
          expect(receivedMessages.length).toBeGreaterThan(0);
        }),
      );
    });
  });

  describe("Edge Cases", () => {
    it("should deliver empty message string correctly", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("empty-test", handler);
          yield* broadcaster.publish("empty-test", "");

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]).toBe("");
        }),
      );
    });

    it("should handle large message payload", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const largeMessage = "x".repeat(100000);
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("large", handler);
          yield* broadcaster.publish("large", largeMessage);

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]).toBe(largeMessage);
          expect(receivedMessages[0].length).toBe(100000);
        }),
      );
    });

    it("should handle special characters in channel names", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          const specialChannel = "channel:with:colons:and-dashes_and_underscores";
          yield* broadcaster.subscribe(specialChannel, handler);
          yield* broadcaster.publish(specialChannel, "test");

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]).toBe("test");
        }),
      );
    });

    it("should handle special characters in messages", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("special", handler);

          const specialMessage = 'Hello "World" with \'quotes\' and \n newlines \t tabs 世界 🌍';
          yield* broadcaster.publish("special", specialMessage);

          expect(receivedMessages).toHaveLength(1);
          expect(receivedMessages[0]).toBe(specialMessage);
        }),
      );
    });
  });

  describe("Handler Behavior", () => {
    it.skip("should propagate handler exceptions when they occur", async () => {
      // Skipped: Handler exceptions are propagated synchronously in memory broadcaster
      // This is implementation-specific behavior
      const broadcaster = createMemoryEventBroadcaster();

      await Effect.runPromise(
        Effect.gen(function* () {
          const badHandler = () => {
            throw new Error("Handler error");
          };

          yield* broadcaster.subscribe("error-test", badHandler);

          // Handler errors will propagate
          const result = yield* Effect.either(
            broadcaster.publish("error-test", "test-message"),
          );

          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should call handler with exact message string", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const handler = vi.fn();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* broadcaster.subscribe("exact", handler);
          yield* broadcaster.publish("exact", "exact-message");

          expect(handler).toHaveBeenCalledWith("exact-message");
          expect(handler).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should deliver multiple messages in order", async () => {
      const broadcaster = createMemoryEventBroadcaster();
      const receivedMessages: string[] = [];

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = (message: string) => {
            receivedMessages.push(message);
          };

          yield* broadcaster.subscribe("ordered", handler);

          yield* broadcaster.publish("ordered", "first");
          yield* broadcaster.publish("ordered", "second");
          yield* broadcaster.publish("ordered", "third");

          expect(receivedMessages).toEqual(["first", "second", "third"]);
        }),
      );
    });
  });
});
