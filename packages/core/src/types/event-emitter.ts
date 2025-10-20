import { Context, Effect, Layer } from "effect";
import type { UploadistaError } from "../errors";
import type { FlowEvent } from "../flow/event";
import type { UploadEvent } from "./upload-event";
import type { WebSocketConnection } from "./websocket";

// Base untyped EventEmitter interface - emits raw strings
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

// Typed EventEmitter interface - handles serialization/deserialization
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

// Typed wrapper class that uses a base event emitter with serialization
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

// Default JSON serialization helper
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

// Context tags
export class BaseEventEmitterService extends Context.Tag("BaseEventEmitter")<
  BaseEventEmitterService,
  BaseEventEmitter
>() {}

export class UploadEventEmitter extends Context.Tag("UploadEventEmitter")<
  UploadEventEmitter,
  EventEmitter<UploadEvent>
>() {}

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

export class FlowEventEmitter extends Context.Tag("FlowEventEmitter")<
  FlowEventEmitter,
  EventEmitter<FlowEvent>
>() {}

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
