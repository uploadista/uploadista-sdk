import type { WebSocketConnection } from "@uploadista/core/types";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { durableObjectBaseEventEmitter } from "../src/do-event-emitter";
import { createMockEventEmitterDurableObject } from "./utils/mock-durable-object";

class MockWebSocketConnection implements WebSocketConnection {
  id = "test-ws";
  readyState = 1;

  send(data: string): void {
    // no-op
  }

  close(): void {
    this.readyState = 3;
  }
}

describe("Durable Object Event Emitter", () => {
  describe("DO Stub Routing", () => {
    it("should retrieve stub using idFromName for emit", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.emit("upload-123", "test-message");

          expect(namespace.idFromName).toHaveBeenCalledWith("upload-123");
          expect(namespace.get).toHaveBeenCalled();
          expect(namespace.mockStub.emit).toHaveBeenCalledWith("test-message");
        }),
      );
    });

    it("should call stub.emit() with message", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.emit("event-key", "event-payload");

          expect(namespace.mockStub.emit).toHaveBeenCalledWith("event-payload");
          expect(namespace.mockStub.emit).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should retrieve stub using idFromName for subscribe", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const connection = new MockWebSocketConnection();
          yield* emitter.subscribe("job-456", connection);

          expect(namespace.idFromName).toHaveBeenCalledWith("job-456");
          expect(namespace.get).toHaveBeenCalled();
        }),
      );
    });

    it("should call stub.subscribe() with connection", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const connection = new MockWebSocketConnection();
          yield* emitter.subscribe("flow-789", connection);

          expect(namespace.mockStub.subscribe).toHaveBeenCalledWith(connection);
          expect(namespace.mockStub.subscribe).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should retrieve stub using idFromName for unsubscribe", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.unsubscribe("channel-abc");

          expect(namespace.idFromName).toHaveBeenCalledWith("channel-abc");
          expect(namespace.get).toHaveBeenCalled();
        }),
      );
    });

    it("should call stub.unsubscribe()", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.unsubscribe("unsub-key");

          expect(namespace.mockStub.unsubscribe).toHaveBeenCalled();
          expect(namespace.mockStub.unsubscribe).toHaveBeenCalledTimes(1);
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should return UploadistaError when emit fails", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      namespace.mockStub.emit.mockRejectedValueOnce(new Error("DO emit failed"));

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(emitter.emit("key", "message"));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left.code).toBe("UNKNOWN_ERROR");
          }
        }),
      );
    });

    it("should return UploadistaError when subscribe fails", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      namespace.mockStub.subscribe.mockRejectedValueOnce(
        new Error("DO subscribe failed"),
      );

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const connection = new MockWebSocketConnection();
          const result = yield* Effect.either(emitter.subscribe("key", connection));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left.code).toBe("UNKNOWN_ERROR");
          }
        }),
      );
    });

    it("should return UploadistaError when unsubscribe fails", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      namespace.mockStub.unsubscribe.mockRejectedValueOnce(
        new Error("DO unsubscribe failed"),
      );

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(emitter.unsubscribe("key"));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left.code).toBe("UNKNOWN_ERROR");
          }
        }),
      );
    });

    it("should handle DO stub retrieval errors", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      namespace.get.mockImplementation(() => {
        throw new Error("Failed to get stub");
      });

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(emitter.emit("key", "message"));

          expect(result._tag).toBe("Left");
        }),
      );
    });
  });

  describe("DO-Specific Behavior", () => {
    it("should route different eventKeys to different DO instances", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.emit("key-a", "message-a");
          yield* emitter.emit("key-b", "message-b");
          yield* emitter.emit("key-c", "message-c");

          // Should have created IDs for each key
          expect(namespace.idFromName).toHaveBeenCalledWith("key-a");
          expect(namespace.idFromName).toHaveBeenCalledWith("key-b");
          expect(namespace.idFromName).toHaveBeenCalledWith("key-c");
          expect(namespace.idFromName).toHaveBeenCalledTimes(3);
        }),
      );
    });

    it("should route same eventKey to same DO instance", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.emit("same-key", "message-1");
          yield* emitter.emit("same-key", "message-2");
          yield* emitter.emit("same-key", "message-3");

          // All should route to the same DO (same idFromName call)
          expect(namespace.idFromName).toHaveBeenCalledWith("same-key");
          expect(namespace.idFromName).toHaveBeenCalledTimes(3);

          // Should emit 3 times to the same stub
          expect(namespace.mockStub.emit).toHaveBeenCalledTimes(3);
        }),
      );
    });

    it("should use DO namespace correctly", async () => {
      const { namespace, asTyped } = createMockEventEmitterDurableObject<string>();

      const emitter = durableObjectBaseEventEmitter({
        durableObject: asTyped(),
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* emitter.emit("test-key", "test-message");

          // Verify the DO namespace methods were called in correct order
          expect(namespace.idFromName).toHaveBeenCalledBefore(namespace.get);
          expect(namespace.get).toHaveBeenCalled();
        }),
      );
    });
  });
});
