/**
 * Distributed Circuit Breaker implementation.
 *
 * This module provides a circuit breaker that stores state in a distributed
 * store, allowing multiple instances in a cluster to share circuit state.
 *
 * @module flow/distributed-circuit-breaker
 */

import { Effect } from "effect";
import type { UploadistaError } from "../errors";
import {
  type CircuitBreakerStateData,
  type CircuitBreakerStateValue,
  type CircuitBreakerStore,
  createInitialCircuitBreakerState,
} from "../types/circuit-breaker-store";
import {
  type CircuitBreakerConfig,
  type CircuitBreakerEventHandler,
  type CircuitBreakerFallback,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
} from "./circuit-breaker";

// ============================================================================
// Distributed Circuit Breaker
// ============================================================================

/**
 * Result of checking if a request is allowed.
 */
export interface AllowRequestResult {
  allowed: boolean;
  state: CircuitBreakerStateValue;
  failureCount: number;
}

/**
 * Distributed circuit breaker that uses a store for state persistence.
 *
 * Unlike the in-memory CircuitBreaker, this implementation stores all state
 * in a CircuitBreakerStore, allowing multiple instances to share circuit state.
 *
 * All operations are Effect-based since they may involve I/O.
 *
 * @example
 * ```typescript
 * const breaker = new DistributedCircuitBreaker(
 *   "describe-image",
 *   { enabled: true, failureThreshold: 5 },
 *   store
 * );
 *
 * // Check if request is allowed
 * const { allowed, state } = yield* breaker.allowRequest();
 * if (!allowed) {
 *   // Handle circuit open
 * }
 *
 * // Record result
 * try {
 *   const result = yield* executeNode();
 *   yield* breaker.recordSuccess();
 *   return result;
 * } catch (error) {
 *   yield* breaker.recordFailure(error.message);
 *   throw error;
 * }
 * ```
 */
export class DistributedCircuitBreaker {
  private eventHandler?: CircuitBreakerEventHandler;

  readonly nodeType: string;
  readonly config: Required<Omit<CircuitBreakerConfig, "fallback">> & {
    fallback: CircuitBreakerFallback;
  };
  readonly store: CircuitBreakerStore;

  constructor(
    nodeType: string,
    config: CircuitBreakerConfig,
    store: CircuitBreakerStore,
  ) {
    this.nodeType = nodeType;
    this.config = {
      enabled: config.enabled ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.enabled,
      failureThreshold:
        config.failureThreshold ??
        DEFAULT_CIRCUIT_BREAKER_CONFIG.failureThreshold,
      resetTimeout:
        config.resetTimeout ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.resetTimeout,
      halfOpenRequests:
        config.halfOpenRequests ??
        DEFAULT_CIRCUIT_BREAKER_CONFIG.halfOpenRequests,
      windowDuration:
        config.windowDuration ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.windowDuration,
      fallback: config.fallback ?? DEFAULT_CIRCUIT_BREAKER_CONFIG.fallback,
    };
    this.store = store;
  }

  /**
   * Sets the event handler for state change notifications.
   */
  setEventHandler(handler: CircuitBreakerEventHandler): void {
    this.eventHandler = handler;
  }

  /**
   * Checks if a request is allowed through the circuit.
   *
   * This method reads state from the store, checks for time-based transitions,
   * and returns whether the request should proceed.
   */
  allowRequest(): Effect.Effect<AllowRequestResult, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      if (!self.config.enabled) {
        return { allowed: true, state: "closed" as const, failureCount: 0 };
      }

      let state = yield* self.store.getState(self.nodeType);
      const now = Date.now();

      // Initialize state if not exists
      if (state === null) {
        state = createInitialCircuitBreakerState({
          failureThreshold: self.config.failureThreshold,
          resetTimeout: self.config.resetTimeout,
          halfOpenRequests: self.config.halfOpenRequests,
          windowDuration: self.config.windowDuration,
        });
        yield* self.store.setState(self.nodeType, state);
      }

