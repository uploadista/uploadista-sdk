import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { makeMemoryBaseKvStore } from "../src/memory-kv-store";

describe("Memory KV Store", () => {
  describe("Basic Operations", () => {
    it("should store and retrieve values", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const value = yield* store.get("key1");
          expect(value).toBe("value1");
        }),
      );
    });

    it("should return null for non-existent keys", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          const value = yield* store.get("non-existent");
          expect(value).toBeNull();
        }),
      );
    });

    it("should delete values", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.delete("key1");
          const value = yield* store.get("key1");
          expect(value).toBeNull();
        }),
      );
    });
  });

  describe("Complex Data Types", () => {
    it("should store and retrieve JSON strings", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          const obj = { name: "John", age: 30 };
          yield* store.set("user1", JSON.stringify(obj));
          const retrieved = yield* store.get("user1");
          expect(retrieved).not.toBeNull();
          expect(JSON.parse(retrieved as string)).toEqual(obj);
        }),
      );
    });

    it("should store and retrieve JSON arrays", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          const arr = [1, 2, 3, 4, 5];
          yield* store.set("numbers", JSON.stringify(arr));
          const retrieved = yield* store.get("numbers");
          expect(retrieved).not.toBeNull();
          expect(JSON.parse(retrieved as string)).toEqual(arr);
        }),
      );
    });

    it("should handle empty strings", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "");
          const value = yield* store.get("key1");
          expect(value).toBe("");
        }),
      );
    });

    it("should handle unicode characters", async () => {
      const store = makeMemoryBaseKvStore();
      const unicodeValue = "Hello 世界 🌍";

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("unicode", unicodeValue);
          const value = yield* store.get("unicode");
          expect(value).toBe(unicodeValue);
        }),
      );
    });

    it("should handle multiline strings", async () => {
      const store = makeMemoryBaseKvStore();
      const multilineValue = "line1\nline2\nline3";

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("multiline", multilineValue);
          const value = yield* store.get("multiline");
          expect(value).toBe(multilineValue);
        }),
      );
    });
  });

  describe("List Operations", () => {
    it("should list all keys", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key2", "value2");
          yield* store.set("key3", "value3");

          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("");
          expect(keys).toHaveLength(3);
          expect(keys).toContain("key1");
          expect(keys).toContain("key2");
          expect(keys).toContain("key3");
        }),
      );
    });

    it("should list keys with prefix", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("user:1", "John");
          yield* store.set("user:2", "Jane");
          yield* store.set("post:1", "Post content");

          if (!store.list) throw new Error("list not supported");
          const userKeys = yield* store.list("user:");
          expect(userKeys).toHaveLength(2);
          expect(userKeys).toContain("user:1");
          expect(userKeys).toContain("user:2");
          expect(userKeys).not.toContain("post:1");
        }),
      );
    });

    it("should return empty list for non-matching prefix", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("nonexistent:");
          expect(keys).toHaveLength(0);
        }),
      );
    });
  });

  describe("Update Operations", () => {
    it("should update existing values", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key1", "value2");
          const value = yield* store.get("key1");
          expect(value).toBe("value2");
        }),
      );
    });

    it("should handle concurrent updates", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("counter", "0");

          // Concurrent updates
          yield* Effect.all(
            [
              store.set("counter", "1"),
              store.set("counter", "2"),
              store.set("counter", "3"),
            ],
            { concurrency: "unbounded" },
          );

          const value = yield* store.get("counter");
          expect(["1", "2", "3"]).toContain(value); // One of the values should win
        }),
      );
    });

    it("should preserve other keys when updating", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key2", "value2");
          yield* store.set("key1", "updated");

          const value1 = yield* store.get("key1");
          const value2 = yield* store.get("key2");

          expect(value1).toBe("updated");
          expect(value2).toBe("value2");
        }),
      );
    });
  });

  describe("Isolation", () => {
    it("should maintain separate stores", async () => {
      const store1 = makeMemoryBaseKvStore();
      const store2 = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store1.set("key1", "store1-value");
          yield* store2.set("key1", "store2-value");

          const value1 = yield* store1.get("key1");
          const value2 = yield* store2.get("key1");

          expect(value1).toBe("store1-value");
          expect(value2).toBe("store2-value");
        }),
      );
    });
  });

  describe("Performance", () => {
    it("should handle large numbers of keys", async () => {
      const store = makeMemoryBaseKvStore();
      const keyCount = 1000;

      await Effect.runPromise(
        Effect.gen(function* () {
          // Set many keys
          for (let i = 0; i < keyCount; i++) {
            yield* store.set(`key${i}`, `${i}`);
          }

          // Verify count
          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("");
          expect(keys).toHaveLength(keyCount);

          // Verify random access
          const value500 = yield* store.get("key500");
          expect(value500).toBe("500");
        }),
      );
    }, 10000);

    it("should handle large values", async () => {
      const store = makeMemoryBaseKvStore();
      const largeValue = "x".repeat(100000);

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("large", largeValue);
          const value = yield* store.get("large");
          expect(value).not.toBeNull();
          expect(value?.length).toBe(100000);
        }),
      );
    });

    it("should handle keys with special characters", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          const specialKey = "user_123_profile@email.com";
          yield* store.set(specialKey, "value");
          const value = yield* store.get(specialKey);
          expect(value).toBe("value");
        }),
      );
    });
  });

  describe("Deletion", () => {
    it("should handle deletion of non-existent key", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.delete("nonexistent");
          const value = yield* store.get("nonexistent");
          expect(value).toBeNull();
        }),
      );
    });

    it("should remove key from list after deletion", async () => {
      const store = makeMemoryBaseKvStore();

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key2", "value2");

          if (!store.list) throw new Error("list not supported");
          const keysBefore = yield* store.list("");
          expect(keysBefore).toHaveLength(2);

          yield* store.delete("key1");

          const keysAfter = yield* store.list("");
          expect(keysAfter).toHaveLength(1);
          expect(keysAfter).not.toContain("key1");
          expect(keysAfter).toContain("key2");
        }),
      );
    });
  });
});
