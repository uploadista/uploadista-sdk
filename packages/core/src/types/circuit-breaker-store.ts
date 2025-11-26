/**
 * Circuit Breaker Store - Distributed state storage for circuit breakers.
 *
 * This module defines the interface for storing circuit breaker state in
 * distributed environments. It allows circuit breaker state to be shared
 * across multiple instances in a cluster.
 *
 * @module types/circuit-breaker-store
 */

import { Context, Effect, Layer } from "effect";
import { UploadistaError } from "../errors";

// ============================================================================
// State Types
// ============================================================================

/**
 * Circuit breaker state values.
 */
export type CircuitBreakerStateValue = "closed" | "open" | "half-open";

/**
 * Persisted circuit breaker state data.
 *
 * This represents the full state of a circuit breaker that needs to be
 * stored and shared across instances.
 */
export interface CircuitBreakerStateData {
  /** Current circuit state */
  state: CircuitBreakerStateValue;
  /** Number of failures in current window */
  failureCount: number;
  /** Timestamp of last state transition */
  lastStateChange: number;
  /** Number of successful requests in half-open state */
  halfOpenSuccesses: number;
  /** Timestamp when the current failure window started */
  windowStart: number;
  /** Configuration snapshot for consistency */
  config: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenRequests: number;
    windowDuration: number;
  };
}

/**
 * Statistics about a circuit breaker.
 */
export interface CircuitBreakerStats {
  nodeType: string;
  state: CircuitBreakerStateValue;
  failureCount: number;
  halfOpenSuccesses: number;
  timeSinceLastStateChange: number;
  timeUntilHalfOpen?: number; // Only when state is "open"
}

// ============================================================================
// Store Interface
// ============================================================================

/**
 * Interface for circuit breaker state storage.
 *
 * Implementations should handle distributed state for circuit breakers,
 * allowing multiple instances to share circuit state. The interface is
 * designed to work with eventually consistent stores - perfect consistency
 * is not required for circuit breaker functionality.
 *
 * @example
 * ```typescript
 * // Using the store
 * const store: CircuitBreakerStore = yield* CircuitBreakerStoreService;
 *
 * // Record a failure
 * const newCount = yield* store.incrementFailures("describe-image", 60000);
 * if (newCount >= 5) {
 *   yield* store.setState("describe-image", {
 *     state: "open",
 *     failureCount: newCount,
 *     lastStateChange: Date.now(),
 *     // ...
 *   });
 * }
 * ```
 */
export interface CircuitBreakerStore {
  /**
   * Gets the current state data for a circuit breaker.
   *
   * @param nodeType - The node type identifier
   * @returns The state data or null if no state exists
   */
  readonly getState: (
    nodeType: string,
  ) => Effect.Effect<CircuitBreakerStateData | null, UploadistaError>;

  /**
   * Sets the complete state for a circuit breaker.
   *
   * @param nodeType - The node type identifier
   * @param state - The new state data
   */
  readonly setState: (
    nodeType: string,
    state: CircuitBreakerStateData,
  ) => Effect.Effect<void, UploadistaError>;

  /**
   * Increments the failure count and returns the new count.
   *
   * This operation should be atomic where possible. For stores that don't
   * support atomic increment, a read-modify-write is acceptable as circuit
   * breakers tolerate eventual consistency.
   *
   * The implementation should also handle window expiry - if the window
   * has expired, reset the count before incrementing.
   *
   * @param nodeType - The node type identifier
   * @param windowDuration - Duration of the sliding window in milliseconds
   * @returns The new failure count after incrementing
   */
  readonly incrementFailures: (
    nodeType: string,
    windowDuration: number,
  ) => Effect.Effect<number, UploadistaError>;

  /**
   * Resets the failure count to zero.
   *
   * Called when circuit closes or on successful requests.
   *
   * @param nodeType - The node type identifier
   */
  readonly resetFailures: (
    nodeType: string,
  ) => Effect.Effect<void, UploadistaError>;

  /**
   * Increments the half-open success count.
   *
   * @param nodeType - The node type identifier
   * @returns The new half-open success count
   */
  readonly incrementHalfOpenSuccesses: (
    nodeType: string,
  ) => Effect.Effect<number, UploadistaError>;

  /**
   * Gets statistics for all tracked circuit breakers.
   *
   * @returns Map of node type to stats
   */
  readonly getAllStats: () => Effect.Effect<
    Map<string, CircuitBreakerStats>,
    UploadistaError
  >;

  /**
   * Deletes circuit breaker state for a node type.
   *
   * @param nodeType - The node type identifier
   */
  readonly delete: (nodeType: string) => Effect.Effect<void, UploadistaError>;
}

// ============================================================================
// Effect Context
// ============================================================================

/**
 * Effect-TS context tag for the CircuitBreakerStore service.
 *
 * Use this to inject a circuit breaker store into your Effect programs.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const cbStore = yield* CircuitBreakerStoreService;
 *   const state = yield* cbStore.getState("my-node-type");
 *   // ...
 * });
 *
 * // Provide the implementation
 * const result = yield* program.pipe(
 *   Effect.provide(kvCircuitBreakerStoreLayer)
 * );
 * ```
 */
export class CircuitBreakerStoreService extends Context.Tag(
  "CircuitBreakerStoreService",
)<CircuitBreakerStoreService, CircuitBreakerStore>() {}

// ============================================================================
// Default State Factory
// ============================================================================

/**
 * Creates a default initial state for a circuit breaker.
 *
 * @param config - Circuit breaker configuration
 * @returns Initial state data with closed circuit
 */
export function createInitialCircuitBreakerState(config: {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
  windowDuration: number;
}): CircuitBreakerStateData {
  const now = Date.now();
  return {
    state: "closed",
    failureCount: 0,
    lastStateChange: now,
    halfOpenSuccesses: 0,
    windowStart: now,
    config,
  };
}
