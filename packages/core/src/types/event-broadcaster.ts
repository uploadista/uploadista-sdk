import { Context, type Effect } from "effect";
import type { UploadistaError } from "../errors";

/**
 * Event broadcaster interface for pub/sub messaging across distributed instances.
 * Used by WebSocketManager to broadcast upload events to all connected instances.
 */
export interface EventBroadcaster {
  /**
   * Publish a message to a channel
   */
  readonly publish: (
    channel: string,
    message: string,
  ) => Effect.Effect<void, UploadistaError>;

  /**
   * Subscribe to messages on a channel
   */
  readonly subscribe: (
    channel: string,
    handler: (message: string) => void,
  ) => Effect.Effect<void, UploadistaError>;

  /**
   * Unsubscribe from a channel (optional - not all implementations may support)
   */
  readonly unsubscribe?: (
    channel: string,
  ) => Effect.Effect<void, UploadistaError>;
}

/**
 * Context tag for EventBroadcaster service
 */
export class EventBroadcasterService extends Context.Tag("EventBroadcaster")<
  EventBroadcasterService,
  EventBroadcaster
>() {}
