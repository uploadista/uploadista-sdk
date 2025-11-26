/**
 * Dead Letter Queue service for capturing and retrying failed flow jobs.
 *
 * This module provides a comprehensive DLQ implementation that:
 * - Captures failed flow jobs with full context for debugging
 * - Supports configurable retry policies with backoff strategies
 * - Enables automatic scheduled retries and manual intervention
 * - Provides admin operations for DLQ management
 *
 * @module flow/dead-letter-queue
 * @see {@link DeadLetterItem} for the DLQ item structure
 * @see {@link RetryPolicy} for retry configuration
 */

import { Context, Effect, Layer, Option } from "effect";
import type { UploadistaError } from "../errors";
import { DeadLetterQueueKVStore } from "../types/kv-store";
import type {
  DeadLetterCleanupOptions,
  DeadLetterCleanupResult,
  DeadLetterItem,
  DeadLetterItemStatus,
  DeadLetterListOptions,
  DeadLetterQueueStats,
} from "./types/dead-letter-item";
import type { FlowJob } from "./types/flow-job";
import {
  calculateBackoffDelay,
  calculateExpirationDate,
  DEFAULT_RETRY_POLICY,
  isErrorRetryable,
  type RetryPolicy,
} from "./types/retry-policy";

/**
 * Shape of the Dead Letter Queue service.
 *
 * Provides all operations for managing failed flow jobs including
 * adding items, querying, retrying, and cleanup.
 */
export interface DeadLetterQueueServiceShape {
  /**
   * Add a failed job to the DLQ with full failure context.
   *
   * @param job - The failed flow job
   * @param error - The error that caused the failure
   * @param retryPolicy - Optional retry policy (uses default if not provided)
   * @returns The created DLQ item
   */
  add(
    job: FlowJob,
    error: UploadistaError,
    retryPolicy?: RetryPolicy,
  ): Effect.Effect<DeadLetterItem, UploadistaError>;

  /**
   * Get a specific DLQ item by ID.
   *
   * @param itemId - The DLQ item ID
   * @returns The DLQ item
   */
  get(itemId: string): Effect.Effect<DeadLetterItem, UploadistaError>;

  /**
   * Get a DLQ item by ID, returning None if not found.
   *
   * @param itemId - The DLQ item ID
   * @returns Option of the DLQ item
   */
  getOption(
    itemId: string,
  ): Effect.Effect<Option.Option<DeadLetterItem>, UploadistaError>;

  /**
   * Delete a DLQ item.
   *
   * @param itemId - The DLQ item ID to delete
   */
  delete(itemId: string): Effect.Effect<void, UploadistaError>;

  /**
   * List DLQ items with optional filtering and pagination.
   *
   * @param options - Filter and pagination options
   * @returns List of items and total count
   */
  list(
    options?: DeadLetterListOptions,
  ): Effect.Effect<{ items: DeadLetterItem[]; total: number }, UploadistaError>;

  /**
   * Update a DLQ item.
   *
   * @param itemId - The DLQ item ID
   * @param updates - Partial updates to apply
   * @returns The updated item
   */
  update(
    itemId: string,
    updates: Partial<DeadLetterItem>,
  ): Effect.Effect<DeadLetterItem, UploadistaError>;

  /**
   * Mark a DLQ item as being retried.
   *
   * @param itemId - The DLQ item ID
   * @returns The updated item with status "retrying"
   */
  markRetrying(itemId: string): Effect.Effect<DeadLetterItem, UploadistaError>;

  /**
   * Record a failed retry attempt.
   *
   * @param itemId - The DLQ item ID
   * @param error - Error message from the failed retry
   * @param durationMs - Duration of the retry attempt
   * @returns The updated item
   */
  recordRetryFailure(
    itemId: string,
    error: string,
    durationMs: number,
  ): Effect.Effect<DeadLetterItem, UploadistaError>;

  /**
   * Mark a DLQ item as resolved (successfully retried or manually resolved).
   *
   * @param itemId - The DLQ item ID
   * @returns The updated item with status "resolved"
   */
  markResolved(itemId: string): Effect.Effect<DeadLetterItem, UploadistaError>;

