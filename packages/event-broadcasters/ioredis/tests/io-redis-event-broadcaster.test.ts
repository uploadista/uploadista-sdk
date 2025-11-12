import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createIoRedisEventBroadcaster } from "../src/io-redis-event-broadcaster";
import {
  createMockIORedisClient,
  mockIORedisAsType,
} from "./utils/mock-ioredis";

describe("IORedis Event Broadcaster", () => {
  describe("Basic Operations", () => {
    it("should call ioredis.publish with correct arguments", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
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

    it("should register message listener when subscribing", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("events", handler);

          expect(mockSubscriber.subscribe).toHaveBeenCalledWith("events");
          expect(mockSubscriber.on).toHaveBeenCalledWith(
            "message",
            expect.any(Function),
          );
        }),
      );
    });

    it("should call unsubscribe on IORedis client", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* broadcaster.unsubscribe!("channel-1");

          expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith("channel-1");
        }),
      );
    });

    it("should trigger handler when message event occurs", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("my-channel", handler);

          // Simulate IORedis message event
          mockSubscriber.triggerMessage("my-channel", "test-payload");

          expect(handler).toHaveBeenCalledWith("test-payload");
          expect(handler).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should only deliver messages for subscribed channel", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const handler = vi.fn();
          yield* broadcaster.subscribe("channel-a", handler);

          // Message for different channel
          mockSubscriber.triggerMessage("channel-b", "wrong-message");
          expect(handler).not.toHaveBeenCalled();

          // Message for correct channel
          mockSubscriber.triggerMessage("channel-a", "correct-message");
          expect(handler).toHaveBeenCalledWith("correct-message");
          expect(handler).toHaveBeenCalledTimes(1);
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should return UploadistaError when publish fails", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      mockRedis.publish.mockRejectedValueOnce(new Error("Publish failed"));

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
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
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      mockSubscriber.subscribe.mockImplementation(() => {
        throw new Error("Subscribe failed");
      });

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
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
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      mockSubscriber.unsubscribe.mockRejectedValueOnce(
        new Error("Unsubscribe failed"),
      );

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
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
  });

  describe("IORedis-Specific Behavior", () => {
    it("should use separate redis clients for pub and sub", async () => {
      const mockRedis = createMockIORedisClient();
      const mockSubscriber = createMockIORedisClient();

      const broadcaster = createIoRedisEventBroadcaster({
        redis: mockIORedisAsType(mockRedis),
        subscriberRedis: mockIORedisAsType(mockSubscriber),
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
  });
});
