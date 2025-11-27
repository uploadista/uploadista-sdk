import type { RedisClient } from "bun";
import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";
import { makeBunBaseKvStore } from "../src/bun-kv-store";

describe("Bun KV Store", () => {
  describe("Basic Operations", () => {
    it("should store and retrieve values", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value1"),
        set: vi.fn().mockResolvedValue("OK"),
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn().mockResolvedValue(1),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.delete("key1");
          expect(mockRedis.send).toHaveBeenCalledWith("DEL", ["key1"]);
        }),
      );
    });
  });

  describe("List Operations", () => {
    it("should list all keys with prefix", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        send: vi
          .fn()
          .mockResolvedValueOnce(["5", ["user:1", "user:2"]])
          .mockResolvedValueOnce(["0", ["user:3"]]),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("user:");
          expect(keys).toHaveLength(3);
          expect(keys).toContain("1");
          expect(keys).toContain("2");
          expect(keys).toContain("3");
          expect(mockRedis.send).toHaveBeenCalledWith("SCAN", [
            "0",
            "MATCH",
            "user:*",
            "COUNT",
            "20",
          ]);
        }),
      );
    });

    it("should handle empty list results", async () => {
      const mockRedis = {
        get: vi.fn(),
        set: vi.fn(),
        send: vi.fn().mockResolvedValue(["0", []]),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi
          .fn()
          .mockResolvedValueOnce(["10", ["prefix:a", "prefix:b"]])
          .mockResolvedValueOnce(["20", ["prefix:c", "prefix:d"]])
          .mockResolvedValueOnce(["0", ["prefix:e"]]),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const keys = yield* store.list!("prefix:");
          expect(keys).toHaveLength(5);
          expect(mockRedis.send).toHaveBeenCalledTimes(3);
        }),
      );
    });
  });

  describe("Complex Data Types", () => {
    it("should store and retrieve JSON strings", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue('{"name":"John","age":30}'),
        set: vi.fn().mockResolvedValue("OK"),
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "");
          const value = yield* store.get("key1");
          expect(value).toBe("");
        }),
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle get errors", async () => {
      const mockRedis = {
        get: vi.fn().mockRejectedValue(new Error("Connection failed")),
        set: vi.fn(),
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn().mockRejectedValue(new Error("Delete failed")),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn().mockRejectedValue(new Error("Scan failed")),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

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
  });

  describe("Isolation", () => {
    it("should maintain separate store instances", async () => {
      const mockRedis1 = {
        get: vi.fn().mockResolvedValue("store1-value"),
        set: vi.fn().mockResolvedValue("OK"),
        send: vi.fn(),
      } as unknown as RedisClient;

      const mockRedis2 = {
        get: vi.fn().mockResolvedValue("store2-value"),
        set: vi.fn().mockResolvedValue("OK"),
        send: vi.fn(),
      } as unknown as RedisClient;

      const store1 = makeBunBaseKvStore({ redis: mockRedis1 });
      const store2 = makeBunBaseKvStore({ redis: mockRedis2 });

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
      const largeValue = "x".repeat(10000);
      const mockRedis = {
        get: vi.fn().mockResolvedValue(largeValue),
        set: vi.fn().mockResolvedValue("OK"),
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("large", largeValue);
          const value = yield* store.get("large");
          expect(value?.length).toBe(10000);
        }),
      );
    });

    it("should handle special characters in keys", async () => {
      const mockRedis = {
        get: vi.fn().mockResolvedValue("value"),
        set: vi.fn().mockResolvedValue("OK"),
        send: vi.fn(),
      } as unknown as RedisClient;

      const store = makeBunBaseKvStore({ redis: mockRedis });

      await Effect.runPromise(
        Effect.gen(function* () {
          const specialKey = "user:123:profile:@email";
          yield* store.set(specialKey, "value");
          expect(mockRedis.set).toHaveBeenCalledWith(specialKey, "value");
        }),
      );
    });
  });
});
