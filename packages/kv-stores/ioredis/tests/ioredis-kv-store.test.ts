import { Effect } from "effect";
import type { Redis } from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { makeIoRedisBaseKvStore } from "../src/io-redis-kv-store";

describe("IORedis KV Store", () => {
  describe("Basic Operations", () => {
    it("should store and retrieve values", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value1"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const value = yield* store.get("key1");
          expect(value).toBe("value1");
          expect(mockRedis.set).toHaveBeenCalledWith("key1", "value1");
          expect(mockRedis.get).toHaveBeenCalledWith("key1");
        }),
      );
    });

    it("should return null for non-existent keys", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const value = yield* store.get("non-existent");
          expect(value).toBeNull();
          expect(mockRedis.get).toHaveBeenCalledWith("non-existent");
        }),
      );
    });

    it("should delete values", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value1"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.delete("key1");
          expect(mockRedis.del).toHaveBeenCalledWith("key1");
        }),
      );
    });
  });

  describe("List Operations", () => {
    it("should list all keys with prefix", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi
          .fn()
          .mockResolvedValueOnce(["5", ["user:1", "user:2"]])
          .mockResolvedValueOnce(["0", ["user:3"]]),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("user:");
          expect(keys).toHaveLength(3);
          expect(keys).toContain("1");
          expect(keys).toContain("2");
          expect(keys).toContain("3");
          expect(mockRedis.scan).toHaveBeenCalledWith(
            "0",
            "MATCH",
            "user:*",
            "COUNT",
            "20",
          );
        }),
      );
    });

    it("should handle empty list results", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi.fn().mockResolvedValue(["0", []]),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("nonexistent:");
          expect(keys).toHaveLength(0);
        }),
      );
    });

    it("should handle paginated scan results", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi
          .fn()
          .mockResolvedValueOnce(["10", ["prefix:a", "prefix:b"]])
          .mockResolvedValueOnce(["20", ["prefix:c", "prefix:d"]])
          .mockResolvedValueOnce(["0", ["prefix:e"]]),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("prefix:");
          expect(keys).toHaveLength(5);
          expect(mockRedis.scan).toHaveBeenCalledTimes(3);
        }),
      );
    });

    it("should handle duplicate keys from multiple scan iterations", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi
          .fn()
          .mockResolvedValueOnce(["5", ["prefix:a", "prefix:b"]])
          .mockResolvedValueOnce(["0", ["prefix:b", "prefix:c"]]),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("prefix:");
          // Should deduplicate "prefix:b"
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
      const mockRedis = {
        get: vi.fn().mockResolvedValue('{"name":"John","age":30}'),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

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
      const mockRedis = {
        get: vi.fn().mockResolvedValue(""),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

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
      const mockRedis = {
        get: vi.fn().mockResolvedValue(unicodeValue),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("unicode", unicodeValue);
          const value = yield* store.get("unicode");
          expect(value).toBe(unicodeValue);
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle get errors", async () => {
      const mockRedis = {
        get: vi.fn().mockRejectedValue(new Error("Connection failed")),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("key1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle set errors", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn().mockRejectedValue(new Error("Write failed")),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.set("key1", "value1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle delete errors", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn().mockRejectedValue(new Error("Delete failed")),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.delete("key1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle scan errors", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        del: vi.fn(),
        scan: vi.fn().mockRejectedValue(new Error("Scan failed")),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

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
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value2"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key1", "value2");
          const value = yield* store.get("key1");
          expect(value).toBe("value2");
          expect(mockRedis.set).toHaveBeenCalledTimes(2);
        }),
      );
    });

    it("should handle concurrent updates", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("final"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

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

          expect(mockRedis.set).toHaveBeenCalledTimes(3);
        }),
      );
    });
  });

  describe("Isolation", () => {
    it("should maintain separate store instances", async () => {
      const mockRedis1 = {
        get: vi.fn().mockResolvedValue("store1-value"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const mockRedis2 = {
        get: vi.fn().mockResolvedValue("store2-value"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store1 = makeIoRedisBaseKvStore({ redis: mockRedis1 });
      const store2 = makeIoRedisBaseKvStore({ redis: mockRedis2 });

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
    it("should handle large values", async () => {
      const largeValue = "x".repeat(100000);
      const mockRedis = {
        get: vi.fn().mockResolvedValue(largeValue),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("large", largeValue);
          const value = yield* store.get("large");
          expect(value?.length).toBe(100000);
        }),
      );
    });

    it("should handle many operations", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(1),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const operations = [];
          for (let i = 0; i < 100; i++) {
            operations.push(store.set(`key${i}`, `value${i}`));
          }
          yield* Effect.all(operations, { concurrency: "unbounded" });
          expect(mockRedis.set).toHaveBeenCalledTimes(100);
        }),
      );
    });

    it("should handle special characters in keys", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value"),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn(),
        scan: vi.fn(),
      } as unknown as Redis;

      const store = makeIoRedisBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const specialKey = "user:123:profile:@email.com";
          yield* store.set(specialKey, "value");
          expect(mockRedis.set).toHaveBeenCalledWith(specialKey, "value");
        }),
      );
    });
  });
});
