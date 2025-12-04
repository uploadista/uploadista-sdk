/**
 * Integration tests for the Dead Letter Queue service
 *
 * Covers:
 * - Adding failed jobs to DLQ
 * - Retrieving DLQ items
 * - Listing with filters
 * - Retry status transitions
 * - Cleanup operations
 * - Statistics calculation
 */

import { it } from "@effect/vitest";
import { Context, Effect, Layer, Option } from "effect";
import { describe, expect } from "vitest";
import { UploadistaError } from "../../src/errors";
import {
  createDeadLetterQueueService,
  DeadLetterQueueService,
} from "../../src/flow/dead-letter-queue";
import type { DeadLetterItem } from "../../src/flow/types/dead-letter-item";
import type { FlowJob } from "../../src/flow/types/flow-job";
import {
  BaseKvStoreService,
  DeadLetterQueueKVStore,
  deadLetterQueueKvStore,
  type BaseKvStore,
} from "../../src/types/kv-store";

// In-memory KV store for testing
const createInMemoryKvStore = (): BaseKvStore => {
  const store = new Map<string, string>();

  return {
    get: (key: string) =>
      Effect.gen(function* () {
        const value = store.get(key);
        if (value === undefined) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FILE_NOT_FOUND", {
              cause: `Key ${key} not found`,
            }),
          );
        }
        return value;
      }),
    set: (key: string, value: string) =>
      Effect.gen(function* () {
        store.set(key, value);
      }),
    delete: (key: string) =>
      Effect.gen(function* () {
        store.delete(key);
      }),
    list: (prefix: string) =>
      Effect.succeed([...store.keys()].filter((key) => key.startsWith(prefix))),
  };
};

// Create test layers
const createTestLayers = () => {
  const inMemoryStore = createInMemoryKvStore();
  const baseKvStoreLayer = Layer.succeed(BaseKvStoreService, inMemoryStore);

  return Layer.provide(deadLetterQueueKvStore, baseKvStoreLayer);
};

// Create a mock FlowJob for testing
const createMockFlowJob = (overrides?: Partial<FlowJob>): FlowJob => ({
  id: `job_${Date.now()}`,
  flowId: "test-flow",
  storageId: "test-storage",
  clientId: "test-client",
  status: "failed",
  tasks: [
    {
      nodeId: "input-node",
      nodeName: "Input Node",
      status: "completed",
      result: { file: { id: "file_123" } },
    },
    {
      nodeId: "process-node",
      nodeName: "Process Node",
      status: "failed",
    },
  ],
  createdAt: new Date(),
  updatedAt: new Date(),
  executionState: {
    executionOrder: ["input-node", "process-node"],
    currentIndex: 1,
    inputs: { input: { uploadId: "upload_123" } },
  },
  ...overrides,
});

