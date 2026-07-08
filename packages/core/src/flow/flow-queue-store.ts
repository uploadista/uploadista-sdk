/**
 * Flow Queue Store adapter interface and in-memory default implementation.
 *
 * The FlowQueueStore defines the persistence contract for queue items. Any
 * backend can be used by implementing this interface — in-memory (default),
 * Redis, filesystem, etc.
 *
 * @module flow/flow-queue-store
 * @see {@link FlowQueueService} for the queue service that uses this store
 */

import { Effect } from "effect";
import { UploadistaError } from "../errors";
import type {
  FlowQueueItem,
  FlowQueueItemStatus,
} from "./types/flow-queue-item";

/**
 * Adapter interface for flow queue item persistence.
 *
 * Implementations must provide CRUD operations for FlowQueueItems and an
 * efficient status-based listing. Redis implementations use sorted sets and
 * sets for O(log n) lookups; the memory implementation uses a plain Map.
 *
 * @example
 * ```typescript
 * // Provide a custom store via the Effect layer
 * const customStore: FlowQueueStore = { ... };
 * ```
 */
export interface FlowQueueStore {
  /**
   * Persist a new queue item.
   *
   * @param item - The fully-constructed FlowQueueItem to store
   * @returns The stored item
   */
  createItem(
    item: FlowQueueItem,
  ): Effect.Effect<FlowQueueItem, UploadistaError>;

  /**
   * Retrieve a queue item by ID.
   *
   * @param id - The queue item ID
   * @returns The item, or null if not found
   */
  getItem(id: string): Effect.Effect<FlowQueueItem | null, UploadistaError>;

  /**
   * Apply partial updates to an existing queue item.
   *
   * The implementation must atomically update the item and any status-based
   * indexes (e.g., Redis sorted sets) when status changes.
   *
   * @param id - The queue item ID
   * @param updates - Fields to update (merged over the existing item)
   * @returns The fully-updated item
   */
  updateItem(
    id: string,
    updates: Partial<FlowQueueItem>,
  ): Effect.Effect<FlowQueueItem, UploadistaError>;

  /**
   * List all items with a specific status.
   *
   * For "pending" items, results SHOULD be returned in FIFO order (oldest first)
   * so that the worker loop dispatches items in enqueuedAt order.
   *
   * @param status - The status to filter by
   * @returns Array of matching items
   */
  listByStatus(
    status: FlowQueueItemStatus,
  ): Effect.Effect<FlowQueueItem[], UploadistaError>;

  /**
   * Remove a queue item from the store.
   *
   * @param id - The queue item ID to remove
   */
  deleteItem(id: string): Effect.Effect<void, UploadistaError>;
}

/**
 * In-memory implementation of FlowQueueStore.
 *
 * Uses a plain Map for storage. Items are not persisted across process restarts.
 * Suitable for single-process deployments or development/testing.
 *
 * For durability across restarts, use RedisFlowQueueStore or IoRedisFlowQueueStore.
 *
 * @example
 * ```typescript
 * const store = new MemoryFlowQueueStore();
 * // Pass to FlowQueueService.make(config, store)
 * ```
 */
export class MemoryFlowQueueStore implements FlowQueueStore {
  private readonly items = new Map<string, FlowQueueItem>();

  createItem(
    item: FlowQueueItem,
  ): Effect.Effect<FlowQueueItem, UploadistaError> {
    return Effect.sync(() => {
      this.items.set(item.id, { ...item });
      return item;
    });
  }

  getItem(id: string): Effect.Effect<FlowQueueItem | null, UploadistaError> {
    return Effect.sync(() => {
      return this.items.get(id) ?? null;
    });
  }

  updateItem(
    id: string,
    updates: Partial<FlowQueueItem>,
  ): Effect.Effect<FlowQueueItem, UploadistaError> {
    return Effect.suspend(() => {
      const existing = this.items.get(id);
      if (!existing) {
        return Effect.fail(
          UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
            body: `Queue item ${id} not found`,
          }),
        );
      }
      const updated: FlowQueueItem = { ...existing, ...updates };
      this.items.set(id, updated);
      return Effect.succeed(updated);
    });
  }

  listByStatus(
    status: FlowQueueItemStatus,
  ): Effect.Effect<FlowQueueItem[], UploadistaError> {
    return Effect.sync(() => {
      const result: FlowQueueItem[] = [];
      for (const item of this.items.values()) {
        if (item.status === status) {
          result.push({ ...item });
        }
      }
      // Return in FIFO order for pending items
      if (status === "pending") {
        result.sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime());
      }
      return result;
    });
  }

  deleteItem(id: string): Effect.Effect<void, UploadistaError> {
    return Effect.sync(() => {
      this.items.delete(id);
    });
  }
}