  /**
   * Get items that are due for scheduled retry.
   *
   * @param limit - Maximum number of items to return
   * @returns List of items ready for retry
   */
  getScheduledRetries(
    limit?: number,
  ): Effect.Effect<DeadLetterItem[], UploadistaError>;

  /**
   * Cleanup old DLQ items based on options.
   *
   * @param options - Cleanup criteria
   * @returns Number of items deleted
   */
  cleanup(
    options?: DeadLetterCleanupOptions,
  ): Effect.Effect<DeadLetterCleanupResult, UploadistaError>;

  /**
   * Get DLQ statistics.
   *
   * @returns Aggregate statistics about the DLQ
   */
  getStats(): Effect.Effect<DeadLetterQueueStats, UploadistaError>;
}

/**
 * Effect-TS context tag for the Dead Letter Queue service.
 *
 * @example
 * ```typescript
 * const effect = Effect.gen(function* () {
 *   const dlq = yield* DeadLetterQueueService;
 *   const stats = yield* dlq.getStats();
 *   console.log(`DLQ has ${stats.totalItems} items`);
 * });
 * ```
 */
export class DeadLetterQueueService extends Context.Tag(
  "DeadLetterQueueService",
)<DeadLetterQueueService, DeadLetterQueueServiceShape>() {
  /**
   * Access the DLQ service optionally (for integration in FlowServer).
   * Returns Option.none if the service is not provided.
   */
  static optional = Effect.serviceOption(DeadLetterQueueService);
}

/**
 * Creates the Dead Letter Queue service implementation.
 *
 * @returns Effect that creates the DLQ service
 */
export function createDeadLetterQueueService(): Effect.Effect<
  DeadLetterQueueServiceShape,
  never,
  DeadLetterQueueKVStore
