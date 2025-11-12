import type { Redis } from "ioredis";
import { vi } from "vitest";

export interface MockIORedisClient {
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  triggerMessage: (channel: string, message: string) => void;
}

export function createMockIORedisClient(): MockIORedisClient {
  const messageHandlers: Array<(channel: string, message: string) => void> = [];

  return {
    publish: vi.fn().mockResolvedValue(1),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),

    on: vi.fn().mockImplementation((event: string, handler: any) => {
      if (event === "message") {
        messageHandlers.push(handler);
      }
    }),

    triggerMessage: (channel: string, message: string) => {
      for (const handler of messageHandlers) {
        handler(channel, message);
      }
    },
  };
}

export function mockIORedisAsType(mock: MockIORedisClient): Redis {
  return mock as unknown as Redis;
}
