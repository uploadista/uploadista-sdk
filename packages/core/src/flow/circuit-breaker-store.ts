/**
 * Circuit Breaker Store Implementations.
 *
 * Provides implementations of the CircuitBreakerStore interface for
 * different storage backends.
 *
 * @module flow/circuit-breaker-store
 */

import { Effect, Layer } from "effect";

import { UploadistaError } from "../errors";
import {
  type BaseKvStore,
  BaseKvStoreService,
  jsonSerializer,
} from "../types/kv-store";
import {
  type CircuitBreakerStateData,
  type CircuitBreakerStats,
  type CircuitBreakerStore,
  CircuitBreakerStoreService,
  createInitialCircuitBreakerState,
} from "../types/circuit-breaker-store";

// ============================================================================
// Key Prefix
// ============================================================================

const CIRCUIT_BREAKER_KEY_PREFIX = "uploadista:circuit-breaker:";

// ============================================================================
// KV Store Adapter
// ============================================================================

/**
 * Creates a CircuitBreakerStore backed by any BaseKvStore.
 *
 * This adapter wraps a generic KV store to provide circuit breaker state
 * storage. It handles:
 * - JSON serialization of state data
 * - Sliding window expiry (checked on read/increment)
 * - Read-modify-write for increment operations
 *
 * Note: This implementation uses read-modify-write for increments, which
 * may have race conditions under high concurrency. This is acceptable for
 * circuit breakers as they tolerate eventual consistency.
 *
 * @param baseStore - The underlying KV store
 * @returns A CircuitBreakerStore implementation
 *
 * @example
 * ```typescript
 * const baseStore = makeRedisBaseKvStore({ redis: redisClient });
 * const cbStore = makeKvCircuitBreakerStore(baseStore);
 *
 * // Use the store
 * yield* cbStore.incrementFailures("describe-image", 60000);
 * ```
 */
export function makeKvCircuitBreakerStore(
  baseStore: BaseKvStore,
): CircuitBreakerStore {
  const makeKey = (nodeType: string) =>
    `${CIRCUIT_BREAKER_KEY_PREFIX}${nodeType}`;

  const getStateInternal = (
    nodeType: string,
  ): Effect.Effect<CircuitBreakerStateData | null, UploadistaError> =>
    Effect.gen(function* () {
      const key = makeKey(nodeType);
      const raw = yield* baseStore.get(key);

      if (raw === null) {
        return null;
      }

      try {
        const state = jsonSerializer.deserialize<CircuitBreakerStateData>(raw);
        return state;
      } catch {
        // Corrupted state - delete and return null
        yield* baseStore.delete(key);
        return null;
      }
    });

  const setStateInternal = (
    nodeType: string,
    state: CircuitBreakerStateData,
  ): Effect.Effect<void, UploadistaError> => {
    const key = makeKey(nodeType);
    const serialized = jsonSerializer.serialize(state);
    return baseStore.set(key, serialized);
  };

  return {
    getState: getStateInternal,

    setState: setStateInternal,

    incrementFailures: (nodeType: string, windowDuration: number) =>
      Effect.gen(function* () {
        const now = Date.now();
        let state = yield* getStateInternal(nodeType);

        if (state === null) {
          // Initialize with default config - will be overwritten by real config on first use
          state = createInitialCircuitBreakerState({
            failureThreshold: 5,
            resetTimeout: 30000,
            halfOpenRequests: 3,
            windowDuration,
          });
        }

        // Check if window has expired
        if (now - state.windowStart > windowDuration) {
          // Window expired - reset count and window
          state = {
            ...state,
            failureCount: 1, // This is the first failure in new window
            windowStart: now,
          };
        } else {
          // Window still valid - increment
          state = {
            ...state,
            failureCount: state.failureCount + 1,
          };
        }

        yield* setStateInternal(nodeType, state);
        return state.failureCount;
      }),

    resetFailures: (nodeType: string) =>
      Effect.gen(function* () {
        const state = yield* getStateInternal(nodeType);
        if (state !== null) {
          yield* setStateInternal(nodeType, {
            ...state,
            failureCount: 0,
            windowStart: Date.now(),
          });
        }
      }),

    incrementHalfOpenSuccesses: (nodeType: string) =>
      Effect.gen(function* () {
        const state = yield* getStateInternal(nodeType);
        if (state === null) {
          return 1;
        }

        const newState = {
          ...state,
          halfOpenSuccesses: state.halfOpenSuccesses + 1,
        };
        yield* setStateInternal(nodeType, newState);
        return newState.halfOpenSuccesses;
      }),

    getAllStats: () =>
      Effect.gen(function* () {
        const stats = new Map<string, CircuitBreakerStats>();

        if (!baseStore.list) {
          // If list is not supported, return empty map
          return stats;
        }

        const keys = yield* baseStore.list(CIRCUIT_BREAKER_KEY_PREFIX);
        const now = Date.now();

        for (const key of keys) {
          const nodeType = key; // Key is already stripped of prefix by list()
          const state = yield* getStateInternal(nodeType);

          if (state !== null) {
            const timeSinceLastStateChange = now - state.lastStateChange;

            stats.set(nodeType, {
              nodeType,
              state: state.state,
              failureCount: state.failureCount,
              halfOpenSuccesses: state.halfOpenSuccesses,
              timeSinceLastStateChange,
              timeUntilHalfOpen:
                state.state === "open"
                  ? Math.max(
                      0,
                      state.config.resetTimeout - timeSinceLastStateChange,
                    )
                  : undefined,
            });
          }
        }

        return stats;
      }),

    delete: (nodeType: string) => baseStore.delete(makeKey(nodeType)),
  };
}

