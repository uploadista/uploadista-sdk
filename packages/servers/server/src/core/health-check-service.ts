/**
 * Health Check Service for Uploadista SDK.
 *
 * This module provides health checking functionality for:
 * - Storage backends
 * - KV stores
 * - Event broadcasters
 * - Circuit breaker state
 * - Dead letter queue state
 *
 * @module core/health-check-service
 */

import { DeadLetterQueueService } from "@uploadista/core/flow";
import type {
  CircuitBreakerHealthSummary,
  ComponentHealth,
  DlqHealthSummary,
  HealthCheckConfig,
  HealthComponents,
  HealthResponse,
  HealthStatus,
} from "@uploadista/core/types";
import {
  CircuitBreakerStoreService,
  DEFAULT_HEALTH_CHECK_CONFIG,
} from "@uploadista/core/types";
import { Effect, Option } from "effect";

// Track server start time for uptime calculation
const serverStartTime = Date.now();

/**
 * Gets the server uptime in milliseconds.
 */
export function getServerUptime(): number {
  return Date.now() - serverStartTime;
}

/**
 * Creates a timestamp string in ISO 8601 format.
 */
export function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Creates a simple liveness health response.
 *
 * This is used for the `/health` endpoint which should return immediately
 * without checking any dependencies.
 */
export function createLivenessResponse(
  config?: HealthCheckConfig,
): HealthResponse {
  return {
    status: "healthy",
    timestamp: getTimestamp(),
    version: config?.version,
    uptime: getServerUptime(),
  };
}

/**
 * Aggregates component health statuses into an overall status.
 *
 * @param components - The components to aggregate
 * @returns The overall health status
 */
export function aggregateHealthStatus(
  components: HealthComponents,
): HealthStatus {
  const statuses: HealthStatus[] = [];

  // Core components (critical for readiness)
  if (components.storage) statuses.push(components.storage.status);
  if (components.kvStore) statuses.push(components.kvStore.status);

  // Optional components (don't fail readiness)
  // eventBroadcaster, circuitBreaker, and DLQ being degraded doesn't make system unhealthy

  // If any critical component is unhealthy, overall is unhealthy
  if (statuses.includes("unhealthy")) {
    return "unhealthy";
  }

  // Check if any component (including optional) is degraded
  const allStatuses: HealthStatus[] = [...statuses];
  if (components.eventBroadcaster)
    allStatuses.push(components.eventBroadcaster.status);
  if (components.circuitBreaker)
    allStatuses.push(components.circuitBreaker.status);
  if (components.deadLetterQueue)
    allStatuses.push(components.deadLetterQueue.status);

  if (allStatuses.includes("degraded")) {
    return "degraded";
  }

  return "healthy";
}

/**
 * Checks storage backend health by performing a simple operation.
 *
 * Currently returns healthy as we don't have direct access to storage
 * in health check context. This can be enhanced to do actual connectivity
 * checks when storage service is available.
 */
export function checkStorageHealth(
  _config: HealthCheckConfig,
): Effect.Effect<ComponentHealth, never, never> {
  const startTime = Date.now();

  // TODO: When storage service is available in health context,
  // perform actual health check (e.g., list bucket, check credentials)
  // For now, return healthy with a note
  return Effect.succeed({
    status: "healthy" as HealthStatus,
    latency: Date.now() - startTime,
    message: "Storage backend configured",
    lastCheck: getTimestamp(),
  });
}

/**
 * Checks KV store health by performing a simple operation.
 *
 * Currently returns healthy as we don't have direct access to KV store
 * in health check context. This can be enhanced to do actual connectivity
 * checks when KV store service is available.
 */
export function checkKvStoreHealth(
  _config: HealthCheckConfig,
): Effect.Effect<ComponentHealth, never, never> {
  const startTime = Date.now();

  // TODO: When KV store service is available in health context,
  // perform actual health check (e.g., get/set test key)
  // For now, return healthy with a note
  return Effect.succeed({
    status: "healthy" as HealthStatus,
    latency: Date.now() - startTime,
    message: "KV store configured",
    lastCheck: getTimestamp(),
  });
}

/**
 * Checks event broadcaster health.
 *
 * Currently returns healthy as we don't have direct access to event broadcaster
 * in health check context.
 */
export function checkEventBroadcasterHealth(
  _config: HealthCheckConfig,
): Effect.Effect<ComponentHealth, never, never> {
  const startTime = Date.now();

  // TODO: When event broadcaster service is available in health context,
  // perform actual health check
  return Effect.succeed({
    status: "healthy" as HealthStatus,
    latency: Date.now() - startTime,
    message: "Event broadcaster configured",
    lastCheck: getTimestamp(),
  });
}

/**
 * Gets circuit breaker health summary from the circuit breaker store.
 *
 * Uses the optional service pattern to check if circuit breaker is available.
 */
export function getCircuitBreakerSummary(): Effect.Effect<
  CircuitBreakerHealthSummary | undefined,
  never,
  never
