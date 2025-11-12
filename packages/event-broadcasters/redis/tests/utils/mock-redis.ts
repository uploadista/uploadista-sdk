import type { RedisClientType } from "@redis/client";
import { vi } from "vitest";

type MessageCallback = (message: string, channel: string) => void;

export interface MockRedisClient {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  triggerMessage: (channel: string, message: string) => void;
  triggerError: (error: Error) => void;
}

export function createMockRedisClient(): MockRedisClient {
  const subscribers = new Map<string, Set<MessageCallback>>();
  let errorHandler: ((error: Error) => void) | null = null;

  return {
    publish: vi.fn().mockResolvedValue(1),

    subscribe: vi.fn().mockImplementation(
      async (channel: string, callback: MessageCallback) => {
        if (!subscribers.has(channel)) {
          subscribers.set(channel, new Set());
        }
        subscribers.get(channel)?.add(callback);
      },
    ),

    unsubscribe: vi.fn().mockResolvedValue(undefined),

    on: vi.fn().mockImplementation((event: string, handler: (error: Error) => void) => {
      if (event === "error") {
        errorHandler = handler;
      }
    }),

    triggerMessage: (channel: string, message: string) => {
      const channelSubs = subscribers.get(channel);
      if (channelSubs) {
        for (const callback of channelSubs) {
          callback(message, channel);
        }
      }
    },

    triggerError: (error: Error) => {
      if (errorHandler) {
        errorHandler(error);
      }
    },
  };
}

export function mockRedisClientAsType(mock: MockRedisClient): RedisClientType {
  return mock as unknown as RedisClientType;
}
