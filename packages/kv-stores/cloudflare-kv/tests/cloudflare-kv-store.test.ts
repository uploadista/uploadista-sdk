import type {
  KVNamespace,
  KVNamespaceListResult,
} from "@cloudflare/workers-types";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeCloudflareBaseKvStore } from "../src/cloudflare-kv-store";

describe("Cloudflare KV Store", () => {
  describe("Basic Operations", () => {
    it("should store and retrieve values", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue("value1"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const value = yield* store.get("key1");
          expect(value).toBe("value1");
          expect(mockKv.put).toHaveBeenCalledWith("key1", "value1");
          expect(mockKv.get).toHaveBeenCalledWith("key1");
        }),
      );
    });

    it("should return null for non-existent keys", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const value = yield* store.get("non-existent");
          expect(value).toBeNull();
          expect(mockKv.get).toHaveBeenCalledWith("non-existent");
        }),
      );
    });

    it("should delete values", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue("value1"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.delete("key1");
          expect(mockKv.delete).toHaveBeenCalledWith("key1");
        }),
      );
    });
  });

  describe("List Operations", () => {
    it("should list all keys with prefix", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({
          keys: [{ name: "user:1" }, { name: "user:2" }, { name: "user:3" }],
          list_complete: true,
          cursor: null,
        } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("user:");
          expect(keys).toHaveLength(3);
          expect(keys).toContain("1");
          expect(keys).toContain("2");
          expect(keys).toContain("3");
          expect(mockKv.list).toHaveBeenCalledWith({
            prefix: "user:",
            limit: 20,
            cursor: null,
          });
        }),
      );
    });

    it("should handle empty list results", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({
          keys: [],
          list_complete: true,
          cursor: null,
        } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("nonexistent:");
          expect(keys).toHaveLength(0);
        }),
      );
    });

    it("should handle paginated list results", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi
          .fn()
          .mockResolvedValueOnce({
            keys: [{ name: "prefix:a" }, { name: "prefix:b" }],
            list_complete: false,
            cursor: "cursor1",
          } as KVNamespaceListResult<unknown, string>)
          .mockResolvedValueOnce({
            keys: [{ name: "prefix:c" }, { name: "prefix:d" }],
            list_complete: false,
            cursor: "cursor2",
          } as KVNamespaceListResult<unknown, string>)
          .mockResolvedValueOnce({
            keys: [{ name: "prefix:e" }],
            list_complete: true,
            cursor: null,
          } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("prefix:");
          expect(keys).toHaveLength(5);
          expect(keys).toContain("a");
          expect(keys).toContain("e");
          expect(mockKv.list).toHaveBeenCalledTimes(3);
        }),
      );
    });

    it("should deduplicate keys from multiple pages", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi
          .fn()
          .mockResolvedValueOnce({
            keys: [{ name: "prefix:a" }, { name: "prefix:b" }],
            list_complete: false,
            cursor: "cursor1",
          } as KVNamespaceListResult<unknown, string>)
          .mockResolvedValueOnce({
            keys: [{ name: "prefix:b" }, { name: "prefix:c" }],
            list_complete: true,
            cursor: null,
          } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("prefix:");
          expect(keys).toHaveLength(3);
          expect(keys).toContain("a");
          expect(keys).toContain("b");
          expect(keys).toContain("c");
        }),
      );
    });
  });

  describe("Complex Data Types", () => {
    it("should store and retrieve JSON strings", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue('{"name":"John","age":30}'),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const obj = { name: "John", age: 30 };
          yield* store.set("user1", JSON.stringify(obj));
          const retrieved = yield* store.get("user1");
          expect(JSON.parse(retrieved!)).toEqual(obj);
        }),
      );
    });

    it("should handle empty strings", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue(""),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "");
          const value = yield* store.get("key1");
          expect(value).toBe("");
        }),
      );
    });

    it("should handle unicode characters", async () => {
      const unicodeValue = "Hello 世界 🌍";
      const mockKv = {
        get: vi.fn().mockResolvedValue(unicodeValue),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("unicode", unicodeValue);
          const value = yield* store.get("unicode");
          expect(value).toBe(unicodeValue);
        }),
      );
    });

    it("should handle large values", async () => {
      const largeValue = "x".repeat(50000);
      const mockKv = {
        get: vi.fn().mockResolvedValue(largeValue),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("large", largeValue);
          const value = yield* store.get("large");
          expect(value?.length).toBe(50000);
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle get errors", async () => {
      const mockKv = {
        get: vi.fn().mockRejectedValue(new Error("Network error")),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("key1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle put errors", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn().mockRejectedValue(new Error("Storage full")),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.set("key1", "value1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle delete errors", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn().mockRejectedValue(new Error("Permission denied")),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.delete("key1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle list errors", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockRejectedValue(new Error("List failed")),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.list!("prefix:"));
          expect(result._tag).toBe("Left");
        }),
      );
    });
  });

  describe("Update Operations", () => {
    it("should update existing values", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue("value2"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key1", "value2");
          const value = yield* store.get("key1");
          expect(value).toBe("value2");
          expect(mockKv.put).toHaveBeenCalledTimes(2);
        }),
      );
    });

    it("should handle concurrent updates", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue("final"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.all(
            [
              store.set("counter", "1"),
              store.set("counter", "2"),
              store.set("counter", "3"),
            ],
            { concurrency: "unbounded" },
          );

          expect(mockKv.put).toHaveBeenCalledTimes(3);
        }),
      );
    });
  });

  describe("Isolation", () => {
    it("should maintain separate store instances", async () => {
      const mockKv1 = {
        get: vi.fn().mockResolvedValue("store1-value"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const mockKv2 = {
        get: vi.fn().mockResolvedValue("store2-value"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store1 = makeCloudflareBaseKvStore({ kv: mockKv1 });
      const store2 = makeCloudflareBaseKvStore({ kv: mockKv2 });

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
    it("should handle many operations", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue("value"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const operations = [];
          for (let i = 0; i < 100; i++) {
            operations.push(store.set(`key${i}`, `value${i}`));
          }
          yield* Effect.all(operations, { concurrency: "unbounded" });
          expect(mockKv.put).toHaveBeenCalledTimes(100);
        }),
      );
    });

    it("should handle special characters in keys", async () => {
      const mockKv = {
        get: vi.fn().mockResolvedValue("value"),
        put: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn(),
        list: vi.fn(),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const specialKey = "user:123:profile:@email.com";
          yield* store.set(specialKey, "value");
          expect(mockKv.put).toHaveBeenCalledWith(specialKey, "value");
        }),
      );
    });

    it("should handle large lists efficiently", async () => {
      const keys = Array.from({ length: 100 }, (_, i) => ({
        name: `prefix:key${i}`,
      }));

      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({
          keys,
          list_complete: true,
          cursor: null,
        } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* store.list!("prefix:");
          expect(result).toHaveLength(100);
        }),
      );
    });
  });

  describe("Cloudflare KV Specifics", () => {
    it("should respect cursor-based pagination", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi
          .fn()
          .mockResolvedValueOnce({
            keys: [{ name: "key:1" }],
            list_complete: false,
            cursor: "abc123",
          } as KVNamespaceListResult<unknown, string>)
          .mockResolvedValueOnce({
            keys: [{ name: "key:2" }],
            list_complete: true,
            cursor: null,
          } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("key:");
          expect(mockKv.list).toHaveBeenNthCalledWith(1, {
            prefix: "key:",
            limit: 20,
            cursor: null,
          });
          expect(mockKv.list).toHaveBeenNthCalledWith(2, {
            prefix: "key:",
            limit: 20,
            cursor: "abc123",
          });
        }),
      );
    });

    it("should handle list_complete flag correctly", async () => {
      const mockKv = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn().mockResolvedValue({
          keys: [{ name: "key:1" }],
          list_complete: true,
          cursor: "ignored",
        } as KVNamespaceListResult<unknown, string>),
      } as unknown as KVNamespace<string>;

      const store = makeCloudflareBaseKvStore({ kv: mockKv });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("key:");
          expect(keys).toHaveLength(1);
          expect(mockKv.list).toHaveBeenCalledTimes(1);
        }),
      );
    });
  });
});