> {
  return Effect.gen(function* () {
    const cbStoreOption = yield* Effect.serviceOption(
      CircuitBreakerStoreService,
    );

    if (Option.isNone(cbStoreOption)) {
      // Circuit breaker not configured
      return undefined;
    }

    const cbStore = cbStoreOption.value;
    const statsResult = yield* Effect.either(cbStore.getAllStats());

    if (statsResult._tag === "Left") {
      // Error getting stats - return degraded status
      return {
        status: "degraded" as HealthStatus,
        openCircuits: 0,
        totalCircuits: 0,
      };
    }

    const stats = statsResult.right;
    const circuits = Array.from(stats.values());
    const openCircuits = circuits.filter((c) => c.state === "open").length;
    const totalCircuits = circuits.length;

    // Determine status based on open circuits
    let status: HealthStatus = "healthy";
    if (openCircuits > 0) {
      status = "degraded";
    }

    return {
      status,
      openCircuits,
      totalCircuits,
      circuits: circuits.map((c) => ({
        nodeType: c.nodeType,
        state: c.state,
        failureCount: c.failureCount,
        timeSinceLastStateChange: c.timeSinceLastStateChange,
      })),
    };
  });
}

/**
 * Gets dead letter queue health summary from the DLQ service.
 *
 * Uses the optional service pattern to check if DLQ is available.
 */
export function getDlqSummary(): Effect.Effect<
  DlqHealthSummary | undefined,
  never,
  never
> {
  return Effect.gen(function* () {
    const dlqOption = yield* DeadLetterQueueService.optional;

    if (Option.isNone(dlqOption)) {
      // DLQ not configured
      return undefined;
    }

    const dlq = dlqOption.value;
    const statsResult = yield* Effect.either(dlq.getStats());

    if (statsResult._tag === "Left") {
      // Error getting stats - return degraded status
      return {
        status: "degraded" as HealthStatus,
        pendingItems: 0,
        exhaustedItems: 0,
      };
    }

    const stats = statsResult.right;

    // Determine status based on exhausted items
    let status: HealthStatus = "healthy";
    if (stats.byStatus.exhausted > 0) {
      status = "degraded";
    }

    return {
      status,
      pendingItems: stats.byStatus.pending,
      exhaustedItems: stats.byStatus.exhausted,
      oldestItem: stats.oldestItem?.toISOString(),
    };
  });
}

/**
 * Performs a full readiness check including all configured dependencies.
 *
 * @param config - Health check configuration
 * @returns Health response with component details
 */
export function performReadinessCheck(
  config: HealthCheckConfig = {},
): Effect.Effect<HealthResponse, never, never> {
  const effectiveConfig = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };

  return Effect.gen(function* () {
    const components: HealthComponents = {};

    // Check storage if enabled
    if (effectiveConfig.checkStorage) {
      components.storage = yield* checkStorageHealth(effectiveConfig);
    }

    // Check KV store if enabled
    if (effectiveConfig.checkKvStore) {
      components.kvStore = yield* checkKvStoreHealth(effectiveConfig);
    }

    // Check event broadcaster if enabled
    if (effectiveConfig.checkEventBroadcaster) {
      components.eventBroadcaster =
        yield* checkEventBroadcasterHealth(effectiveConfig);
    }

    // Aggregate status
    const status = aggregateHealthStatus(components);

    return {
      status,
      timestamp: getTimestamp(),
      version: config.version,
      uptime: getServerUptime(),
      components,
    };
  });
}

/**
 * Performs a full component health check including circuit breaker and DLQ.
 *
 * @param config - Health check configuration
 * @returns Health response with all component details
 */
export function performComponentsCheck(
  config: HealthCheckConfig = {},
): Effect.Effect<HealthResponse, never, never> {
  const effectiveConfig = { ...DEFAULT_HEALTH_CHECK_CONFIG, ...config };

  return Effect.gen(function* () {
    const components: HealthComponents = {};

    // Check core components
    if (effectiveConfig.checkStorage) {
      components.storage = yield* checkStorageHealth(effectiveConfig);
    }

    if (effectiveConfig.checkKvStore) {
      components.kvStore = yield* checkKvStoreHealth(effectiveConfig);
    }

    if (effectiveConfig.checkEventBroadcaster) {
      components.eventBroadcaster =
        yield* checkEventBroadcasterHealth(effectiveConfig);
    }

    // Check optional components (circuit breaker and DLQ)
    const circuitBreakerSummary = yield* getCircuitBreakerSummary();
    if (circuitBreakerSummary) {
      components.circuitBreaker = circuitBreakerSummary;
    }

    const dlqSummary = yield* getDlqSummary();
    if (dlqSummary) {
      components.deadLetterQueue = dlqSummary;
    }

    // Aggregate status
    const status = aggregateHealthStatus(components);

    return {
      status,
      timestamp: getTimestamp(),
      version: config.version,
      uptime: getServerUptime(),
      components,
    };
  });
}
