/**
 * Circuit Breaker Pattern types and configuration for the Uploadista flow engine.
 *
 * This module provides the types, configuration, and constants for the circuit breaker
 * pattern. The actual implementation is in {@link DistributedCircuitBreaker} which
 * uses a {@link CircuitBreakerStore} for distributed state management.
 *
 * @module flow/circuit-breaker
 * @see {@link DistributedCircuitBreaker} for the main implementation
 * @see {@link CircuitBreakerStore} for storage interface
 */

import type { Effect } from "effect";

// ============================================================================
// Types
// ============================================================================

/**
 * Circuit breaker state machine states.
 *
 * - `closed`: Normal operation, tracking failures in sliding window
 * - `open`: Rejecting all requests immediately, waiting for reset timeout
 * - `half-open`: Allowing limited test requests to probe service health
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Configuration for a circuit breaker.
 *
 * @property enabled - Whether circuit breaker is active (default: false for backward compatibility)
 * @property failureThreshold - Number of failures within window to trip circuit (default: 5)
 * @property resetTimeout - Milliseconds to wait in open state before half-open (default: 30000)
 * @property halfOpenRequests - Number of successful requests in half-open to close (default: 3)
 * @property windowDuration - Sliding window duration in milliseconds (default: 60000)
 * @property fallback - Behavior when circuit is open
 */
export interface CircuitBreakerConfig {
  /** Whether circuit breaker is active (default: false) */
  enabled?: boolean;
  /** Number of failures within window to trip circuit (default: 5) */
  failureThreshold?: number;
  /** Milliseconds to wait in open state before half-open (default: 30000) */
  resetTimeout?: number;
  /** Number of successful requests in half-open to close (default: 3) */
  halfOpenRequests?: number;
  /** Sliding window duration in milliseconds (default: 60000) */
  windowDuration?: number;
  /** Behavior when circuit is open */
  fallback?: CircuitBreakerFallback;
}

/**
 * Fallback behavior when circuit is open.
 *
 * - `fail`: Fail immediately with CIRCUIT_BREAKER_OPEN error (default)
 * - `skip`: Skip node, pass input through as output
 * - `default`: Return a configured default value
 */
export type CircuitBreakerFallback =
  | { type: "fail" }
  | { type: "skip"; passThrough: true }
  | { type: "default"; value: unknown };

/**
 * Event emitted when circuit state changes.
 */
export interface CircuitBreakerEvent {
  nodeType: string;
  previousState: CircuitBreakerState;
  newState: CircuitBreakerState;
  timestamp: number;
  failureCount?: number;
}

/**
 * Callback type for circuit state change events.
 */
export type CircuitBreakerEventHandler = (
  event: CircuitBreakerEvent,
) => Effect.Effect<void, never, never>;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default circuit breaker configuration values.
 */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: Required<
  Omit<CircuitBreakerConfig, "fallback">
> & { fallback: CircuitBreakerFallback } = {
  enabled: false,
  failureThreshold: 5,
  resetTimeout: 30000,
  halfOpenRequests: 3,
  windowDuration: 60000,
  fallback: { type: "fail" },
};
