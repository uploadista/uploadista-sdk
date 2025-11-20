import type { WebSocketConnection } from "@uploadista/core/types";
import {
  type BaseEventEmitter,
  eventToMessageSerializer,
  TypedEventEmitter,
} from "@uploadista/core/types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

interface TestEvent {
  id: string;
  type: string;
  data: string;
}

class MockWebSocketConnection implements WebSocketConnection {
  id = "test-conn";
  readyState = 1;
  sentMessages: string[] = [];

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.readyState = 3;
  }
}

describe("TypedEventEmitter", () => {
  describe("Event Serialization", () => {
    it("should serialize event using eventToMessage function", async () => {
      const emittedMessages: Array<{ key: string; message: string }> = [];
      const mockBaseEmitter: BaseEventEmitter = {
        emit: (key: string, message: string) =>
          Effect.sync(() => {
            emittedMessages.push({ key, message });
          }),
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const serializer = (event: TestEvent) =>
        JSON.stringify({ custom: "format", event });

      const typedEmitter = new TypedEventEmitter(mockBaseEmitter, serializer);

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = { id: "1", type: "test", data: "hello" };
          yield* typedEmitter.emit("key1", event);

          expect(emittedMessages).toHaveLength(1);
          expect(emittedMessages[0].key).toBe("key1");

          const parsed = JSON.parse(emittedMessages[0].message);
          expect(parsed.custom).toBe("format");
          expect(parsed.event).toEqual(event);
        }),
      );
    });

    it("should delegate emit to BaseEventEmitter with serialized message", async () => {
      const emitSpy = vi.fn().mockReturnValue(Effect.void);
      const mockBaseEmitter: BaseEventEmitter = {
        emit: emitSpy,
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        (event: TestEvent) => JSON.stringify(event),
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = { id: "2", type: "action", data: "world" };
          yield* typedEmitter.emit("key2", event);

          expect(emitSpy).toHaveBeenCalledWith("key2", JSON.stringify(event));
          expect(emitSpy).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should delegate subscribe to BaseEventEmitter", async () => {
      const subscribeSpy = vi.fn().mockReturnValue(Effect.void);
      const mockBaseEmitter: BaseEventEmitter = {
        emit: () => Effect.void,
        subscribe: subscribeSpy,
        unsubscribe: () => Effect.void,
      };

      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        (event: TestEvent) => JSON.stringify(event),
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const connection = new MockWebSocketConnection();
          yield* typedEmitter.subscribe("key3", connection);

          expect(subscribeSpy).toHaveBeenCalledWith("key3", connection);
          expect(subscribeSpy).toHaveBeenCalledTimes(1);
        }),
      );
    });

    it("should delegate unsubscribe to BaseEventEmitter", async () => {
      const unsubscribeSpy = vi.fn().mockReturnValue(Effect.void);
      const mockBaseEmitter: BaseEventEmitter = {
        emit: () => Effect.void,
        subscribe: () => Effect.void,
        unsubscribe: unsubscribeSpy,
      };

      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        (event: TestEvent) => JSON.stringify(event),
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* typedEmitter.unsubscribe("key4");

          expect(unsubscribeSpy).toHaveBeenCalledWith("key4");
          expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
        }),
      );
    });
  });

  describe("Standard Serializers", () => {
    it("should produce correct format for upload_event", async () => {
      const emittedMessages: string[] = [];
      const mockBaseEmitter: BaseEventEmitter = {
        emit: (key: string, message: string) =>
          Effect.sync(() => {
            emittedMessages.push(message);
          }),
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const serializer = eventToMessageSerializer("upload_event");
      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        serializer.eventToMessage,
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = {
            id: "upload-1",
            type: "progress",
            data: "50%",
          };
          yield* typedEmitter.emit("upload-key", event);

          expect(emittedMessages).toHaveLength(1);

          const parsed = JSON.parse(emittedMessages[0]);
          expect(parsed.type).toBe("upload_event");
          expect(parsed.payload).toEqual(event);
          expect(parsed.timestamp).toBeDefined();
          expect(typeof parsed.timestamp).toBe("string");
        }),
      );
    });

    it("should produce correct format for flow_event", async () => {
      const emittedMessages: string[] = [];
      const mockBaseEmitter: BaseEventEmitter = {
        emit: (key: string, message: string) =>
          Effect.sync(() => {
            emittedMessages.push(message);
          }),
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const serializer = eventToMessageSerializer("flow_event");
      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        serializer.eventToMessage,
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = {
            id: "flow-1",
            type: "complete",
            data: "done",
          };
          yield* typedEmitter.emit("flow-key", event);

          expect(emittedMessages).toHaveLength(1);

          const parsed = JSON.parse(emittedMessages[0]);
          expect(parsed.type).toBe("flow_event");
          expect(parsed.payload).toEqual(event);
          expect(parsed.timestamp).toBeDefined();
        }),
      );
    });

    it("should include valid ISO 8601 timestamp", async () => {
      const emittedMessages: string[] = [];
      const mockBaseEmitter: BaseEventEmitter = {
        emit: (key: string, message: string) =>
          Effect.sync(() => {
            emittedMessages.push(message);
          }),
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const serializer = eventToMessageSerializer("upload_event");
      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        serializer.eventToMessage,
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = { id: "test", type: "test", data: "test" };
          yield* typedEmitter.emit("test-key", event);

          const parsed = JSON.parse(emittedMessages[0]);
          const timestamp = new Date(parsed.timestamp);

          expect(timestamp.toISOString()).toBe(parsed.timestamp);
          expect(isNaN(timestamp.getTime())).toBe(false);
        }),
      );
    });
  });

  describe("Custom Serializers", () => {
    it("should use custom eventToMessage function", async () => {
      const emittedMessages: string[] = [];
      const mockBaseEmitter: BaseEventEmitter = {
        emit: (key: string, message: string) =>
          Effect.sync(() => {
            emittedMessages.push(message);
          }),
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const customSerializer = (event: TestEvent) =>
        `CUSTOM:${event.id}:${event.type}:${event.data}`;

      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        customSerializer,
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = {
            id: "123",
            type: "action",
            data: "payload",
          };
          yield* typedEmitter.emit("custom-key", event);

          expect(emittedMessages).toHaveLength(1);
          expect(emittedMessages[0]).toBe("CUSTOM:123:action:payload");
        }),
      );
    });

    it("should pass custom serializer output to BaseEventEmitter", async () => {
      const emitSpy = vi.fn().mockReturnValue(Effect.void);
      const mockBaseEmitter: BaseEventEmitter = {
        emit: emitSpy,
        subscribe: () => Effect.void,
        unsubscribe: () => Effect.void,
      };

      const customSerializer = (event: TestEvent) => `EVENT-${event.id}`;

      const typedEmitter = new TypedEventEmitter(
        mockBaseEmitter,
        customSerializer,
      );

      await Effect.runPromise(
        Effect.gen(function* () {
          const event: TestEvent = { id: "456", type: "test", data: "data" };
          yield* typedEmitter.emit("key", event);

          expect(emitSpy).toHaveBeenCalledWith("key", "EVENT-456");
        }),
      );
    });
  });
});
