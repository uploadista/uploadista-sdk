/**
 * Test Utilities for Effect-based Testing
 *
 * This file provides reusable test utilities and Layer mocking patterns
 * for testing Effect-based code in the uploadista-sdk.
 *
 * ## Effect Testing Patterns
 *
 * ### 1. Using it.effect()
 * For testing Effect operations with automatic TestContext provision:
 *
 * ```typescript
 * import { it } from "@effect/vitest";
 * import { Effect } from "effect";
 *
 * it.effect("should process data", () =>
 *   Effect.gen(function* () {
 *     const result = yield* processData();
 *     expect(result).toBe(expected);
 *   })
 * );
 * ```
 *
 * ### 2. Using TestClock for Time Control
 * For testing timeouts, delays, and scheduled operations:
 *
 * ```typescript
 * import { it } from "@effect/vitest";
 * import { Effect, TestClock } from "effect";
 *
 * it.effect("should handle timeout", () =>
 *   Effect.gen(function* () {
 *     const fiber = yield* Effect.timeout(operation, "5 seconds").pipe(
 *       Effect.fork
 *     );
 *
 *     // Advance time without real delay
 *     yield* TestClock.adjust("6 seconds");
 *
 *     const result = yield* Fiber.join(fiber);
 *     expect(result).toBe(None);
 *   })
 * );
 * ```
 *
 * ### 3. Using Layer.mock() for Service Mocking
 * For mocking Effect services with partial implementations:
 *
 * ```typescript
 * import { Layer, Context } from "effect";
 *
 * // Define Test layer (mock)
 * const DataStoreTest = Layer.succeed(
 *   DataStore,
 *   DataStore.of({
 *     upload: () => Effect.succeed({ key: "test-key" }),
 *     download: () => Effect.fail(new Error("Not implemented")),
 *   })
 * );
 *
 * // Use in tests
 * it.effect("should upload file", () =>
 *   Effect.gen(function* () {
 *     const store = yield* DataStore;
 *     const result = yield* store.upload(file);
 *     expect(result.key).toBe("test-key");
 *   }).pipe(Effect.provide(DataStoreTest))
 * );
 * ```
 *
 * ### 4. Using it.scoped() for Resource Management
 * For tests requiring Scope lifecycle management:
 *
 * ```typescript
 * import { it } from "@effect/vitest";
 * import { Effect } from "effect";
 *
 * it.scoped("should manage resources", () =>
 *   Effect.gen(function* () {
 *     const resource = yield* acquireResource();
 *     // Resource will be automatically released after test
 *     yield* useResource(resource);
 *   })
 * );
 * ```
 *
 * ### 5. Test vs Live Layer Naming Convention
 * Follow Effect's convention for layer naming:
 * - `ServiceNameLive` - Production layer with real implementation
 * - `ServiceNameTest` - Test layer with mocked implementation
 *
 * Example:
 * ```typescript
 * export const S3StoreLive = Layer.effect(...)  // Real S3 client
 * export const S3StoreTest = Layer.succeed(...)  // Mocked S3 client
 * ```
 */

import { Context, Effect, Layer } from "effect";

/**
 * Example: Mock Data Store Layer
 *
 * This demonstrates creating a mock layer for a data store service.
 * Replace with actual service interfaces as needed.
 */

// Example service interface (replace with actual interfaces from core)
export interface MockDataStore {
  readonly upload: (data: Uint8Array) => Effect.Effect<{ key: string }, Error>;
  readonly download: (key: string) => Effect.Effect<Uint8Array, Error>;
  readonly delete: (key: string) => Effect.Effect<void, Error>;
}

export const MockDataStore = Context.GenericTag<MockDataStore>(
  "@uploadista/MockDataStore",
);

/**
 * Test layer for MockDataStore with in-memory storage
 */
export const MockDataStoreTest = Layer.succeed(
  MockDataStore,
  MockDataStore.of({
    upload: (data: Uint8Array) =>
      Effect.succeed({ key: `mock-key-${data.length}` }),
    download: (_key: string) =>
      Effect.succeed(new Uint8Array([1, 2, 3])) as Effect.Effect<
        Uint8Array,
        Error
      >,
    delete: (_key: string) => Effect.void,
  }),
);

/**
 * Example: Mock KV Store Layer
 */
export interface MockKVStore {
  readonly get: (key: string) => Effect.Effect<string | null, Error>;
  readonly set: (
    key: string,
    value: string,
    ttl?: number,
  ) => Effect.Effect<void, Error>;
  readonly delete: (key: string) => Effect.Effect<void, Error>;
}

export const MockKVStore = Context.GenericTag<MockKVStore>(
  "@uploadista/MockKVStore",
);

/**
 * Test layer for MockKVStore with in-memory Map
 */
export const MockKVStoreTest = (() => {
  const store = new Map<string, string>();

  return Layer.succeed(
    MockKVStore,
    MockKVStore.of({
      get: (key: string) => Effect.succeed(store.get(key) ?? null),
      set: (key: string, value: string) =>
        Effect.sync(() => {
          store.set(key, value);
        }),
      delete: (key: string) =>
        Effect.sync(() => {
          store.delete(key);
        }),
    }),
  );
})();

/**
 * Utility to create a Layer that fails (useful for testing error scenarios)
 */
export const createFailingLayer = <T>(
  _tag: Context.Tag<T, T>,
  error: Error,
): Layer.Layer<T, Error, never> => {
  return Layer.fail(error);
};
