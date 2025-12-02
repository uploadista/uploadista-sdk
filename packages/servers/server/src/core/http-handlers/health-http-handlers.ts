/**
 * Health Check HTTP Handlers for Uploadista SDK.
 *
 * This module provides HTTP handlers for health check endpoints:
 * - `/health` (liveness) - Simple alive check, no dependencies
 * - `/ready` (readiness) - Full dependency check for accepting traffic
 * - `/health/components` - Detailed component status for debugging
 *
 * @module core/http-handlers/health-http-handlers
 */

import {
  formatHealthAsText,
  getHealthResponseFormat,
  type HealthCheckConfig,
} from "@uploadista/core/types";
import { Effect } from "effect";
import { PERMISSIONS } from "../../permissions/types";
import { AuthContextService } from "../../service";
import {
  createLivenessResponse,
  performComponentsCheck,
  performReadinessCheck,
} from "../health-check-service";
import type {
  HealthComponentsRequest,
  HealthComponentsResponse,
  HealthReadyRequest,
  HealthReadyResponse,
  HealthRequest,
  HealthResponse,
} from "../routes";

/**
 * Handle GET /health - Liveness probe
 *
 * Returns immediately with 200 OK if the server is alive.
 * Does not check any dependencies.
 */
export const handleHealthLiveness = (
  req: HealthRequest,
  config?: HealthCheckConfig,
) =>
  Effect.sync(() => {
    const response = createLivenessResponse(config);
    const format = getHealthResponseFormat(req.acceptHeader);

    if (format === "text") {
      return {
        type: "health",
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: formatHealthAsText(response.status),
      } as HealthResponse;
    }

    return {
      type: "health",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: response,
    } satisfies HealthResponse;
  });

/**
 * Handle GET /ready - Readiness probe
 *
 * Checks all critical dependencies (storage, KV store) and returns:
 * - 200 OK if all dependencies are healthy
 * - 503 Service Unavailable if any critical dependency is unavailable
 *
 * Requires `engine:readiness` permission.
 */
export const handleHealthReadiness = (
  req: HealthReadyRequest,
  config?: HealthCheckConfig,
) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for readiness endpoint
    yield* authService.requirePermission(PERMISSIONS.ENGINE.READINESS);

    const response = yield* performReadinessCheck(config);
    const format = getHealthResponseFormat(req.acceptHeader);

    // Determine HTTP status based on health status
    const httpStatus = response.status === "unhealthy" ? 503 : 200;

    if (format === "text") {
      return {
        type: "health-ready",
        status: httpStatus,
        headers: { "Content-Type": "text/plain" },
        body: formatHealthAsText(response.status),
      } as HealthReadyResponse;
    }

    return {
      type: "health-ready",
      status: httpStatus,
      headers: { "Content-Type": "application/json" },
      body: response,
    } satisfies HealthReadyResponse;
  });

/**
 * Handle GET /health/components - Detailed component status
 *
 * Returns detailed health information for each component including:
 * - Storage backend
 * - KV store
 * - Event broadcaster
 * - Circuit breaker (if enabled)
 * - Dead letter queue (if enabled)
 *
 * Always returns 200 OK for debugging purposes (even if components are degraded).
 *
 * Requires `engine:readiness` permission.
 */
export const handleHealthComponents = (
  req: HealthComponentsRequest,
  config?: HealthCheckConfig,
) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for components endpoint
    yield* authService.requirePermission(PERMISSIONS.ENGINE.READINESS);

    const response = yield* performComponentsCheck(config);
    const format = getHealthResponseFormat(req.acceptHeader);

    if (format === "text") {
      // For text format, just return the overall status
      return {
        type: "health-components",
        status: 200,
        headers: { "Content-Type": "text/plain" },
        body: formatHealthAsText(response.status),
      } as HealthComponentsResponse;
    }

    return {
      type: "health-components",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: response,
    } satisfies HealthComponentsResponse;
  });