      // Check for time-based transition: open -> half-open
      if (state.state === "open") {
        const timeSinceOpen = now - state.lastStateChange;
        if (timeSinceOpen >= self.config.resetTimeout) {
          // Transition to half-open
          const previousState = state.state;
          state = {
            ...state,
            state: "half-open",
            halfOpenSuccesses: 0,
            lastStateChange: now,
          };
          yield* self.store.setState(self.nodeType, state);
          yield* self.emitEvent(previousState, "half-open", state.failureCount);
        }
      }

      // Determine if request is allowed
      const allowed = state.state !== "open";

      return {
        allowed,
        state: state.state,
        failureCount: state.failureCount,
      };
    });
  }

  /**
   * Gets the current circuit state from the store.
   */
  getState(): Effect.Effect<CircuitBreakerStateValue, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.store.getState(self.nodeType);
      return state?.state ?? "closed";
    });
  }

  /**
   * Gets the current failure count from the store.
   */
  getFailureCount(): Effect.Effect<number, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.store.getState(self.nodeType);
      return state?.failureCount ?? 0;
    });
  }

  /**
   * Records a successful execution.
   *
   * In half-open state, tracks successes toward closing the circuit.
   * In closed state, resets the failure count.
   */
  recordSuccess(): Effect.Effect<void, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      if (!self.config.enabled) {
        return;
      }

      const state = yield* self.store.getState(self.nodeType);
      if (state === null) {
        return;
      }

      if (state.state === "half-open") {
        const newSuccessCount = yield* self.store.incrementHalfOpenSuccesses(
          self.nodeType,
        );
        if (newSuccessCount >= self.config.halfOpenRequests) {
          // Transition to closed
          yield* self.transitionTo("closed", state.failureCount);
        }
      } else if (state.state === "closed") {
        // Reset failure count on success
        yield* self.store.resetFailures(self.nodeType);
      }
    });
  }

  /**
   * Records a failed execution.
   *
   * In closed state, increments failure count and may trip the circuit.
   * In half-open state, immediately reopens the circuit.
   */
  recordFailure(_errorMessage: string): Effect.Effect<void, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      if (!self.config.enabled) {
        return;
      }

      const state = yield* self.store.getState(self.nodeType);

      if (state === null || state.state === "closed") {
        // Increment failures and check threshold
        const newFailureCount = yield* self.store.incrementFailures(
          self.nodeType,
          self.config.windowDuration,
        );

        if (newFailureCount >= self.config.failureThreshold) {
          // Trip the circuit
          yield* self.transitionTo("open", newFailureCount);
        }
      } else if (state.state === "half-open") {
        // Any failure in half-open reopens the circuit
        yield* self.transitionTo("open", state.failureCount);
      }
      // In open state, failures are ignored (requests shouldn't reach here)
    });
  }

  /**
   * Gets the fallback configuration.
   */
  getFallback(): CircuitBreakerFallback {
    return this.config.fallback;
  }

  /**
   * Resets the circuit breaker to closed state.
   */
  reset(): Effect.Effect<void, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      const state = yield* self.store.getState(self.nodeType);
      const previousState = state?.state ?? "closed";

      yield* self.store.setState(
        self.nodeType,
        createInitialCircuitBreakerState({
          failureThreshold: self.config.failureThreshold,
          resetTimeout: self.config.resetTimeout,
          halfOpenRequests: self.config.halfOpenRequests,
          windowDuration: self.config.windowDuration,
        }),
      );

      if (previousState !== "closed") {
        yield* self.emitEvent(previousState, "closed", 0);
      }
    });
  }

  /**
   * Transitions to a new state.
   */
  private transitionTo(
    newState: CircuitBreakerStateValue,
    failureCount: number,
  ): Effect.Effect<void, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      const currentState = yield* self.store.getState(self.nodeType);
      const previousState = currentState?.state ?? "closed";

      if (previousState === newState) {
        return;
      }

      const now = Date.now();
      const updatedState: CircuitBreakerStateData = {
        state: newState,
        failureCount: newState === "closed" ? 0 : failureCount,
        lastStateChange: now,
        halfOpenSuccesses: 0,
        windowStart:
          newState === "closed" ? now : (currentState?.windowStart ?? now),
        config: {
          failureThreshold: self.config.failureThreshold,
          resetTimeout: self.config.resetTimeout,
          halfOpenRequests: self.config.halfOpenRequests,
          windowDuration: self.config.windowDuration,
        },
      };

      yield* self.store.setState(self.nodeType, updatedState);
      yield* self.emitEvent(previousState, newState, failureCount);
    });
  }

  /**
   * Emits a state change event if handler is set.
   */
  private emitEvent(
    previousState: CircuitBreakerStateValue,
    newState: CircuitBreakerStateValue,
    failureCount: number,
  ): Effect.Effect<void, never, never> {
    const self = this;
    return Effect.gen(function* () {
      if (self.eventHandler) {
        yield* self.eventHandler({
          nodeType: self.nodeType,
          previousState,
          newState,
          timestamp: Date.now(),
          failureCount,
        });
      }
    });
  }
}

