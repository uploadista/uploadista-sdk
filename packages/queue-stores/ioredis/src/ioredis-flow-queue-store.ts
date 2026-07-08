/**
 * IORedis-backed FlowQueueStore implementation.
 *
 * Uses the ioredis client directly. The API differs from node-redis in two key ways:
 * - `zadd` takes arguments as (key, score, member) rather than (key, member, score)
 * - `scan` returns [cursor, keys] as a tuple rather than { cursor, keys }
 *
 * Redis data layout (same as RedisFlowQueueStore):
 * - Each item is stored as a JSON string at key `uploadista:queue:item:<id>`
 * - Sorted set `uploadista:queue:pending` holds pending IDs scored by enqueuedAt ms (FIFO)
 * - Set `uploadista:queue:running` holds currently-running IDs
 *
 * @module queue-store-ioredis
 */

import { UploadistaError } from "@uploadista/core/errors";
import type {
  FlowQueueItem,
  FlowQueueItemStatus,
  FlowQueueStore,
} from "@uploadista/core/flow";
import { Effect } from "effect";

const ITEM_PREFIX = "uploadista:queue:item:";
const PENDING_ZSET = "uploadista:queue:pending";
const RUNNING_SET = "uploadista:queue:running";

/**
 * Minimal interface for an ioredis-compatible client.
 * Matches the ioredis Redis class surface used by this store.
 */
export interface IoRedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchOption: "MATCH",
    pattern: string,
    countOption: "COUNT",
    count: string,
  ): Promise<[string, string[]]>;
  zadd(key: string, score: number, member: string): Promise<number | string>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  zrem(key: string, ...members: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

/**
 * Configuration for IoRedisFlowQueueStore.
 *
 * @property redis - An ioredis-compatible client instance
 */
export interface IoRedisFlowQueueStoreConfig {
  /** An ioredis-compatible Redis client */
  redis: IoRedisLike;
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
 * IORedis-backed implementation of FlowQueueStore.
 *
 * Functionally identical to RedisFlowQueueStore but uses the ioredis API.
 * Queue items are persisted to Redis and survive process restarts.
 *
 * @example
 * ```typescript
 * import Redis from "ioredis";
 * import { IoRedisFlowQueueStore } from "@uploadista/queue-store-ioredis";
 * import { FlowQueueService } from "@uploadista/core/flow";
 *
 * const redis = new Redis({ host: "localhost", port: 6379 });
 * const store = new IoRedisFlowQueueStore({ redis });
 * const layer = FlowQueueService.make({ maxConcurrency: 8 }, store);
 * ```
 */
export class IoRedisFlowQueueStore implements FlowQueueStore {
  private readonly redis: IoRedisLike;

  constructor(config: IoRedisFlowQueueStoreConfig) {
    this.redis = config.redis;
  }

  createItem(
    item: FlowQueueItem,
  ): Effect.Effect<FlowQueueItem, UploadistaError> {
    return Effect.tryPromise({
      try: async () => {
        const key = `${ITEM_PREFIX}${item.id}`;
        const json = JSON.stringify(item);
        await this.redis.set(key, json);

        // Add to status-specific index
        if (item.status === "pending") {
          // ioredis zadd: (key, score, member)
          await this.redis.zadd(
            PENDING_ZSET,
            item.enqueuedAt.getTime(),
            item.id,
          );
        } else if (item.status === "running") {
          await this.redis.sadd(RUNNING_SET, item.id);
        }

        return item;
      },
      catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
    });
  }

  getItem(id: string): Effect.Effect<FlowQueueItem | null, UploadistaError> {
    return Effect.tryPromise({
      try: async () => {
        const json = await this.redis.get(`${ITEM_PREFIX}${id}`);
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
    return Effect.tryPromise({
      try: async () => {
        const key = `${ITEM_PREFIX}${id}`;
        const json = await this.redis.get(key);
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
            await this.redis.zrem(PENDING_ZSET, id);
          } else if (existing.status === "running") {
            await this.redis.srem(RUNNING_SET, id);
          }

          // Add to new index
          if (updated.status === "pending") {
            await this.redis.zadd(
              PENDING_ZSET,
              updated.enqueuedAt.getTime(),
              id,
            );
          } else if (updated.status === "running") {
            await this.redis.sadd(RUNNING_SET, id);
          }
        }

        await this.redis.set(key, JSON.stringify(updated));
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
    return Effect.tryPromise({
      try: async () => {
        let ids: string[] = [];

        if (status === "pending") {
          // FIFO order via sorted set (ascending scores = enqueuedAt ms)
          // ioredis zrange: (key, start, stop) — returns ascending by default
          ids = await this.redis.zrange(PENDING_ZSET, 0, -1);
        } else if (status === "running") {
          ids = await this.redis.smembers(RUNNING_SET);
        } else {
          // For completed/failed, scan all item keys and filter
          const allKeys: string[] = [];
          let cursor = "0";
          do {
            const [next, batch] = await this.redis.scan(
              cursor,
              "MATCH",
              `${ITEM_PREFIX}*`,
              "COUNT",
              "100",
            );
            cursor = next;
            allKeys.push(...batch);
          } while (cursor !== "0");

          const items: FlowQueueItem[] = [];
          for (const key of allKeys) {
            const json = await this.redis.get(key);
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
          const json = await this.redis.get(`${ITEM_PREFIX}${id}`);
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
    return Effect.tryPromise({
      try: async () => {
        // Remove from all indexes and delete the item key
        await Promise.all([
          this.redis.zrem(PENDING_ZSET, id),
          this.redis.srem(RUNNING_SET, id),
          this.redis.del(`${ITEM_PREFIX}${id}`),
        ]);
      },
      catch: (cause) => UploadistaError.fromCode("UNKNOWN_ERROR", { cause }),
    });
  }
}
