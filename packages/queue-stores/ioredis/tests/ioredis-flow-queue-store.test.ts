import { Effect } from "effect";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { IoRedisFlowQueueStore } from "../src/ioredis-flow-queue-store";
import type { IoRedisLike } from "../src/ioredis-flow-queue-store";
import type { FlowQueueItem } from "@uploadista/core/flow";

// Minimal in-memory mock satisfying the IoRedisLike interface
function makeMockIoRedis(): IoRedisLike & {
  _store: Map<string, string>;
  _pendingZset: Map<string, number>;
  _runningSet: Set<string>;
} {
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
    // ioredis scan: (cursor, "MATCH", pattern, "COUNT", count) → [cursor, keys]
    scan: vi.fn(
      async (_cursor: string, _matchOpt: "MATCH", pattern: string, _countOpt: "COUNT", _count: string): Promise<[string, string[]]> => {
        const prefix = pattern.replace(/\*/g, "");
        const keys = Array.from(store.keys()).filter((k) =>
          k.startsWith(prefix),
        );
        return ["0", keys];
      },
    ),
    // ioredis zadd: (key, score, member)
    zadd: vi.fn(async (_key: string, score: number, member: string) => {
      pendingZset.set(member, score);
      return 1;
    }),
    // ioredis zrange: (key, start, stop) → ascending
    zrange: vi.fn(async (_key: string, _start: number, _stop: number) => {
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
  } as unknown as IoRedisLike & {
    _store: Map<string, string>;
    _pendingZset: Map<string, number>;
    _runningSet: Set<string>;
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

describe("IoRedisFlowQueueStore", () => {
  let mockRedis: ReturnType<typeof makeMockIoRedis>;
  let store: IoRedisFlowQueueStore;

  beforeEach(() => {
    mockRedis = makeMockIoRedis();
    store = new IoRedisFlowQueueStore({ redis: mockRedis });
  });

  describe("createItem", () => {
    it("stores item JSON at the correct key", async () => {
      const item = makeItem({ id: "q_io_create" });
      await Effect.runPromise(store.createItem(item));

      expect(mockRedis.set).toHaveBeenCalledWith(
        "uploadista:queue:item:q_io_create",
        expect.any(String),
      );
    });

    it("adds pending item to sorted set with correct ioredis zadd argument order", async () => {
      const item = makeItem({
        id: "q_io_pending",
        status: "pending",
        enqueuedAt: new Date("2024-01-15T12:00:00Z"),
      });
      await Effect.runPromise(store.createItem(item));

      // ioredis zadd: (key, score, member) — score before member
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        "uploadista:queue:pending",
        new Date("2024-01-15T12:00:00Z").getTime(),
        "q_io_pending",
      );
    });

    it("adds running item to set", async () => {
      const item = makeItem({ id: "q_io_running", status: "running" });
      await Effect.runPromise(store.createItem(item));

      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "uploadista:queue:running",
        "q_io_running",
      );
    });
  });

  describe("getItem", () => {
    it("returns null for unknown IDs", async () => {
      const result = await Effect.runPromise(
        store.getItem("q_io_unknown"),
      );
      expect(result).toBeNull();
    });

    it("deserializes dates correctly", async () => {
      const item = makeItem({
        id: "q_io_dates",
        startedAt: new Date("2024-01-01T10:05:00Z"),
        completedAt: new Date("2024-01-01T10:10:00Z"),
      });
      await Effect.runPromise(store.createItem(item));
      const result = await Effect.runPromise(store.getItem("q_io_dates"));

      expect(result).not.toBeNull();
      expect(result!.enqueuedAt).toBeInstanceOf(Date);
      expect(result!.startedAt).toBeInstanceOf(Date);
      expect(result!.completedAt).toBeInstanceOf(Date);
    });
  });

  describe("updateItem", () => {
    it("updates status indexes when transitioning pending → running", async () => {
      const item = makeItem({ id: "q_io_trans", status: "pending" });
      await Effect.runPromise(store.createItem(item));
      await Effect.runPromise(
        store.updateItem("q_io_trans", {
          status: "running",
          startedAt: new Date(),
        }),
      );

      expect(mockRedis.zrem).toHaveBeenCalledWith(
        "uploadista:queue:pending",
        "q_io_trans",
      );
      expect(mockRedis.sadd).toHaveBeenCalledWith(
        "uploadista:queue:running",
        "q_io_trans",
      );
    });

    it("returns FLOW_JOB_NOT_FOUND for unknown IDs", async () => {
      const result = await Effect.runPromise(
        Effect.either(store.updateItem("q_io_missing", { status: "running" })),
      );
      expect(result._tag).toBe("Left");
    });
  });

  describe("listByStatus", () => {
    it("uses ZRANGE for pending (FIFO order via score)", async () => {
      const early = makeItem({
        id: "q_io_early",
        enqueuedAt: new Date("2024-01-01T08:00:00Z"),
      });
      const late = makeItem({
        id: "q_io_late",
        enqueuedAt: new Date("2024-01-01T12:00:00Z"),
      });

      await Effect.runPromise(store.createItem(late));
      await Effect.runPromise(store.createItem(early));

      // Simulate get returning correct items
      const itemMap = new Map([
        ["uploadista:queue:item:q_io_early", JSON.stringify(early)],
        ["uploadista:queue:item:q_io_late", JSON.stringify(late)],
      ]);
      (mockRedis.get as ReturnType<typeof vi.fn>).mockImplementation(
        async (key: string) => itemMap.get(key) ?? null,
      );

      const result = await Effect.runPromise(store.listByStatus("pending"));
      // FIFO — early should come first
      expect(result[0].id).toBe("q_io_early");
      expect(result[1].id).toBe("q_io_late");
    });

    it("uses SMEMBERS for running items", async () => {
      const item = makeItem({ id: "q_io_run", status: "running" });
      await Effect.runPromise(store.createItem(item));
      (mockRedis.get as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(item),
      );

      await Effect.runPromise(store.listByStatus("running"));
      expect(mockRedis.smembers).toHaveBeenCalledWith("uploadista:queue:running");
    });

    it("uses SCAN for completed and failed items", async () => {
      await Effect.runPromise(store.listByStatus("completed"));
      expect(mockRedis.scan).toHaveBeenCalled();
    });
  });

  describe("deleteItem", () => {
    it("removes from all indexes", async () => {
      const item = makeItem({ id: "q_io_del" });
      await Effect.runPromise(store.createItem(item));
      await Effect.runPromise(store.deleteItem("q_io_del"));

      expect(mockRedis.del).toHaveBeenCalledWith(
        expect.stringContaining("q_io_del"),
      );
      expect(mockRedis.zrem).toHaveBeenCalledWith(
        "uploadista:queue:pending",
        "q_io_del",
      );
      expect(mockRedis.srem).toHaveBeenCalledWith(
        "uploadista:queue:running",
        "q_io_del",
      );
    });
  });
});
