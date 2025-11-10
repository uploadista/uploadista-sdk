import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeFileBaseKvStore } from "../src/file-kv-store";

describe("Filesystem KV Store", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    testDir = path.join(
      os.tmpdir(),
      `uploadista-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (_error) {
      // Ignore cleanup errors
    }
  });

  describe("Basic Operations", () => {
    it("should store and retrieve values", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const value = yield* store.get("key1");
          expect(value).toBe("value1");
        }),
      );
    });

    it("should fail for non-existent keys", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.get("non-existent"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should delete values", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.delete("key1");
          const result = yield* Effect.either(store.get("key1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should verify file exists on disk", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          const filePath = path.join(testDir, "key1.json");
          const exists = yield* Effect.promise(() =>
            fs
              .access(filePath)
              .then(() => true)
              .catch(() => false),
          );
          expect(exists).toBe(true);
        }),
      );
    });
  });

  describe("List Operations", () => {
    it("should list all keys", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

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
      const store = makeFileBaseKvStore({ directory: testDir });

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
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("nonexistent:");
          expect(keys).toHaveLength(0);
        }),
      );
    });

    it("should sort keys alphabetically", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("z", "value");
          yield* store.set("a", "value");
          yield* store.set("m", "value");

          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("");
          expect(keys).toEqual(["a", "m", "z"]);
        }),
      );
    });
  });

  describe("Complex Data Types", () => {
    it("should store and retrieve JSON strings", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

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

    it("should handle empty strings", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "");
          const value = yield* store.get("key1");
          expect(value).toBe("");
        }),
      );
    });

    it("should handle unicode characters", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });
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
      const store = makeFileBaseKvStore({ directory: testDir });
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

  describe("Error Handling", () => {
    it("should handle invalid directory", async () => {
      const invalidDir = "/invalid/nonexistent/path/that/does/not/exist";
      const store = makeFileBaseKvStore({ directory: invalidDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.set("key1", "value1"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle deletion of non-existent file", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.delete("nonexistent"));
          expect(result._tag).toBe("Left");
        }),
      );
    });

    it("should handle concurrent writes to same key", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* Effect.all(
            [
              store.set("key1", "value1"),
              store.set("key1", "value2"),
              store.set("key1", "value3"),
            ],
            { concurrency: "unbounded" },
          );

          const value = yield* store.get("key1");
          // One of the values should win
          expect(["value1", "value2", "value3"]).toContain(value);
        }),
      );
    });
  });

  describe("Update Operations", () => {
    it("should update existing values", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          yield* store.set("key1", "value2");
          const value = yield* store.get("key1");
          expect(value).toBe("value2");
        }),
      );
    });

    it("should preserve other keys when updating", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

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
    it("should maintain separate stores with different directories", async () => {
      const testDir2 = path.join(
        os.tmpdir(),
        `uploadista-test-2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );

      try {
        await fs.mkdir(testDir2, { recursive: true });

        const store1 = makeFileBaseKvStore({ directory: testDir });
        const store2 = makeFileBaseKvStore({ directory: testDir2 });

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
      } finally {
        await fs.rm(testDir2, { recursive: true, force: true });
      }
    });
  });

  describe("Performance", () => {
    it("should handle large values", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });
      const largeValue = "x".repeat(100000);

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("large", largeValue);
          const value = yield* store.get("large");
          expect(value?.length).toBe(100000);
        }),
      );
    });

    it("should handle many keys", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });
      const keyCount = 100;

      await Effect.runPromise(
        Effect.gen(function* () {
          for (let i = 0; i < keyCount; i++) {
            yield* store.set(`key${i}`, `value${i}`);
          }

          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("");
          expect(keys).toHaveLength(keyCount);
        }),
      );
    }, 10000);

    it("should handle keys with special characters", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          // Note: Some characters like / and \ might not work in filenames
          const specialKey = "user_123_profile@email";
          yield* store.set(specialKey, "value");
          const value = yield* store.get(specialKey);
          expect(value).toBe("value");
        }),
      );
    });
  });

  describe("File System Specifics", () => {
    it("should create .json files", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("test", "value");
          const files = yield* Effect.promise(() => fs.readdir(testDir));
          expect(files).toContain("test.json");
        }),
      );
    });

    it("should only list .json files", async () => {
      const store = makeFileBaseKvStore({ directory: testDir });

      await Effect.runPromise(
        Effect.gen(function* () {
          yield* store.set("key1", "value1");
          // Create a non-.json file manually
          yield* Effect.promise(() =>
            fs.writeFile(path.join(testDir, "other.txt"), "content"),
          );

          if (!store.list) throw new Error("list not supported");
          const keys = yield* store.list("");
          expect(keys).toHaveLength(1);
          expect(keys).toContain("key1");
          expect(keys).not.toContain("other");
        }),
      );
    });

    it("should handle directory creation", async () => {
      const newDir = path.join(
        os.tmpdir(),
        `uploadista-new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );

      try {
        await fs.mkdir(newDir, { recursive: true });
        const store = makeFileBaseKvStore({ directory: newDir });

        await Effect.runPromise(
          Effect.gen(function* () {
            yield* store.set("key1", "value1");
            const value = yield* store.get("key1");
            expect(value).toBe("value1");
          }),
        );
      } finally {
        await fs.rm(newDir, { recursive: true, force: true });
      }
    });
  });
});