// ============================================================================
// Distributed Circuit Breaker Registry
// ============================================================================

/**
 * Registry for managing distributed circuit breakers.
 *
 * Unlike the in-memory CircuitBreakerRegistry, this registry creates
 * DistributedCircuitBreaker instances that share state via a store.
 *
 * @example
 * ```typescript
 * const store = makeKvCircuitBreakerStore(baseKvStore);
 * const registry = new DistributedCircuitBreakerRegistry(store);
 *
 * const breaker = registry.getOrCreate("describe-image", {
 *   enabled: true,
 *   failureThreshold: 5
 * });
 * ```
 */
export class DistributedCircuitBreakerRegistry {
  private breakers: Map<string, DistributedCircuitBreaker> = new Map();
  private eventHandler?: CircuitBreakerEventHandler;

  constructor(readonly store: CircuitBreakerStore) {}

  /**
   * Sets a global event handler for all circuit breakers.
   */
  setEventHandler(handler: CircuitBreakerEventHandler): void {
    this.eventHandler = handler;
    for (const breaker of this.breakers.values()) {
      breaker.setEventHandler(handler);
    }
  }

  /**
   * Gets an existing circuit breaker or creates a new one.
   */
  getOrCreate(
    nodeType: string,
    config: CircuitBreakerConfig,
  ): DistributedCircuitBreaker {
    let breaker = this.breakers.get(nodeType);
    if (!breaker) {
      breaker = new DistributedCircuitBreaker(nodeType, config, this.store);
      if (this.eventHandler) {
        breaker.setEventHandler(this.eventHandler);
      }
      this.breakers.set(nodeType, breaker);
    }
    return breaker;
  }

  /**
   * Gets an existing circuit breaker if it exists.
   */
  get(nodeType: string): DistributedCircuitBreaker | undefined {
    return this.breakers.get(nodeType);
  }

  /**
   * Gets statistics for all circuit breakers from the store.
   */
  getAllStats(): Effect.Effect<
    Map<string, { state: CircuitBreakerStateValue; failureCount: number }>,
    UploadistaError
  > {
    return this.store.getAllStats();
  }

  /**
   * Resets all circuit breakers.
   */
  resetAll(): Effect.Effect<void, UploadistaError> {
    const self = this;
    return Effect.gen(function* () {
      for (const breaker of self.breakers.values()) {
        yield* breaker.reset();
      }
    });
  }

  /**
   * Clears all circuit breakers from the local cache.
   * Note: This does not clear state from the store.
   */
  clear(): void {
    this.breakers.clear();
  }
}
