import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { memoryKvStore } from "../src/memory-kv-store";

describe("Memory KV Store", () => {
  describe("Basic Operations", () => {
    it("should store and retrieve values", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const value = yield* store.get("key1");
          expect(value).toBe("value1");
        })
      );
    });

    it("should return undefined for non-existent keys", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          const value = yield* store.get("non-existent");
          expect(value).toBeUndefined();
        })
      );
    });

    it("should delete values", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.delete("key1");
          const value = yield* store.get("key1");
          expect(value).toBeUndefined();
        })
      );
    });

    it("should check existence of keys", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const exists = yield* store.has("key1");
          expect(exists).toBe(true);

          const notExists = yield* store.has("key2");
          expect(notExists).toBe(false);
        })
      );
    });
  });

  describe("Complex Data Types", () => {
    it("should store and retrieve objects", async () => {
      const store = memoryKvStore<{ name: string; age: number }>();

      await Effect.runPromise(
        Effect.gen(function* () {
          const obj = { name: "John", age: 30 };
          yield* store.set("user1", obj);
          const retrieved = yield* store.get("user1");
          expect(retrieved).toEqual(obj);
        })
      );
    });

    it("should store and retrieve arrays", async () => {
      const store = memoryKvStore<number[]>();

      await Effect.runPromise(
        Effect.gen(function* () {
          const arr = [1, 2, 3, 4, 5];
          yield* store.set("numbers", arr);
          const retrieved = yield* store.get("numbers");
          expect(retrieved).toEqual(arr);
        })
      );
    });
  });

  describe("TTL (Time To Live)", () => {
    it("should expire values after TTL", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1", { ttl: 100 }); // 100ms TTL

          // Should exist immediately
          const valueBefore = yield* store.get("key1");
          expect(valueBefore).toBe("value1");

          // Wait for expiration
          yield* Effect.sleep("150 millis");

          // Should be expired
          const valueAfter = yield* store.get("key1");
          expect(valueAfter).toBeUndefined();
        })
      );
    }, 10000);

    it("should not expire values without TTL", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1"); // No TTL

          yield* Effect.sleep("200 millis");

          const value = yield* store.get("key1");
          expect(value).toBe("value1");
        })
      );
    }, 10000);
  });

  describe("List Operations", () => {
    it("should list all keys", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key2", "value2");
          yield* store.set("key3", "value3");

          const keys = yield* store.list();
          expect(keys).toHaveLength(3);
          expect(keys).toContain("key1");
          expect(keys).toContain("key2");
          expect(keys).toContain("key3");
        })
      );
    });

    it("should list keys with prefix", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("user:1", "John");
          yield* store.set("user:2", "Jane");
          yield* store.set("post:1", "Post content");

          const userKeys = yield* store.list({ prefix: "user:" });
          expect(userKeys).toHaveLength(2);
          expect(userKeys).toContain("user:1");
          expect(userKeys).toContain("user:2");
          expect(userKeys).not.toContain("post:1");
        })
      );
    });
  });

  describe("Update Operations", () => {
    it("should update existing values", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key1", "value2");
          const value = yield* store.get("key1");
          expect(value).toBe("value2");
        })
      );
    });

    it("should handle concurrent updates", async () => {
      const store = memoryKvStore<number>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("counter", 0);

          // Concurrent increments
          yield* Effect.all([
            store.set("counter", 1),
            store.set("counter", 2),
            store.set("counter", 3),
          ], { concurrency: "unbounded" });

          const value = yield* store.get("counter");
          expect([1, 2, 3]).toContain(value); // One of the values should win
        })
      );
    });
  });

  describe("Clear Operations", () => {
    it("should clear all values", async () => {
      const store = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key2", "value2");
          yield* store.set("key3", "value3");

          yield* store.clear();

          const keys = yield* store.list();
          expect(keys).toHaveLength(0);
        })
      );
    });
  });

  describe("Isolation", () => {
    it("should maintain separate stores", async () => {
      const store1 = memoryKvStore<string>();
      const store2 = memoryKvStore<string>();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store1.set("key1", "store1-value");
          yield* store2.set("key1", "store2-value");

          const value1 = yield* store1.get("key1");
          const value2 = yield* store2.get("key1");

          expect(value1).toBe("store1-value");
          expect(value2).toBe("store2-value");
        })
      );
    });
  });

  describe("Performance", () => {
    it("should handle large numbers of keys", async () => {
      const store = memoryKvStore<number>();
      const keyCount = 1000;

      await Effect.runPromise(
        Effect.gen(function* () {
          // Set many keys
          for (let i = 0; i < keyCount; i++) {
            yield* store.set(`key${i}`, i);
          }

          // Verify count
          const keys = yield* store.list();
          expect(keys).toHaveLength(keyCount);

          // Verify random access
          const value500 = yield* store.get("key500");
          expect(value500).toBe(500);
        })
      );
    }, 10000);
  });
});
