import { Context, Effect, Layer } from "effect";
import type { AuthContext } from "./types";

/**
 * Configuration options for the auth cache.
 */
export type AuthCacheConfig = {
  /**
   * Maximum number of entries in the cache.
   * When exceeded, oldest entries are removed (LRU eviction).
   * @default 10000
   */
  maxSize?: number;

  /**
   * Time-to-live for cache entries in milliseconds.
   * Entries older than this will be automatically evicted.
   * @default 3600000 (1 hour)
   */
  ttl?: number;
};

/**
 * Cache entry with auth context and timestamp.
 */
type CacheEntry = {
  authContext: AuthContext;
  timestamp: number;
};

/**
 * Auth Cache Service
 *
 * Provides caching of authentication contexts for upload and flow jobs.
 * This allows subsequent operations (chunk uploads, flow continuations)
 * to reuse the auth context from the initial request without re-authenticating.
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { AuthCacheService } from "@uploadista/server";
 *
 * const handler = Effect.gen(function* () {
 *   const authCache = yield* AuthCacheService;
 *   const authContext = { userId: "user-123" };
 *
 *   // Cache auth for upload
 *   yield* authCache.set("upload-abc", authContext);
 *
 *   // Retrieve cached auth later
 *   const cached = yield* authCache.get("upload-abc");
 *   console.log(cached?.userId); // "user-123"
 *
 *   // Clear when done
 *   yield* authCache.delete("upload-abc");
 * });
 * ```
 */
export class AuthCacheService extends Context.Tag("AuthCacheService")<
  AuthCacheService,
  {
    /**
     * Store an auth context for a job ID.
     */
    readonly set: (
      jobId: string,
      authContext: AuthContext,
    ) => Effect.Effect<void>;

    /**
     * Retrieve a cached auth context by job ID.
     * Returns null if not found or expired.
     */
    readonly get: (jobId: string) => Effect.Effect<AuthContext | null>;

    /**
     * Delete a cached auth context by job ID.
     */
    readonly delete: (jobId: string) => Effect.Effect<void>;

    /**
     * Clear all cached auth contexts.
     */
    readonly clear: () => Effect.Effect<void>;

    /**
     * Get the current number of cached entries.
     */
    readonly size: () => Effect.Effect<number>;
  }
>() {}

/**
 * Creates an AuthCacheService Layer with in-memory storage.
 *
 * @param config - Optional configuration for cache behavior
 * @returns Effect Layer providing AuthCacheService
 */
export const AuthCacheServiceLive = (
  config: AuthCacheConfig = {},
): Layer.Layer<AuthCacheService> => {
  const maxSize = config.maxSize ?? 10000;
  const ttl = config.ttl ?? 3600000; // 1 hour default

  // In-memory cache storage
  const cache = new Map<string, CacheEntry>();

  /**
   * Evict expired entries based on TTL.
   */
  const evictExpired = (): void => {
    const now = Date.now();
    for (const [jobId, entry] of cache.entries()) {
      if (now - entry.timestamp > ttl) {
        cache.delete(jobId);
      }
    }
  };

  /**
   * Enforce max size limit using LRU eviction.
   * Removes oldest entry when cache exceeds max size.
   */
  const enforceSizeLimit = (): void => {
    if (cache.size <= maxSize) return;

    // Find and remove oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Number.POSITIVE_INFINITY;

    for (const [jobId, entry] of cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = jobId;
      }
    }

    if (oldestKey) {
      cache.delete(oldestKey);
    }
  };

  return Layer.succeed(AuthCacheService, {
    set: (jobId: string, authContext: AuthContext) =>
      Effect.sync(() => {
        // Evict expired entries periodically
        if (cache.size % 100 === 0) {
          evictExpired();
        }

        cache.set(jobId, {
          authContext,
          timestamp: Date.now(),
        });

        // Enforce size limit after adding
        enforceSizeLimit();
      }),

    get: (jobId: string) =>
      Effect.sync(() => {
        const entry = cache.get(jobId);
        if (!entry) return null;

        // Check if expired
        const now = Date.now();
        if (now - entry.timestamp > ttl) {
          cache.delete(jobId);
          return null;
        }

        return entry.authContext;
      }),

    delete: (jobId: string) =>
      Effect.sync(() => {
        cache.delete(jobId);
      }),

    clear: () =>
      Effect.sync(() => {
        cache.clear();
      }),

    size: () =>
      Effect.sync(() => {
        return cache.size;
      }),
  });
};

/**
 * No-op implementation of AuthCacheService.
 * Does not cache anything - all operations are no-ops.
 * Used when caching is disabled or not needed.
 */
export const NoAuthCacheServiceLive: Layer.Layer<AuthCacheService> =
  Layer.succeed(AuthCacheService, {
    set: () => Effect.void,
    get: () => Effect.succeed(null),
    delete: () => Effect.void,
    clear: () => Effect.void,
    size: () => Effect.succeed(0),
  });