describe("DeadLetterQueueService", () => {
  describe("add", () => {
    it.effect("should add a failed job to the DLQ", () =>
      Effect.gen(function* () {
        const dlqStore = yield* DeadLetterQueueKVStore;
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR", {
          body: "Processing failed",
        });

        const item = yield* service.add(job, error);

        expect(item.id).toMatch(/^dlq_/);
        expect(item.jobId).toBe(job.id);
        expect(item.flowId).toBe("test-flow");
        expect(item.storageId).toBe("test-storage");
        expect(item.clientId).toBe("test-client");
        expect(item.error.code).toBe("FLOW_NODE_ERROR");
        expect(item.error.message).toBe("Processing failed");
        expect(item.retryCount).toBe(0);
        expect(item.maxRetries).toBe(3); // Default
        expect(item.status).toBe("pending");
        expect(item.retryHistory).toHaveLength(0);
        expect(item.createdAt).toBeInstanceOf(Date);
        expect(item.updatedAt).toBeInstanceOf(Date);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should capture node results from completed tasks", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob({
          tasks: [
            {
              nodeId: "input-node",
              nodeName: "Input",
              status: "completed",
              result: { file: { id: "file_123", size: 1024 } },
            },
            {
              nodeId: "resize-node",
              nodeName: "Resize",
              status: "completed",
              result: { thumbnail: { width: 200, height: 150 } },
            },
            {
              nodeId: "output-node",
              nodeName: "Output",
              status: "failed",
            },
          ],
        });
        const error = new UploadistaError({
          code: "STORAGE_ERROR",
          status: 500,
          body: "Upload failed",
        });

        const item = yield* service.add(job, error);

        expect(item.nodeResults["input-node"]).toEqual({
          file: { id: "file_123", size: 1024 },
        });
        expect(item.nodeResults["resize-node"]).toEqual({
          thumbnail: { width: 200, height: 150 },
        });
        expect(item.failedAtNodeId).toBe("output-node");
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should use custom retry policy when provided", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");

        const item = yield* service.add(job, error, {
          enabled: true,
          maxRetries: 10,
          backoff: { type: "immediate" },
          ttlMs: 86400000, // 1 day
        });

        expect(item.maxRetries).toBe(10);
        expect(item.expiresAt).toBeDefined();
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should mark as exhausted for non-retryable errors", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("VALIDATION_ERROR");

        const item = yield* service.add(job, error, {
          enabled: true,
          maxRetries: 3,
          backoff: { type: "immediate" },
          nonRetryableErrors: ["VALIDATION_ERROR"],
        });

        expect(item.status).toBe("exhausted");
        expect(item.nextRetryAt).toBeUndefined();
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("get and getOption", () => {
    it.effect("should retrieve an existing item", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        const retrieved = yield* service.get(added.id);

        expect(retrieved.id).toBe(added.id);
        expect(retrieved.jobId).toBe(job.id);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should fail when item not found", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const result = yield* Effect.either(service.get("non-existent-id"));

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should return Option.none for non-existent item", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const result = yield* service.getOption("non-existent-id");

        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should return Option.some for existing item", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        const result = yield* service.getOption(added.id);

        expect(Option.isSome(result)).toBe(true);
        if (Option.isSome(result)) {
          expect(result.value.id).toBe(added.id);
        }
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("list", () => {
    it.effect("should list all items", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        // Add multiple items
        const job1 = createMockFlowJob({ id: "job_1" });
        const job2 = createMockFlowJob({ id: "job_2" });
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");

        yield* service.add(job1, error);
        yield* service.add(job2, error);

        const { items, total } = yield* service.list();

        expect(items).toHaveLength(2);
        expect(total).toBe(2);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should filter by status", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job1 = createMockFlowJob({ id: "job_1" });
        const job2 = createMockFlowJob({ id: "job_2" });
        const retryableError = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const nonRetryableError = UploadistaError.fromCode("VALIDATION_ERROR");

        yield* service.add(job1, retryableError);
        yield* service.add(job2, nonRetryableError, {
          enabled: true,
          maxRetries: 0,
          backoff: { type: "immediate" },
        });

        // Update second item to exhausted
        const { items: allItems } = yield* service.list();
        const job2Item = allItems.find((i) => i.jobId === "job_2");
        if (job2Item) {
          yield* service.update(job2Item.id, { status: "exhausted" });
        }

        const { items: pendingItems } = yield* service.list({
          status: "pending",
        });
        const { items: exhaustedItems } = yield* service.list({
          status: "exhausted",
        });

        expect(pendingItems.every((i) => i.status === "pending")).toBe(true);
        expect(exhaustedItems.every((i) => i.status === "exhausted")).toBe(true);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should filter by flowId", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job1 = createMockFlowJob({ id: "job_1", flowId: "flow-a" });
        const job2 = createMockFlowJob({ id: "job_2", flowId: "flow-b" });
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");

        yield* service.add(job1, error);
        yield* service.add(job2, error);

        const { items } = yield* service.list({ flowId: "flow-a" });

        expect(items).toHaveLength(1);
        expect(items[0]?.flowId).toBe("flow-a");
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should paginate results", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        // Add 5 items
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        for (let i = 0; i < 5; i++) {
          const job = createMockFlowJob({ id: `job_${i}` });
          yield* service.add(job, error);
        }

        const { items: page1, total } = yield* service.list({
          limit: 2,
          offset: 0,
        });
        const { items: page2 } = yield* service.list({ limit: 2, offset: 2 });

        expect(total).toBe(5);
        expect(page1).toHaveLength(2);
        expect(page2).toHaveLength(2);
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("markRetrying and recordRetryFailure", () => {
    it.effect("should transition to retrying status", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        const updated = yield* service.markRetrying(added.id);

        expect(updated.status).toBe("retrying");
        // updatedAt should be at least the same or later (timing can be same millisecond)
        expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
          added.updatedAt.getTime(),
        );
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should record retry failure and increment count", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        yield* service.markRetrying(added.id);
        const afterFailure = yield* service.recordRetryFailure(
          added.id,
          "Timeout error",
          5000,
        );

        expect(afterFailure.retryCount).toBe(1);
        expect(afterFailure.status).toBe("pending");
        expect(afterFailure.retryHistory).toHaveLength(1);
        expect(afterFailure.retryHistory[0]?.error).toBe("Timeout error");
        expect(afterFailure.retryHistory[0]?.durationMs).toBe(5000);
        expect(afterFailure.nextRetryAt).toBeDefined();
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should mark as exhausted when max retries reached", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error, {
          enabled: true,
          maxRetries: 2,
          backoff: { type: "immediate" },
        });

        // First retry
        yield* service.markRetrying(added.id);
        yield* service.recordRetryFailure(added.id, "Error 1", 1000);

        // Second retry (exhausts)
        yield* service.markRetrying(added.id);
        const afterSecondFailure = yield* service.recordRetryFailure(
          added.id,
          "Error 2",
          1000,
        );

        expect(afterSecondFailure.retryCount).toBe(2);
        expect(afterSecondFailure.status).toBe("exhausted");
        expect(afterSecondFailure.nextRetryAt).toBeUndefined();
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("markResolved", () => {
    it.effect("should transition to resolved status", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        const resolved = yield* service.markResolved(added.id);

        expect(resolved.status).toBe("resolved");
        expect(resolved.nextRetryAt).toBeUndefined();
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("delete", () => {
    it.effect("should delete an item", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        yield* service.delete(added.id);

        const result = yield* service.getOption(added.id);
        expect(Option.isNone(result)).toBe(true);
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("getScheduledRetries", () => {
    it.effect("should return items ready for retry", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error, {
          enabled: true,
          maxRetries: 3,
          backoff: { type: "immediate" }, // Immediate retry
        });

        // Item should be immediately ready for retry
        const readyItems = yield* service.getScheduledRetries();

        expect(readyItems.length).toBeGreaterThanOrEqual(1);
        expect(readyItems.some((i) => i.id === added.id)).toBe(true);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should respect limit parameter", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        // Add multiple items
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        for (let i = 0; i < 5; i++) {
          const job = createMockFlowJob({ id: `job_${i}` });
          yield* service.add(job, error, {
            enabled: true,
            maxRetries: 3,
            backoff: { type: "immediate" },
          });
        }

        const readyItems = yield* service.getScheduledRetries(2);

        expect(readyItems).toHaveLength(2);
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("cleanup", () => {
    it.effect("should cleanup items based on olderThan", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");

        // Add item
        const added = yield* service.add(job, error);

        // Mark as resolved (so it can be cleaned up)
        yield* service.markResolved(added.id);

        // Cleanup with a future date (should catch all)
        const futureDate = new Date(Date.now() + 1000000);
        const result = yield* service.cleanup({
          olderThan: futureDate,
          status: "resolved",
        });

        expect(result.deleted).toBeGreaterThanOrEqual(1);

        const check = yield* service.getOption(added.id);
        expect(Option.isNone(check)).toBe(true);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should cleanup resolved items older than threshold", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const job = createMockFlowJob();
        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");
        const added = yield* service.add(job, error);

        // Mark as resolved
        yield* service.markResolved(added.id);

        // Cleanup items older than future date (should catch all)
        const futureDate = new Date(Date.now() + 1000000);
        const result = yield* service.cleanup({
          olderThan: futureDate,
          status: "resolved",
        });

        expect(result.deleted).toBeGreaterThanOrEqual(1);
      }).pipe(Effect.provide(createTestLayers())),
    );
  });

  describe("getStats", () => {
    it.effect("should return correct statistics", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const error = UploadistaError.fromCode("FLOW_NODE_ERROR");

        // Add items with different statuses
        const job1 = createMockFlowJob({ id: "job_1", flowId: "flow-a" });
        const job2 = createMockFlowJob({ id: "job_2", flowId: "flow-a" });
        const job3 = createMockFlowJob({ id: "job_3", flowId: "flow-b" });

        const item1 = yield* service.add(job1, error);
        const item2 = yield* service.add(job2, error);
        yield* service.add(job3, error);

        // Mark one as resolved
        yield* service.markResolved(item1.id);

        // Do a retry on another
        yield* service.markRetrying(item2.id);
        yield* service.recordRetryFailure(item2.id, "Error", 1000);

        const stats = yield* service.getStats();

        expect(stats.totalItems).toBe(3);
        expect(stats.byStatus.resolved).toBe(1);
        expect(stats.byStatus.pending).toBe(2);
        expect(stats.byFlow["flow-a"]).toBe(2);
        expect(stats.byFlow["flow-b"]).toBe(1);
        expect(stats.averageRetryCount).toBeGreaterThan(0);
      }).pipe(Effect.provide(createTestLayers())),
    );

    it.effect("should handle empty queue", () =>
      Effect.gen(function* () {
        const service = yield* createDeadLetterQueueService();

        const stats = yield* service.getStats();

        expect(stats.totalItems).toBe(0);
        expect(stats.byStatus.pending).toBe(0);
        expect(stats.byStatus.retrying).toBe(0);
        expect(stats.byStatus.exhausted).toBe(0);
        expect(stats.byStatus.resolved).toBe(0);
        expect(stats.averageRetryCount).toBe(0);
        expect(stats.oldestItem).toBeUndefined();
      }).pipe(Effect.provide(createTestLayers())),
    );
  });
});
