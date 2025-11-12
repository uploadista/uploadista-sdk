import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createRedisEventBroadcaster } from "../src/redis-event-broadcaster";
import {
  createMockRedisClient,
  mockRedisClientAsType,
} from "./utils/mock-redis";

describe("Redis Event Broadcaster", () => {
  describe("Basic Operations", () => {
    it("should call redis.publish with correct channel and message", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* broadcaster.publish("test-channel", "test-message");

          expect(mockRedis.publish).toHaveBeenCalledWith(
            "test-channel",
            "test-message",
          );
          expect(mockRedis.publish).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should return void on successful publish", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* broadcaster.publish("channel", "message");
          expect(result).toBeUndefined();
        }),
      );
    });

    it("should call subscriberRedis.subscribe with correct parameters", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("my-channel", handler);

          expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(1);
          expect(mockSubscriber.subscribe).toHaveBeenCalledWith(
            "my-channel",
            expect.any(Function),
          );
        }),
      );
    });

    it("should invoke handler when message arrives", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("events", handler);

          // Simulate Redis message
          mockSubscriber.triggerMessage("events", "incoming-message");

          expect(handler).toHaveBeenCalledWith("incoming-message");
          expect(handler).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should call subscriberRedis.unsubscribe", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* broadcaster.unsubscribe!("channel-1");

          expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith("channel-1");
          expect(mockSubscriber.unsubscribe).toHaveBeenCalledTimes(1);
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should return UploadistaError when publish fails", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      mockRedis.publish.mockRejectedValueOnce(new Error("Connection failed"));

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            broadcaster.publish("channel", "message"),
          );

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left.code).toBe("UNKNOWN_ERROR");
          }
        }),
      );
    });

    it("should return UploadistaError when subscribe fails", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      mockSubscriber.subscribe.mockRejectedValueOnce(
        new Error("Subscribe failed"),
      );

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            broadcaster.subscribe("channel", vi.fn()),
          );

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left.code).toBe("UNKNOWN_ERROR");
          }
        }),
      );
    });

    it("should return UploadistaError when unsubscribe fails", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      mockSubscriber.unsubscribe.mockRejectedValueOnce(
        new Error("Unsubscribe failed"),
      );

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(broadcaster.unsubscribe!("channel"));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left.code).toBe("UNKNOWN_ERROR");
          }
        }),
      );
    });

    it("should register error handler for redis client", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      expect(mockRedis.on).toHaveBeenCalledWith("error", expect.any(Function));

      // Trigger error
      mockRedis.triggerError(new Error("Redis error"));
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Redis] Error:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it("should register error handler for subscriber client", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      expect(mockSubscriber.on).toHaveBeenCalledWith(
        "error",
        expect.any(Function),
      );

      // Trigger error
      mockSubscriber.triggerError(new Error("Subscriber error"));
      expect(consoleSpy).toHaveBeenCalledWith(
        "[Redis] Subscriber Error:",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Redis-Specific Behavior", () => {
    it("should use separate redis and subscriberRedis clients", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* broadcaster.publish("channel", "message");
          yield* broadcaster.subscribe("channel", vi.fn());

          // Publish uses redis client
          expect(mockRedis.publish).toHaveBeenCalledTimes(1);
          expect(mockSubscriber.publish).not.toHaveBeenCalled();

          // Subscribe uses subscriberRedis client
          expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(1);
          expect(mockRedis.subscribe).not.toHaveBeenCalled();
        }),
      );
    });

    it("should support multiple subscribe calls with different handlers", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler1 = vi.fn();
          const handler2 = vi.fn();

          yield* broadcaster.subscribe("channel-1", handler1);
          yield* broadcaster.subscribe("channel-2", handler2);

          expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(2);
          expect(mockSubscriber.subscribe).toHaveBeenNthCalledWith(
            1,
            "channel-1",
            expect.any(Function),
          );
          expect(mockSubscriber.subscribe).toHaveBeenNthCalledWith(
            2,
            "channel-2",
            expect.any(Function),
          );
        }),
      );
    });

    it("should pass correct channel and message to callback", async () => {
      const mockRedis = createMockRedisClient();
      const mockSubscriber = createMockRedisClient();

      const broadcaster = createRedisEventBroadcaster({
        redis: mockRedisClientAsType(mockRedis),
        subscriberRedis: mockRedisClientAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("test-channel", handler);

          // Simulate Redis delivering message with channel info
          mockSubscriber.triggerMessage("test-channel", "test-payload");

          expect(handler).toHaveBeenCalledWith("test-payload");
        }),
      );
    });
  });
});
