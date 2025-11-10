import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import {
  AuthCacheService,
  AuthCacheServiceLive,
  NoAuthCacheServiceLive,
} from "./cache";
import type { AuthContext } from "./types";

describe("AuthCacheService", () => {
  describe("AuthCacheServiceLive", () => {
    it("should set and get auth context", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
        metadata: { role: "admin" },
      };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // Set auth context
        yield* cache.set("job-1", authContext);

        // Get auth context
        const retrieved = yield* cache.get("job-1");

        expect(retrieved).toEqual(authContext);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });

    it("should return null for non-existent job ID", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        const retrieved = yield* cache.get("non-existent");

        expect(retrieved).toBeNull();
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });

    it("should delete cached auth context", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
      };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // Set and verify
        yield* cache.set("job-1", authContext);
        const before = yield* cache.get("job-1");
        expect(before).toEqual(authContext);

        // Delete
        yield* cache.delete("job-1");

        // Verify deleted
        const after = yield* cache.get("job-1");
        expect(after).toBeNull();
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });

    it("should clear all cached auth contexts", async () => {
      const authContext1: AuthContext = { clientId: "user-1" };
      const authContext2: AuthContext = { clientId: "user-2" };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // Set multiple entries
        yield* cache.set("job-1", authContext1);
        yield* cache.set("job-2", authContext2);

        const sizeBefore = yield* cache.size();
        expect(sizeBefore).toBe(2);

        // Clear all
        yield* cache.clear();

        const sizeAfter = yield* cache.size();
        expect(sizeAfter).toBe(0);

        // Verify both deleted
        const job1 = yield* cache.get("job-1");
        const job2 = yield* cache.get("job-2");
        expect(job1).toBeNull();
        expect(job2).toBeNull();
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });

    it("should track cache size", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        let size = yield* cache.size();
        expect(size).toBe(0);

        yield* cache.set("job-1", { clientId: "user-1" });
        size = yield* cache.size();
        expect(size).toBe(1);

        yield* cache.set("job-2", { clientId: "user-2" });
        size = yield* cache.size();
        expect(size).toBe(2);

        yield* cache.delete("job-1");
        size = yield* cache.size();
        expect(size).toBe(1);

        yield* cache.clear();
        size = yield* cache.size();
        expect(size).toBe(0);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });

    it("should evict expired entries", async () => {
      // Set very short TTL for testing
      const shortTtl = 50; // 50ms

      const authContext: AuthContext = {
        clientId: "user-123",
      };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // Set auth context
        yield* cache.set("job-1", authContext);

        // Verify it's there immediately
        const immediate = yield* cache.get("job-1");
        expect(immediate).toEqual(authContext);

        // Wait for TTL to expire
        yield* Effect.sleep(100); // Wait 100ms (longer than 50ms TTL)

        // Should be evicted now
        const afterExpiry = yield* cache.get("job-1");
        expect(afterExpiry).toBeNull();
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive({ ttl: shortTtl }))),
      );
    });

    it("should enforce max size limit with LRU eviction", async () => {
      const maxSize = 3;

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // Add entries up to max size
        yield* cache.set("job-1", { clientId: "user-1" });
        yield* Effect.sleep(10); // Small delay to ensure ordering
        yield* cache.set("job-2", { clientId: "user-2" });
        yield* Effect.sleep(10);
        yield* cache.set("job-3", { clientId: "user-3" });

        let size = yield* cache.size();
        expect(size).toBe(3);

        // Add one more - should evict oldest (job-1)
        yield* Effect.sleep(10);
        yield* cache.set("job-4", { clientId: "user-4" });

        size = yield* cache.size();
        expect(size).toBe(3); // Still at max size

        // job-1 should be evicted (oldest)
        const job1 = yield* cache.get("job-1");
        expect(job1).toBeNull();

        // Others should still exist
        const job2 = yield* cache.get("job-2");
        const job3 = yield* cache.get("job-3");
        const job4 = yield* cache.get("job-4");
        expect(job2).toEqual({ clientId: "user-2" });
        expect(job3).toEqual({ clientId: "user-3" });
        expect(job4).toEqual({ clientId: "user-4" });
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive({ maxSize }))),
      );
    });

    it("should handle multiple auth contexts independently", async () => {
      const authContext1: AuthContext = {
        clientId: "user-1",
        metadata: { role: "admin" },
      };
      const authContext2: AuthContext = {
        clientId: "user-2",
        permissions: ["read", "write"],
      };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        yield* cache.set("upload-123", authContext1);
        yield* cache.set("flow-456", authContext2);

        const upload = yield* cache.get("upload-123");
        const flow = yield* cache.get("flow-456");

        expect(upload).toEqual(authContext1);
        expect(flow).toEqual(authContext2);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });

    it("should update existing entry when setting same job ID", async () => {
      const authContext1: AuthContext = { clientId: "user-1" };
      const authContext2: AuthContext = { clientId: "user-2" };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        yield* cache.set("job-1", authContext1);
        const first = yield* cache.get("job-1");
        expect(first).toEqual(authContext1);

        // Update with new auth context
        yield* cache.set("job-1", authContext2);
        const second = yield* cache.get("job-1");
        expect(second).toEqual(authContext2);

        // Should still be only 1 entry
        const size = yield* cache.size();
        expect(size).toBe(1);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(AuthCacheServiceLive())),
      );
    });
  });

  describe("NoAuthCacheServiceLive", () => {
    it("should not cache anything", async () => {
      const authContext: AuthContext = {
        clientId: "user-123",
      };

      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // Try to set
        yield* cache.set("job-1", authContext);

        // Should always return null
        const retrieved = yield* cache.get("job-1");
        expect(retrieved).toBeNull();

        // Size should always be 0
        const size = yield* cache.size();
        expect(size).toBe(0);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(NoAuthCacheServiceLive)),
      );
    });

    it("should handle delete and clear without errors", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* AuthCacheService;

        // These should not throw
        yield* cache.delete("non-existent");
        yield* cache.clear();

        const size = yield* cache.size();
        expect(size).toBe(0);
      });

      await Effect.runPromise(
        program.pipe(Effect.provide(NoAuthCacheServiceLive)),
      );
    });
  });
});
