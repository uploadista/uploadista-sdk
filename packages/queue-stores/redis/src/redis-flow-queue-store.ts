/**
 * Redis-backed FlowQueueStore implementation.
 *
 * Uses the RedisLike interface from @uploadista/kv-store-redis so it works
 * with any compatible client (node-redis, ioredis-compatible wrappers, etc.).
 *
 * Redis data layout:
 * - Each item is stored as a JSON string at key `uploadista:queue:item:<id>`
 * - Sorted set `uploadista:queue:pending` holds pending IDs scored by enqueuedAt ms (FIFO)
 * - Set `uploadista:queue:running` holds currently-running IDs
 * - Completed and failed items are stored only in their hash key (no index needed)
 *
 * Items survive process restarts. On startup the worker loop re-claims
 * "pending" items from the sorted set in FIFO order.
 *
 * @module queue-store-redis
 */

import type { FlowQueueStore } from "@uploadista/core/flow";
import type { FlowQueueItem, FlowQueueItemStatus } from "@uploadista/core/flow";
import { UploadistaError } from "@uploadista/core/errors";
import type { RedisLike } from "@uploadista/kv-store-redis";
import { Effect } from "effect";

const ITEM_PREFIX = "uploadista:queue:item:";
const PENDING_ZSET = "uploadista:queue:pending";
const RUNNING_SET = "uploadista:queue:running";

/**
 * Configuration for RedisFlowQueueStore.
 *
 * @property redis - Any client satisfying the RedisLike interface
 */
export interface RedisFlowQueueStoreConfig {
  /** A Redis client satisfying the RedisLike interface */
  redis: RedisLike & {
    // Additional commands needed for queue store operations
    zadd(key: string, score: number, member: string): Promise<unknown>;
    zrange(key: string, start: string | number, stop: string | number, options?: { REV?: boolean }): Promise<string[]>;
    zrem(key: string, ...members: string[]): Promise<unknown>;
    sadd(key: string, ...members: string[]): Promise<unknown>;
    srem(key: string, ...members: string[]): Promise<unknown>;
    smembers(key: string): Promise<string[]>;
  };
}

/**
 * Parse date fields from a deserialized FlowQueueItem.
 * JSON serialization converts Date objects to ISO strings.
 */
function parseDates(item: FlowQueueItem): FlowQueueItem {
  return {
    ...item,
    enqueuedAt: new Date(item.enqueuedAt),
    startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
    completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
  };
}

/**
 * Redis-backed implementation of FlowQueueStore.
 *
 * Queue items are persisted to Redis and survive process restarts.
 * Multiple server instances sharing the same Redis connection will share
 * the queue state. (Note: distributed locking is not implemented — each
 * instance tracks its own concurrency via an in-process Ref.)
 *
 * @example
 * ```typescript
 * import { createClient } from "redis";
 * import { RedisFlowQueueStore } from "@uploadista/queue-store-redis";
 * import { FlowQueueService } from "@uploadista/core/flow";
 *
 * const redis = createClient({ url: process.env.REDIS_URL });
 * await redis.connect();
 *
 * const store = new RedisFlowQueueStore({ redis });
 * const layer = FlowQueueService.make({ maxConcurrency: 8 }, store);
 * ```
 */
export class RedisFlowQueueStore implements FlowQueueStore {
  private readonly redis: RedisFlowQueueStoreConfig["redis"];

  constructor(config: RedisFlowQueueStoreConfig) {
    this.redis = config.redis;
  }

  createItem(
    item: FlowQueueItem,
  ): Effect.Effect<FlowQueueItem, UploadistaError> {
    const self = this;
    return Effect.tryPromise({
      try: async () => {
        const key = `${ITEM_PREFIX}${item.id}`;
        const json = JSON.stringify(item);
        await self.redis.set(key, json);

        // Add to status-specific index
        if (item.status === "pending") {
          await self.redis.zadd(
            PENDING_ZSET,
            item.enqueuedAt.getTime(),
            item.id,
          );
        } else if (item.status === "running") {
          await self.redis.sadd(RUNNING_SET, item.id);
        }

        return item;
      },
      catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
    });
  }

