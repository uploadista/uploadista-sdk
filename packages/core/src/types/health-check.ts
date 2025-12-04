/**
 * Health Check Types for Uploadista SDK.
 *
 * This module provides types for the health monitoring system including:
 * - Liveness probes (`/health`)
 * - Readiness probes (`/ready`)
 * - Component health details (`/health/components`)
 *
 * @module types/health-check
 */

// ============================================================================
// Health Status Types
// ============================================================================

/**
 * Health status values for components and overall system health.
 *
 * - `healthy`: All checks passed, system is fully operational
 * - `degraded`: Some non-critical issues detected, but system is functional
 * - `unhealthy`: Critical components unavailable, system cannot serve requests
 */
export type HealthStatus = "healthy" | "degraded" | "unhealthy";

// ============================================================================
// Component Health Types
// ============================================================================

/**
 * Health status for an individual component (storage, KV store, etc.).
 */
export interface ComponentHealth {
  /** Current health status of the component */
  status: HealthStatus;
  /** Latency of the last health check in milliseconds */
  latency?: number;
  /** Human-readable status message */
  message?: string;
  /** ISO 8601 timestamp of the last health check */
  lastCheck?: string;
}

/**
 * Circuit breaker health summary aggregating all circuit states.
 */
export interface CircuitBreakerHealthSummary {
  /** Overall circuit breaker system status */
  status: HealthStatus;
  /** Number of circuits currently in open state */
  openCircuits: number;
  /** Total number of tracked circuits */
  totalCircuits: number;
  /** Detailed stats for each circuit (optional, for debugging) */
  circuits?: Array<{
    nodeType: string;
    state: "closed" | "open" | "half-open";
    failureCount: number;
    timeSinceLastStateChange: number;
  }>;
}

/**
 * Dead Letter Queue health summary.
 */
export interface DlqHealthSummary {
  /** Overall DLQ status */
  status: HealthStatus;
  /** Number of items pending retry */
  pendingItems: number;
  /** Number of items that have exhausted all retries */
  exhaustedItems: number;
  /** ISO 8601 timestamp of the oldest item in the queue */
  oldestItem?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Components health map for detailed health responses.
 */
export interface HealthComponents {
  /** Storage backend health */
  storage?: ComponentHealth;
  /** KV store health */
  kvStore?: ComponentHealth;
  /** Event broadcaster health */
  eventBroadcaster?: ComponentHealth;
  /** Circuit breaker summary (if enabled) */
  circuitBreaker?: CircuitBreakerHealthSummary;
  /** Dead letter queue summary (if enabled) */
  deadLetterQueue?: DlqHealthSummary;
}

/**
 * Standard health response structure.
 *
 * Used for all health endpoints with varying levels of detail.
 */
export interface HealthResponse {
  /** Overall health status */
  status: HealthStatus;
  /** ISO 8601 timestamp of the response */
  timestamp: string;
  /** Optional version string for deployment identification */
  version?: string;
  /** Server uptime in milliseconds */
  uptime?: number;
  /** Component-level health details (for /health/components) */
  components?: HealthComponents;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Configuration options for health check behavior.
 */
export interface HealthCheckConfig {
  /**
   * Timeout for dependency health checks in milliseconds.
   * @default 5000
   */
  timeout?: number;

  /**
   * Whether to check storage backend health.
   * @default true
   */
  checkStorage?: boolean;

  /**
   * Whether to check KV store health.
   * @default true
   */
  checkKvStore?: boolean;

  /**
   * Whether to check event broadcaster health.
   * @default true
   */
  checkEventBroadcaster?: boolean;

  /**
   * Optional version string to include in health responses.
   * Useful for identifying deployed versions.
   */
  version?: string;
}

/**
 * Default health check configuration values.
 */
export const DEFAULT_HEALTH_CHECK_CONFIG: Required<
  Omit<HealthCheckConfig, "version">
> = {
  timeout: 5000,
  checkStorage: true,
  checkKvStore: true,
  checkEventBroadcaster: true,
};

// ============================================================================
// Request Types (for Accept header handling)
// ============================================================================

/**
 * Supported response formats for health endpoints.
 */
export type HealthResponseFormat = "json" | "text";

/**
 * Determines the response format based on Accept header.
 *
 * @param acceptHeader - The Accept header value from the request
 * @returns The response format to use
 */
export function getHealthResponseFormat(
  acceptHeader?: string | null,
): HealthResponseFormat {
  if (acceptHeader?.includes("text/plain")) {
    return "text";
  }
  return "json";
}

/**
 * Formats a health response as plain text.
 *
 * @param status - The health status
 * @returns Plain text representation
 */
export function formatHealthAsText(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "OK";
    case "degraded":
      return "OK"; // Degraded still returns OK for liveness
    case "unhealthy":
      return "Service Unavailable";
  }
}
