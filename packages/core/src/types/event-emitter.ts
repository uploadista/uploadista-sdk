import { Context, Effect, Layer } from "effect";
import type { UploadistaError } from "../errors";
import type { FlowEvent } from "../flow/event";
import type { UploadEvent } from "./upload-event";
import type { WebSocketConnection } from "./websocket";

/**
 * Base event emitter interface for raw string message broadcasting.
 *
 * This is the low-level interface that event broadcasting implementations
 * (WebSocket, Server-Sent Events, etc.) implement. It emits raw string messages
 * without type safety or serialization.
 *
 * @property subscribe - Registers a WebSocket connection to receive events for a key
 * @property unsubscribe - Removes subscription for a key
 * @property emit - Broadcasts a string message to all subscribers of a key
 *
 * @example
 * ```typescript
 * // Implement BaseEventEmitter with WebSocket broadcast
 * const websocketEmitter: BaseEventEmitter = {
 *   subscribe: (key, connection) => Effect.sync(() => {
 *     connections.set(key, [...(connections.get(key) || []), connection]);
 *   }),
 *
 *   unsubscribe: (key) => Effect.sync(() => {
 *     connections.delete(key);
 *   }),
 *
 *   emit: (key, event) => Effect.sync(() => {
 *     const subs = connections.get(key) || [];
 *     subs.forEach(conn => conn.send(event));
 *   })
 * };
 * ```
 */
export interface BaseEventEmitter {
  readonly subscribe: (
    key: string,
    connection: WebSocketConnection,
  ) => Effect.Effect<void, UploadistaError>;
  readonly unsubscribe: (key: string) => Effect.Effect<void, UploadistaError>;
  readonly emit: (
    key: string,
    event: string,
  ) => Effect.Effect<void, UploadistaError>;
}

/**
 * Type-safe event emitter interface with automatic serialization.
 *
 * This wraps a BaseEventEmitter and handles event serialization to JSON messages,
 * providing type safety for events and ensuring consistent message format.
 *
 * @template TEvent - The type of events emitted by this emitter
 *
 * @property subscribe - Registers a WebSocket connection to receive typed events
 * @property unsubscribe - Removes subscription
 * @property emit - Serializes and broadcasts a typed event
 *
 * @example
 * ```typescript
 * // Use a typed event emitter
 * const uploadEmitter: EventEmitter<UploadEvent> = new TypedEventEmitter(
 *   baseEmitter,
 *   (event) => JSON.stringify({ type: 'upload', payload: event })
 * );
 *
 * // Emit type-safe events
 * const program = Effect.gen(function* () {
 *   const event: UploadEvent = {
 *     uploadId: "upload123",
 *     type: "progress",
 *     offset: 1024,
 *     size: 2048
 *   };
 *
 *   // Automatic serialization
 *   yield* uploadEmitter.emit("upload123", event);
 * });
 * ```
 */
export type EventEmitter<TEvent> = {
  readonly subscribe: (
    key: string,
    connection: WebSocketConnection,
  ) => Effect.Effect<void, UploadistaError>;
  readonly unsubscribe: (key: string) => Effect.Effect<void, UploadistaError>;
  readonly emit: (
    key: string,
    event: TEvent,
  ) => Effect.Effect<void, UploadistaError>;
};

/**
 * Typed wrapper class that adds event serialization to a BaseEventEmitter.
 *
 * This class implements the EventEmitter interface by wrapping a BaseEventEmitter
 * and handling serialization for a specific event type. It converts typed events
 * to JSON message strings before broadcasting.
 *
 * @template TEvent - The type of events to emit
 *
 * @example
 * ```typescript
 * // Create a typed emitter for UploadEvent
 * const uploadEmitter = new TypedEventEmitter<UploadEvent>(
 *   baseEmitter,
 *   (event) => JSON.stringify({
 *     type: "upload_event",
 *     payload: event,
 *     timestamp: new Date().toISOString()
 *   })
 * );
 *
 * // Use the emitter
 * const effect = Effect.gen(function* () {
 *   // Subscribe a WebSocket connection
 *   yield* uploadEmitter.subscribe("upload123", websocket);
 *
 *   // Emit an event (automatically serialized)
 *   yield* uploadEmitter.emit("upload123", {
 *     uploadId: "upload123",
 *     type: "completed",
 *     offset: 2048,
 *     size: 2048
 *   });
 *
 *   // Unsubscribe when done
 *   yield* uploadEmitter.unsubscribe("upload123");
 * });
 *
 * // Custom message format
 * const customEmitter = new TypedEventEmitter<MyEvent>(
 *   baseEmitter,
 *   (event) => `EVENT:${event.type}:${JSON.stringify(event.data)}`
 * );
 * ```
 */
export class TypedEventEmitter<TEvent> implements EventEmitter<TEvent> {
  constructor(
    private baseEmitter: BaseEventEmitter,
    private eventToMessage: (event: TEvent) => string,
  ) {}

  subscribe = (
    key: string,
    connection: WebSocketConnection,
  ): Effect.Effect<void, UploadistaError> =>
    this.baseEmitter.subscribe(key, connection);

  unsubscribe = (key: string): Effect.Effect<void, UploadistaError> =>
    this.baseEmitter.unsubscribe(key);

  emit = (key: string, event: TEvent): Effect.Effect<void, UploadistaError> => {
    const message = this.eventToMessage(event);
    return this.baseEmitter.emit(key, message);
  };
}

