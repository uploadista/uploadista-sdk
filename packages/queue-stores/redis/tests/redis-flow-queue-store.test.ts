import { Effect } from "effect";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { RedisFlowQueueStore } from "../src/redis-flow-queue-store";
import type { RedisFlowQueueStoreConfig } from "../src/redis-flow-queue-store";
import type { FlowQueueItem } from "@uploadista/core/flow";

// Minimal mock that satisfies the RedisFlowQueueStoreConfig redis type
function makeMockRedis() {
  const store = new Map<string, string>();
  const pendingZset = new Map<string, number>(); // member -> score
  const runningSet = new Set<string>();

  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    }),
    scan: vi.fn(async (_cursor: unknown, options?: { MATCH?: string; COUNT?: number }) => {
      const pattern = options?.MATCH?.replace(/\*/g, "") ?? "";
      const keys = Array.from(store.keys()).filter((k) => k.startsWith(pattern));
      return { cursor: 0, keys };
    }),
    zadd: vi.fn(async (key: string, score: number, member: string) => {
      pendingZset.set(member, score);
      return 1;
    }),
    zrange: vi.fn(async (_key: string, _start: unknown, _stop: unknown) => {
      // Return members sorted by score ascending (FIFO)
      return Array.from(pendingZset.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([member]) => member);
    }),
    zrem: vi.fn(async (_key: string, ...members: string[]) => {
      for (const m of members) pendingZset.delete(m);
      return members.length;
    }),
    sadd: vi.fn(async (_key: string, ...members: string[]) => {
      for (const m of members) runningSet.add(m);
      return members.length;
    }),
    srem: vi.fn(async (_key: string, ...members: string[]) => {
      for (const m of members) runningSet.delete(m);
      return members.length;
    }),
    smembers: vi.fn(async (_key: string) => Array.from(runningSet)),
    _store: store,
    _pendingZset: pendingZset,
    _runningSet: runningSet,
  };
}

function makeItem(overrides: Partial<FlowQueueItem> = {}): FlowQueueItem {
  return {
    id: `q_${Math.random().toString(36).slice(2)}`,
    flowId: "test-flow",
    storageId: "s3-test",
    input: { key: "value" },
    clientId: "client-1",
    status: "pending",
    enqueuedAt: new Date("2024-01-01T10:00:00Z"),
    ...overrides,
  };
}

describe("RedisFlowQueueStore", () => {
  let mockRedis: ReturnType<typeof makeMockRedis>;
  let store: RedisFlowQueueStore;

  beforeEach(() => {
    mockRedis = makeMockRedis();
    store = new RedisFlowQueueStore({
      redis: mockRedis as unknown as RedisFlowQueueStoreConfig["redis"],
    });
  });

  describe("createItem", () => {
    it("stores item as JSON at the correct key", async () => {
      const item = makeItem({ id: "q_create_test" });
      const result = await Effect.runPromise(store.createItem(item));

      expect(result.id).toBe("q_create_test");
      expect(mockRedis.set).toHaveBeenCalledWith(
        "uploadista:queue:item:q_create_test",
        expect.any(String),
      );
    });

    it("adds pending item to sorted set with enqueuedAt score", async () => {
      const item = makeItem({
        id: "q_pending",
        status: "pending",
        enqueuedAt: new Date("2024-01-01T10:00:00Z"),
      });
      await Effect.runPromise(store.createItem(item));

      expect(mockRedis.zadd).toHaveBeenCalledWith(
        "uploadista:queue:pending",
        new Date("2024-01-01T10:00:00Z").getTime(),
        "q_pending",
      );
    });

    it("adds running item to the running set", async () => {
      const item = makeItem({ id: "q_running", status: "running" });
      await Effect.runPromise(store.createItem(item));

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "uploadista:queue:running",
        "q_running",
      );
    });
  });

  describe("getItem", () => {
    it("returns null for unknown IDs", async () => {
      const result = await Effect.runPromise(store.getItem("q_unknown"));
      expect(result).toBeNull();
    });

    it("parses dates correctly on retrieval", async () => {
      const item = makeItem({
        id: "q_dates",
        startedAt: new Date("2024-01-01T10:05:00Z"),
        completedAt: new Date("2024-01-01T10:10:00Z"),
      });
      await Effect.runPromise(store.createItem(item));
      const result = await Effect.runPromise(store.getItem("q_dates"));

      expect(result).not.toBeNull();
      expect(result!.enqueuedAt).toBeInstanceOf(Date);
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("updateItem", () => {
    it("transitions status from pending to running and updates indexes", async () => {
      const item = makeItem({ id: "q_trans", status: "pending" });
      await Effect.runPromise(store.createItem(item));
      await Effect.runPromise(
        store.updateItem("q_trans", { status: "running", startedAt: new Date() }),
      );

      expect(mockRedis.zrem).toHaveBeenCalledWith(
        "uploadista:queue:pending",
        "q_trans",
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "uploadista:queue:running",
        "q_trans",
      );
    });

    it("fails with FLOW_JOB_NOT_FOUND for unknown IDs", async () => {
      const result = await Effect.runPromise(
        Effect.either(store.updateItem("q_missing", { status: "running" })),
      );
      expect(result._tag).toBe("Left");
    });
  });

  describe("listByStatus", () => {
    it("returns pending items via ZRANGE (FIFO order)", async () => {
      const early = makeItem({
        id: "q_early",
        enqueuedAt: new Date("2024-01-01T09:00:00Z"),
      });
      const late = makeItem({
        id: "q_late",
        enqueuedAt: new Date("2024-01-01T11:00:00Z"),
      });

      // Create late first to test FIFO sorting
      await Effect.runPromise(store.createItem(late));
      await Effect.runPromise(store.createItem(early));

      // Make get return the correct item per call
      mockRedis.get.mockImplementation(async (key: string) => {
        if (key.endsWith("q_early")) return JSON.stringify(early);
        if (key.endsWith("q_late")) return JSON.stringify(late);
        return null;
      });

      const result = await Effect.runPromise(store.listByStatus("pending"));
      expect(result[0].id).toBe("q_early");
      expect(result[1].id).toBe("q_late");
    });

    it("uses SMEMBERS for running items", async () => {
      const item = makeItem({ id: "q_run", status: "running" });
      await Effect.runPromise(store.createItem(item));

      // Make get return the running item
      mockRedis.get.mockResolvedValue(JSON.stringify(item));

      await Effect.runPromise(store.listByStatus("running"));
      expect(mockRedis.smembers).toHaveBeenCalledWith("uploadista:queue:running");
    });
  });

  describe("deleteItem", () => {
    it("removes item from all indexes and the item key", async () => {
      const item = makeItem({ id: "q_del" });
      await Effect.runPromise(store.createItem(item));
      await Effect.runPromise(store.deleteItem("q_del"));

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("q_del"),
      );
      expect(mockRedis.zrem).toHaveBeenCalledWith(
        "uploadista:queue:pending",
        "q_del",
      );
      expect(mockRedis.srem).toHaveBeenCalledWith(
        "uploadista:queue:running",
        "q_del",
      );
    });
  });
});