> {
  return Effect.gen(function* () {
    const kvStore = yield* DeadLetterQueueKVStore;

    /**
     * Generate a unique DLQ item ID.
     */
    const generateId = (): string => `dlq_${crypto.randomUUID()}`;

    /**
     * Parse dates from a deserialized DLQ item.
     * JSON serialization converts Date objects to strings.
     */
    const parseDates = (item: DeadLetterItem): DeadLetterItem => ({
      ...item,
      createdAt: new Date(item.createdAt),
      updatedAt: new Date(item.updatedAt),
      expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
      nextRetryAt: item.nextRetryAt ? new Date(item.nextRetryAt) : undefined,
      retryHistory: item.retryHistory.map((attempt) => ({
        ...attempt,
        attemptedAt: new Date(attempt.attemptedAt),
      })),
    });

    /**
     * Get all items from the KV store (for filtering/stats).
     * Note: This relies on the list() operation being supported.
     */
    const getAllItems = (): Effect.Effect<DeadLetterItem[], UploadistaError> =>
      Effect.gen(function* () {
        if (!kvStore.list) {
          return [];
        }
        const keys = yield* kvStore.list();
        const items: DeadLetterItem[] = [];
        for (const key of keys) {
          const item = yield* Effect.catchAll(kvStore.get(key), () =>
            Effect.succeed(null as DeadLetterItem | null),
          );
          if (item) {
            items.push(parseDates(item));
          }
        }
        return items;
      });

    return {
      add: (job, error, retryPolicy = DEFAULT_RETRY_POLICY) =>
        Effect.gen(function* () {
          const id = generateId();
          const now = new Date();

          // Extract error details
          const errorDetails = {
            code: error.code || "UNKNOWN_ERROR",
            message: error.body || error.message || "Unknown error",
            nodeId: undefined as string | undefined,
            stack: error.stack,
          };

          // Find the failed node from job tasks
          const failedTask = job.tasks.find((t) => t.status === "failed");
          if (failedTask) {
            errorDetails.nodeId = failedTask.nodeId;
          }

          // Extract node results from completed tasks
          const nodeResults: Record<string, unknown> = {};
          for (const task of job.tasks) {
            if (task.result !== undefined) {
              nodeResults[task.nodeId] = task.result;
            }
          }

          // Determine if error is retryable
          const isRetryable = isErrorRetryable(errorDetails.code, retryPolicy);

          // Calculate next retry time if auto-retry is enabled
          let nextRetryAt: Date | undefined;
          if (
            retryPolicy.enabled &&
            isRetryable &&
            retryPolicy.maxRetries > 0
          ) {
            const delay = calculateBackoffDelay(retryPolicy.backoff, 0);
            nextRetryAt = new Date(now.getTime() + delay);
          }

          const item: DeadLetterItem = {
            id,
            jobId: job.id,
            flowId: job.flowId,
            storageId: job.storageId,
            clientId: job.clientId,
            error: errorDetails,
            inputs: job.executionState?.inputs || {},
            nodeResults,
            failedAtNodeId: errorDetails.nodeId,
            retryCount: 0,
            maxRetries: retryPolicy.maxRetries,
            nextRetryAt,
            retryHistory: [],
            createdAt: now,
            updatedAt: now,
            expiresAt: calculateExpirationDate(now, retryPolicy.ttlMs),
            status:
              isRetryable && retryPolicy.enabled ? "pending" : "exhausted",
          };

          yield* kvStore.set(id, item);
          return item;
        }),

      get: (itemId) =>
        Effect.gen(function* () {
          const item = yield* kvStore.get(itemId);
          return parseDates(item);
        }),

      getOption: (itemId) =>
        Effect.gen(function* () {
          const result = yield* Effect.either(kvStore.get(itemId));
          if (result._tag === "Left") {
            // Check if it's a "not found" error
            if (result.left.code === "FILE_NOT_FOUND") {
              return Option.none<DeadLetterItem>();
            }
            return yield* Effect.fail(result.left);
          }
          return Option.some(parseDates(result.right));
        }),

      delete: (itemId) => kvStore.delete(itemId),

      list: (options = {}) =>
        Effect.gen(function* () {
          const allItems = yield* getAllItems();
          const { status, flowId, clientId, limit = 50, offset = 0 } = options;

          // Filter items
          let filtered = allItems;
          if (status) {
            filtered = filtered.filter((item) => item.status === status);
          }
          if (flowId) {
            filtered = filtered.filter((item) => item.flowId === flowId);
          }
          if (clientId) {
            filtered = filtered.filter((item) => item.clientId === clientId);
          }

          // Sort by createdAt descending (newest first)
          filtered.sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
          );

          const total = filtered.length;
          const items = filtered.slice(offset, offset + limit);

          return { items, total };
        }),

      update: (itemId, updates) =>
        Effect.gen(function* () {
          const rawItem = yield* kvStore.get(itemId);
          const item = parseDates(rawItem);
          const updatedItem: DeadLetterItem = {
            ...item,
            ...updates,
            updatedAt: new Date(),
          };
          yield* kvStore.set(itemId, updatedItem);
          return updatedItem;
        }),

      markRetrying: (itemId) =>
        Effect.gen(function* () {
          const rawItem = yield* kvStore.get(itemId);
          const item = parseDates(rawItem);
          const updatedItem: DeadLetterItem = {
            ...item,
            status: "retrying",
            updatedAt: new Date(),
          };
          yield* kvStore.set(itemId, updatedItem);
          return updatedItem;
        }),

      recordRetryFailure: (itemId, error, durationMs) =>
        Effect.gen(function* () {
          const rawItem = yield* kvStore.get(itemId);
          const item = parseDates(rawItem);
          const now = new Date();
          const newRetryCount = item.retryCount + 1;

          // Add to retry history
          const retryHistory = [
            ...item.retryHistory,
            {
              attemptedAt: now,
              error,
              durationMs,
            },
          ];

          // Determine new status and next retry time
          let status: DeadLetterItemStatus = "pending";
          let nextRetryAt: Date | undefined;

          if (newRetryCount >= item.maxRetries) {
            // Max retries reached
            status = "exhausted";
            nextRetryAt = undefined;
          } else {
            // Calculate next retry time with backoff
            const delay = calculateBackoffDelay(
              DEFAULT_RETRY_POLICY.backoff,
              newRetryCount,
            );
            nextRetryAt = new Date(now.getTime() + delay);
          }

          const updatedItem: DeadLetterItem = {
            ...item,
            retryCount: newRetryCount,
            retryHistory,
            status,
            nextRetryAt,
            updatedAt: now,
          };

          yield* kvStore.set(itemId, updatedItem);
          return updatedItem;
        }),

      markResolved: (itemId) =>
        Effect.gen(function* () {
          const rawItem = yield* kvStore.get(itemId);
          const item = parseDates(rawItem);
          const updatedItem: DeadLetterItem = {
            ...item,
            status: "resolved",
            nextRetryAt: undefined,
            updatedAt: new Date(),
          };
          yield* kvStore.set(itemId, updatedItem);
          return updatedItem;
        }),

      getScheduledRetries: (limit = 100) =>
        Effect.gen(function* () {
          const allItems = yield* getAllItems();
          const now = new Date();

          // Filter items that are:
          // 1. Status is "pending"
          // 2. nextRetryAt is in the past or now
          const readyItems = allItems
            .filter(
              (item) =>
                item.status === "pending" &&
                item.nextRetryAt &&
                item.nextRetryAt <= now,
            )
            .sort((a, b) => {
              // Sort by nextRetryAt ascending (oldest first)
              const aTime = a.nextRetryAt?.getTime() || 0;
              const bTime = b.nextRetryAt?.getTime() || 0;
              return aTime - bTime;
            })
            .slice(0, limit);

          return readyItems;
        }),

      cleanup: (options = {}) =>
        Effect.gen(function* () {
          const allItems = yield* getAllItems();
          const { olderThan, status } = options;
          const now = new Date();
          let deleted = 0;

          for (const item of allItems) {
            let shouldDelete = false;

            // Check expiration
            if (item.expiresAt && item.expiresAt <= now) {
              shouldDelete = true;
            }

            // Check age
            if (olderThan && item.createdAt <= olderThan) {
              // If status filter is specified, only delete matching status
              if (status) {
                shouldDelete = item.status === status;
              } else if (
                item.status === "exhausted" ||
                item.status === "resolved"
              ) {
                // Without status filter, only delete exhausted/resolved
                shouldDelete = true;
              }
            }

            if (shouldDelete) {
              yield* Effect.catchAll(kvStore.delete(item.id), () =>
                Effect.succeed(undefined),
              );
              deleted++;
            }
          }

          return { deleted };
        }),

      getStats: () =>
        Effect.gen(function* () {
          const allItems = yield* getAllItems();

          const byStatus: Record<DeadLetterItemStatus, number> = {
            pending: 0,
            retrying: 0,
            exhausted: 0,
            resolved: 0,
          };

          const byFlow: Record<string, number> = {};
          let oldestItem: Date | undefined;
          let totalRetryCount = 0;

          for (const item of allItems) {
            // Count by status
            byStatus[item.status]++;

            // Count by flow
            byFlow[item.flowId] = (byFlow[item.flowId] || 0) + 1;

            // Track oldest item
            if (!oldestItem || item.createdAt < oldestItem) {
              oldestItem = item.createdAt;
            }

            // Sum retry counts
            totalRetryCount += item.retryCount;
          }

          const averageRetryCount =
            allItems.length > 0 ? totalRetryCount / allItems.length : 0;

          return {
            totalItems: allItems.length,
            byStatus,
            byFlow,
            oldestItem,
            averageRetryCount,
          };
        }),
    } satisfies DeadLetterQueueServiceShape;
  });
}

/**
 * Effect Layer that creates the DeadLetterQueueService.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const dlq = yield* DeadLetterQueueService;
 *   const stats = yield* dlq.getStats();
 *   return stats;
 * }).pipe(
 *   Effect.provide(deadLetterQueueService),
 *   Effect.provide(deadLetterQueueKvStore),
 *   Effect.provide(baseStoreLayer)
 * );
 * ```
 */
export const deadLetterQueueService = Layer.effect(
  DeadLetterQueueService,
  createDeadLetterQueueService(),
);