/**
 * Default event-to-message serialization helper.
 *
 * Creates a standardized JSON message format with type, payload, and timestamp.
 * This is the recommended way to serialize events for WebSocket transmission.
 *
 * @param messageType - The message type identifier ("upload_event" or "flow_event")
 * @returns An object with an eventToMessage function
 *
 * @example
 * ```typescript
 * // Create emitter with standard serialization
 * const emitter = new TypedEventEmitter<UploadEvent>(
 *   baseEmitter,
 *   eventToMessageSerializer("upload_event").eventToMessage
 * );
 *
 * // Messages will be formatted as:
 * // {
 * //   "type": "upload_event",
 * //   "payload": { ...event data... },
 * //   "timestamp": "2024-01-15T10:30:00.000Z"
 * // }
 * ```
 */
export const eventToMessageSerializer = (
  messageType: "upload_event" | "flow_event",
) => ({
  eventToMessage: <T>(event: T): string =>
    JSON.stringify({
      type: messageType,
      payload: event,
      timestamp: new Date().toISOString(),
    }),
});

/**
 * Effect-TS context tag for the base untyped event emitter.
 *
 * This is the low-level emitter that broadcasting implementations provide.
 * Most application code should use typed emitters like UploadEventEmitter instead.
 *
 * @example
 * ```typescript
 * // Provide a base emitter implementation
 * const baseEmitterLayer = Layer.succeed(BaseEventEmitterService, websocketEmitter);
 *
 * // Use in an Effect
 * const effect = Effect.gen(function* () {
 *   const baseEmitter = yield* BaseEventEmitterService;
 *   yield* baseEmitter.emit("channel1", "raw message");
 * });
 * ```
 */
export class BaseEventEmitterService extends Context.Tag("BaseEventEmitter")<
  BaseEventEmitterService,
  BaseEventEmitter
>() {}

/**
 * Effect-TS context tag for the UploadEvent typed emitter.
 *
 * This provides type-safe event emission for upload progress and lifecycle events.
 * It's the primary way to broadcast upload events to connected clients.
 *
 * @example
 * ```typescript
 * const uploadEffect = Effect.gen(function* () {
 *   const emitter = yield* UploadEventEmitter;
 *
 *   // Subscribe a client to upload events
 *   yield* emitter.subscribe("upload123", websocketConnection);
 *
 *   // Emit progress event
 *   yield* emitter.emit("upload123", {
 *     uploadId: "upload123",
 *     type: "progress",
 *     offset: 512000,
 *     size: 1024000
 *   });
 *
 *   // Emit completion event
 *   yield* emitter.emit("upload123", {
 *     uploadId: "upload123",
 *     type: "completed",
 *     offset: 1024000,
 *     size: 1024000
 *   });
 * });
 * ```
 */
export class UploadEventEmitter extends Context.Tag("UploadEventEmitter")<
  UploadEventEmitter,
  EventEmitter<UploadEvent>
>() {}

/**
 * Effect Layer that creates the UploadEventEmitter from a BaseEventEmitter.
 *
 * This layer automatically wires up JSON serialization for UploadEvent objects
 * with the standard "upload_event" message format.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const emitter = yield* UploadEventEmitter;
 *   // Use the emitter...
 * }).pipe(
 *   Effect.provide(uploadEventEmitter),
 *   Effect.provide(baseEmitterLayer)
 * );
 * ```
 */
export const uploadEventEmitter = Layer.effect(
  UploadEventEmitter,
  Effect.gen(function* () {
    const baseEmitter = yield* BaseEventEmitterService;
    return new TypedEventEmitter<UploadEvent>(
      baseEmitter,
      eventToMessageSerializer("upload_event").eventToMessage,
    );
  }),
);

/**
 * Effect-TS context tag for the FlowEvent typed emitter.
 *
 * This provides type-safe event emission for flow processing lifecycle events.
 * It's used to broadcast flow execution progress, node completion, and errors.
 *
 * @example
 * ```typescript
 * const flowEffect = Effect.gen(function* () {
 *   const emitter = yield* FlowEventEmitter;
 *
 *   // Subscribe a client to flow job events
 *   yield* emitter.subscribe("job123", websocketConnection);
 *
 *   // Emit node start event
 *   yield* emitter.emit("job123", {
 *     jobId: "job123",
 *     eventType: "NodeStart",
 *     flowId: "flow_resize",
 *     nodeId: "resize_1"
 *   });
 *
 *   // Emit node completion event
 *   yield* emitter.emit("job123", {
 *     jobId: "job123",
 *     eventType: "NodeEnd",
 *     flowId: "flow_resize",
 *     nodeId: "resize_1",
 *     result: { width: 800, height: 600 }
 *   });
 * });
 * ```
 */
export class FlowEventEmitter extends Context.Tag("FlowEventEmitter")<
  FlowEventEmitter,
  EventEmitter<FlowEvent>
>() {}

/**
 * Effect Layer that creates the FlowEventEmitter from a BaseEventEmitter.
 *
 * This layer automatically wires up JSON serialization for FlowEvent objects
 * with the standard "flow_event" message format.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const emitter = yield* FlowEventEmitter;
 *   // Use the emitter...
 * }).pipe(
 *   Effect.provide(flowEventEmitter),
 *   Effect.provide(baseEmitterLayer)
 * );
 * ```
 */
export const flowEventEmitter = Layer.effect(
  FlowEventEmitter,
  Effect.gen(function* () {
    const baseEmitter = yield* BaseEventEmitterService;
    return new TypedEventEmitter<FlowEvent>(
      baseEmitter,
      eventToMessageSerializer("flow_event").eventToMessage,
    );
  }),
);