// ============================================================================
// Memory Store (for single-instance / testing)
// ============================================================================

/**
 * Creates an in-memory CircuitBreakerStore.
 *
 * This implementation keeps all state in memory and is suitable for:
 * - Single-instance deployments
 * - Development and testing
 * - Serverless functions (where state is ephemeral anyway)
 *
 * @returns A CircuitBreakerStore backed by in-memory Map
 *
 * @example
 * ```typescript
 * const cbStore = makeMemoryCircuitBreakerStore();
 *
 * // Use for testing
 * yield* cbStore.incrementFailures("test-node", 60000);
 * const state = yield* cbStore.getState("test-node");
 * ```
 */
export function makeMemoryCircuitBreakerStore(): CircuitBreakerStore {
  const store = new Map<string, CircuitBreakerStateData>();

  return {
    getState: (nodeType: string) =>
      Effect.succeed(store.get(nodeType) ?? null),

    setState: (nodeType: string, state: CircuitBreakerStateData) =>
      Effect.sync(() => {
        store.set(nodeType, state);
      }),

    incrementFailures: (nodeType: string, windowDuration: number) =>
      Effect.sync(() => {
        const now = Date.now();
        let state = store.get(nodeType);

        if (state === undefined) {
          state = createInitialCircuitBreakerState({
            failureThreshold: 5,
            resetTimeout: 30000,
            halfOpenRequests: 3,
            windowDuration,
          });
        }

        // Check if window has expired
        if (now - state.windowStart > windowDuration) {
          state = {
            ...state,
            failureCount: 1,
            windowStart: now,
          };
        } else {
          state = {
            ...state,
            failureCount: state.failureCount + 1,
          };
        }

        store.set(nodeType, state);
        return state.failureCount;
      }),

    resetFailures: (nodeType: string) =>
      Effect.sync(() => {
        const state = store.get(nodeType);
        if (state !== undefined) {
          store.set(nodeType, {
            ...state,
            failureCount: 0,
            windowStart: Date.now(),
          });
        }
      }),

    incrementHalfOpenSuccesses: (nodeType: string) =>
      Effect.sync(() => {
        const state = store.get(nodeType);
        if (state === undefined) {
          return 1;
        }

        const newState = {
          ...state,
          halfOpenSuccesses: state.halfOpenSuccesses + 1,
        };
        store.set(nodeType, newState);
        return newState.halfOpenSuccesses;
      }),

    getAllStats: () =>
      Effect.sync(() => {
        const stats = new Map<string, CircuitBreakerStats>();
        const now = Date.now();

        for (const [nodeType, state] of store) {
          const timeSinceLastStateChange = now - state.lastStateChange;

          stats.set(nodeType, {
            nodeType,
            state: state.state,
            failureCount: state.failureCount,
            halfOpenSuccesses: state.halfOpenSuccesses,
            timeSinceLastStateChange,
            timeUntilHalfOpen:
              state.state === "open"
                ? Math.max(
                    0,
                    state.config.resetTimeout - timeSinceLastStateChange,
                  )
                : undefined,
          });
        }

        return stats;
      }),

    delete: (nodeType: string) =>
      Effect.sync(() => {
        store.delete(nodeType);
      }),
  };
}

// ============================================================================
// Effect Layers
// ============================================================================

/**
 * Effect Layer that provides a CircuitBreakerStore backed by the BaseKvStore.
 *
 * Use this layer when you want circuit breaker state to be distributed
 * across multiple instances (e.g., in a cluster).
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const cbStore = yield* CircuitBreakerStoreService;
 *   // ...
 * }).pipe(
 *   Effect.provide(kvCircuitBreakerStoreLayer),
 *   Effect.provide(redisKvStore({ redis: redisClient }))
 * );
 * ```
 */
export const kvCircuitBreakerStoreLayer = Layer.effect(
  CircuitBreakerStoreService,
  Effect.gen(function* () {
    const baseStore = yield* BaseKvStoreService;
    return makeKvCircuitBreakerStore(baseStore);
  }),
);

/**
 * Effect Layer that provides an in-memory CircuitBreakerStore.
 *
 * Use this layer for single-instance deployments, development, or testing.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const cbStore = yield* CircuitBreakerStoreService;
 *   // ...
 * }).pipe(
 *   Effect.provide(memoryCircuitBreakerStoreLayer)
 * );
 * ```
 */
export const memoryCircuitBreakerStoreLayer = Layer.succeed(
  CircuitBreakerStoreService,
  makeMemoryCircuitBreakerStore(),
);
