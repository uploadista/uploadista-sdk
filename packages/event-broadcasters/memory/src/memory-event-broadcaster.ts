import type { EventBroadcaster } from "@uploadista/core/types";
import { EventBroadcasterService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

/**
 * In-memory event broadcaster for single-instance deployments.
 * Events are only broadcast within the same process/instance.
 * Use this for development or single-server deployments.
 */
export function createMemoryEventBroadcaster(): EventBroadcaster {
  const handlers = new Map<string, Set<(message: string) => void>>();

  return {
    publish: (channel: string, message: string) =>
      Effect.sync(() => {
        const channelHandlers = handlers.get(channel);

        if (channelHandlers) {
          for (const handler of channelHandlers) {
            handler(message);
          }
        }
      }),

    subscribe: (channel: string, handler: (message: string) => void) =>
      Effect.sync(() => {
        if (!handlers.has(channel)) {
          handlers.set(channel, new Set());
        }
        handlers.get(channel)?.add(handler);
      }),

    unsubscribe: (channel: string) =>
      Effect.sync(() => {
        handlers.delete(channel);
      }),
  };
}

/**
 * Layer for in-memory event broadcaster
 */
export const memoryEventBroadcaster = Layer.sync(
  EventBroadcasterService,
  createMemoryEventBroadcaster,
);
