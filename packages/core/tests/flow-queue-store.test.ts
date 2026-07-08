import { Effect } from "effect";
import { describe, expect, it, beforeEach } from "vitest";
import { MemoryFlowQueueStore } from "../src/flow/flow-queue-store";
import type { FlowQueueItem } from "../src/flow/types/flow-queue-item";

function makeItem(overrides: Partial<FlowQueueItem> = {}): FlowQueueItem {
  return {
    id: `q_${Math.random().toString(36).slice(2)}`,
    flowId: "test-flow",
    storageId: "s3-test",
    input: { files: ["a.png"] },
    clientId: "client-1",
    status: "pending",
    enqueuedAt: new Date("2024-01-01T10:00:00Z"),
    ...overrides,
  };
}

describe("MemoryFlowQueueStore", () => {
  let store: MemoryFlowQueueStore;

  beforeEach(() => {
    store = new MemoryFlowQueueStore();
  });

  describe("createItem", () => {
    it("stores and returns the item", async () => {
      const item = makeItem();
      const result = await Effect.runPromise(store.createItem(item));
      expect(result).toMatchObject({ id: item.id, status: "pending" });
    });

    it("allows creating multiple items", async () => {
      const a = makeItem({ id: "q_a" });
      const b = makeItem({ id: "q_b" });
      await Effect.runPromise(
        Effect.all([store.createItem(a), store.createItem(b)]),
      );
      const pending = await Effect.runPromise(store.listByStatus("pending"));
      expect(pending).toHaveLength(2);
    });
  });

  describe("getItem", () => {
    it("returns the item when it exists", async () => {
      const item = makeItem({ id: "q_known" });
      await Effect.runPromise(store.createItem(item));
      const result = await Effect.runPromise(store.getItem("q_known"));
      expect(result).not.toBeNull();
      expect(result!.id).toBe("q_known");
    });

    it("returns null for unknown IDs", async () => {
      const result = await Effect.runPromise(store.getItem("q_unknown"));
      expect(result).toBeNull();
    });
  });

  describe("updateItem", () => {
    it("applies partial updates", async () => {
      const item = makeItem({ id: "q_upd" });
      await Effect.runPromise(store.createItem(item));

      const updated = await Effect.runPromise(
        store.updateItem("q_upd", { status: "running", startedAt: new Date() }),
      );

      expect(updated.status).toBe("running");
      expect(updated.startedAt).toBeInstanceOf(Date);
      expect(updated.flowId).toBe("test-flow"); // unchanged
    });

    it("fails with FLOW_JOB_NOT_FOUND for unknown ID", async () => {
      const result = await Effect.runPromise(
        Effect.either(store.updateItem("q_missing", { status: "running" })),
      );
      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.code).toBe("FLOW_JOB_NOT_FOUND");
      }
    });
  });

  describe("listByStatus", () => {
    it("filters by status correctly", async () => {
      const pending = makeItem({ id: "q_p1", status: "pending" });
      const running = makeItem({ id: "q_r1", status: "running" });
      const completed = makeItem({ id: "q_c1", status: "completed" });
      await Effect.runPromise(
        Effect.all([
          store.createItem(pending),
          store.createItem(running),
          store.createItem(completed),
        ]),
      );

      const pendingList = await Effect.runPromise(
        store.listByStatus("pending"),
      );
      expect(pendingList).toHaveLength(1);
      expect(pendingList[0].id).toBe("q_p1");

      const runningList = await Effect.runPromise(
        store.listByStatus("running"),
      );
      expect(runningList).toHaveLength(1);
      expect(runningList[0].id).toBe("q_r1");
    });

    it("returns pending items in FIFO order (oldest first)", async () => {
      const early = makeItem({
        id: "q_early",
        enqueuedAt: new Date("2024-01-01T09:00:00Z"),
      });
      const late = makeItem({
        id: "q_late",
        enqueuedAt: new Date("2024-01-01T11:00:00Z"),
      });
      // Insert late first to verify sorting
      await Effect.runPromise(
        Effect.all([store.createItem(late), store.createItem(early)]),
      );

      const pending = await Effect.runPromise(store.listByStatus("pending"));
      expect(pending[0].id).toBe("q_early");
      expect(pending[1].id).toBe("q_late");
    });

    it("returns empty array when no items match status", async () => {
      const pending = await Effect.runPromise(store.listByStatus("completed"));
      expect(pending).toHaveLength(0);
    });
  });

  describe("deleteItem", () => {
    it("removes the item", async () => {
      const item = makeItem({ id: "q_del" });
      await Effect.runPromise(store.createItem(item));
      await Effect.runPromise(store.deleteItem("q_del"));
      const result = await Effect.runPromise(store.getItem("q_del"));
      expect(result).toBeNull();
    });

    it("is idempotent for unknown IDs", async () => {
      await expect(
        Effect.runPromise(store.deleteItem("q_nonexistent")),
      ).resolves.toBeUndefined();
    });
  });
});