  getItem(id: string): Effect.Effect<FlowQueueItem | null, UploadistaError> {
    const self = this;
    return Effect.tryPromise({
      try: async () => {
        const json = await self.redis.get(`${ITEM_PREFIX}${id}`);
        if (json === null) return null;
        return parseDates(JSON.parse(json) as FlowQueueItem);
      },
      catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
    });
  }

  updateItem(
    id: string,
    updates: Partial<FlowQueueItem>,
  ): Effect.Effect<FlowQueueItem, UploadistaError> {
    const self = this;
    return Effect.tryPromise({
      try: async () => {
        const key = `${ITEM_PREFIX}${id}`;
        const json = await self.redis.get(key);
        if (json === null) {
          throw UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
            body: `Queue item ${id} not found`,
          });
        }

        const existing = parseDates(JSON.parse(json) as FlowQueueItem);
        const updated: FlowQueueItem = { ...existing, ...updates };

        // Update status indexes when status changes
        if (updates.status && updates.status !== existing.status) {
          // Remove from old index
          if (existing.status === "pending") {
            await self.redis.zrem(PENDING_ZSET, id);
          } else if (existing.status === "running") {
            await self.redis.srem(RUNNING_SET, id);
          }

          // Add to new index
          if (updated.status === "pending") {
            await self.redis.zadd(
              PENDING_ZSET,
              updated.enqueuedAt.getTime(),
              id,
            );
          } else if (updated.status === "running") {
            await self.redis.sadd(RUNNING_SET, id);
          }
        }

        await self.redis.set(key, JSON.stringify(updated));
        return updated;
      },
      catch: (cause) => {
        if (cause instanceof UploadistaError) return cause;
        return UploadistaError.fromCode("UNKNOWN_ERROR", { cause });
      },
    });
  }

  listByStatus(
    status: FlowQueueItemStatus,
  ): Effect.Effect<FlowQueueItem[], UploadistaError> {
    const self = this;
    return Effect.tryPromise({
      try: async () => {
        let ids: string[] = [];

        if (status === "pending") {
          // FIFO order via sorted set (score = enqueuedAt ms, ascending)
          ids = await self.redis.zrange(PENDING_ZSET, 0, -1);
        } else if (status === "running") {
          ids = await self.redis.smembers(RUNNING_SET);
        } else {
          // For completed/failed, scan all item keys and filter by status
          const scanResult = await self.redis.scan("0", {
            MATCH: `${ITEM_PREFIX}*`,
            COUNT: 100,
          });
          // Collect all keys via cursor iteration
          let cursor = scanResult.cursor;
          const allKeys = [...scanResult.keys];
          while (cursor !== 0 && cursor !== "0") {
            const next = await self.redis.scan(cursor, {
              MATCH: `${ITEM_PREFIX}*`,
              COUNT: 100,
            });
            cursor = next.cursor;
            allKeys.push(...next.keys);
          }

          const items: FlowQueueItem[] = [];
          for (const key of allKeys) {
            const json = await self.redis.get(key);
            if (json) {
              const item = parseDates(JSON.parse(json) as FlowQueueItem);
              if (item.status === status) {
                items.push(item);
              }
            }
          }
          return items;
        }

        // Fetch items for pending/running by IDs
        const items: FlowQueueItem[] = [];
        for (const id of ids) {
          const json = await self.redis.get(`${ITEM_PREFIX}${id}`);
          if (json) {
            items.push(parseDates(JSON.parse(json) as FlowQueueItem));
          }
        }
        return items;
      },
      catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
    });
  }

  deleteItem(id: string): Effect.Effect<void, UploadistaError> {
    const self = this;
    return Effect.tryPromise({
      try: async () => {
        // Remove from all indexes
        await Promise.all([
          self.redis.zrem(PENDING_ZSET, id),
          self.redis.srem(RUNNING_SET, id),
          self.redis.del(`${ITEM_PREFIX}${id}`),
        ]);
      },
      catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
    });
  }
}
