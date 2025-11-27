/**
 * Tests for Health Check Service
 *
 * Covers:
 * - Liveness response creation
 * - Health status aggregation
 * - Individual component health checks
 * - Circuit breaker integration
 * - Dead letter queue integration
 * - Readiness and components checks
 */

import { it } from "@effect/vitest";
import type {
  ComponentHealth,
  HealthCheckConfig,
  HealthComponents,
  HealthStatus,
} from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import { describe, expect, vi, beforeEach } from "vitest";
import {
  aggregateHealthStatus,
  checkEventBroadcasterHealth,
  checkKvStoreHealth,
  checkStorageHealth,
  createLivenessResponse,
  getServerUptime,
  getTimestamp,
  performComponentsCheck,
  performReadinessCheck,
} from "../../src/core/health-check-service";

describe("Health Check Service", () => {
  describe("getServerUptime", () => {
    it("should return a positive number", () => {
      const uptime = getServerUptime();

      expect(typeof uptime).toBe("number");
      expect(uptime).toBeGreaterThanOrEqual(0);
    });

    it("should increase over time", async () => {
      const uptime1 = getServerUptime();
      await new Promise((resolve) => setTimeout(resolve, 10));
      const uptime2 = getServerUptime();

      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  describe("getTimestamp", () => {
    it("should return a valid ISO 8601 timestamp", () => {
      const timestamp = getTimestamp();

      // Verify it's a valid date string
      const parsedDate = new Date(timestamp);
      expect(parsedDate.toISOString()).toBe(timestamp);
    });

    it("should return current time", () => {
      const before = Date.now();
      const timestamp = getTimestamp();
      const after = Date.now();

      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });
  });

  describe("createLivenessResponse", () => {
    it("should return healthy status", () => {
      const response = createLivenessResponse();

      expect(response.status).toBe("healthy");
    });

    it("should include timestamp", () => {
      const response = createLivenessResponse();

      expect(response.timestamp).toBeDefined();
      const parsedDate = new Date(response.timestamp);
      expect(parsedDate.toISOString()).toBe(response.timestamp);
    });

    it("should include uptime", () => {
      const response = createLivenessResponse();

      expect(response.uptime).toBeDefined();
      expect(typeof response.uptime).toBe("number");
      expect(response.uptime).toBeGreaterThanOrEqual(0);
    });

    it("should include version when configured", () => {
      const config: HealthCheckConfig = { version: "1.2.3" };
      const response = createLivenessResponse(config);

      expect(response.version).toBe("1.2.3");
    });

    it("should not include version when not configured", () => {
      const response = createLivenessResponse();

      expect(response.version).toBeUndefined();
    });

    it("should not include components", () => {
      const response = createLivenessResponse();

      expect(response.components).toBeUndefined();
    });
  });

  describe("aggregateHealthStatus", () => {
    it("should return healthy when all components are healthy", () => {
      const components: HealthComponents = {
        storage: {
          status: "healthy",
          latency: 10,
          lastCheck: getTimestamp(),
        },
        kvStore: {
          status: "healthy",
          latency: 5,
          lastCheck: getTimestamp(),
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("healthy");
    });

    it("should return unhealthy when storage is unhealthy", () => {
      const components: HealthComponents = {
        storage: {
          status: "unhealthy",
          latency: 10,
          lastCheck: getTimestamp(),
          message: "Connection failed",
        },
        kvStore: {
          status: "healthy",
          latency: 5,
          lastCheck: getTimestamp(),
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("unhealthy");
    });

    it("should return unhealthy when KV store is unhealthy", () => {
      const components: HealthComponents = {
        storage: {
          status: "healthy",
          latency: 10,
          lastCheck: getTimestamp(),
        },
        kvStore: {
          status: "unhealthy",
          latency: 5000,
          lastCheck: getTimestamp(),
          message: "Timeout",
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("unhealthy");
    });

    it("should return degraded when storage is degraded", () => {
      const components: HealthComponents = {
        storage: {
          status: "degraded",
          latency: 500,
          lastCheck: getTimestamp(),
          message: "High latency",
        },
        kvStore: {
          status: "healthy",
          latency: 5,
          lastCheck: getTimestamp(),
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("degraded");
    });

    it("should return degraded when optional component is degraded", () => {
      const components: HealthComponents = {
        storage: {
          status: "healthy",
          latency: 10,
          lastCheck: getTimestamp(),
        },
        circuitBreaker: {
          status: "degraded",
          openCircuits: 2,
          totalCircuits: 5,
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("degraded");
    });

    it("should return healthy with no components", () => {
      const components: HealthComponents = {};

      const status = aggregateHealthStatus(components);

      expect(status).toBe("healthy");
    });

    it("should prioritize unhealthy over degraded", () => {
      const components: HealthComponents = {
        storage: {
          status: "unhealthy",
          latency: 10000,
          lastCheck: getTimestamp(),
        },
        kvStore: {
          status: "degraded",
          latency: 500,
          lastCheck: getTimestamp(),
        },
        eventBroadcaster: {
          status: "healthy",
          latency: 5,
          lastCheck: getTimestamp(),
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("unhealthy");
    });

    it("should handle all component types", () => {
      const components: HealthComponents = {
        storage: {
          status: "healthy",
          latency: 10,
          lastCheck: getTimestamp(),
        },
        kvStore: {
          status: "healthy",
          latency: 5,
          lastCheck: getTimestamp(),
        },
        eventBroadcaster: {
          status: "healthy",
          latency: 3,
          lastCheck: getTimestamp(),
        },
        circuitBreaker: {
          status: "healthy",
          openCircuits: 0,
          totalCircuits: 3,
        },
        deadLetterQueue: {
          status: "healthy",
          pendingItems: 0,
          exhaustedItems: 0,
        },
      };

      const status = aggregateHealthStatus(components);

      expect(status).toBe("healthy");
    });
  });

  describe("checkStorageHealth", () => {
    it.effect("should return healthy status", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkStorageHealth(config);

        expect(health.status).toBe("healthy");
      }),
    );

    it.effect("should include latency", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkStorageHealth(config);

        expect(typeof health.latency).toBe("number");
        expect(health.latency).toBeGreaterThanOrEqual(0);
      }),
    );

    it.effect("should include lastCheck timestamp", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkStorageHealth(config);

        expect(health.lastCheck).toBeDefined();
        const parsedDate = new Date(health.lastCheck!);
        expect(parsedDate.toISOString()).toBe(health.lastCheck);
      }),
    );

    it.effect("should include message", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkStorageHealth(config);

        expect(health.message).toBeDefined();
        expect(typeof health.message).toBe("string");
      }),
    );
  });

  describe("checkKvStoreHealth", () => {
    it.effect("should return healthy status", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkKvStoreHealth(config);

        expect(health.status).toBe("healthy");
      }),
    );

    it.effect("should include latency", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkKvStoreHealth(config);

        expect(typeof health.latency).toBe("number");
        expect(health.latency).toBeGreaterThanOrEqual(0);
      }),
    );

    it.effect("should include lastCheck timestamp", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkKvStoreHealth(config);

        expect(health.lastCheck).toBeDefined();
      }),
    );
  });

  describe("checkEventBroadcasterHealth", () => {
    it.effect("should return healthy status", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkEventBroadcasterHealth(config);

        expect(health.status).toBe("healthy");
      }),
    );

    it.effect("should include latency", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkEventBroadcasterHealth(config);

        expect(typeof health.latency).toBe("number");
        expect(health.latency).toBeGreaterThanOrEqual(0);
      }),
    );

    it.effect("should include lastCheck timestamp", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {};
        const health = yield* checkEventBroadcasterHealth(config);

        expect(health.lastCheck).toBeDefined();
      }),
    );
  });

  describe("performReadinessCheck", () => {
    it.effect("should return healthy status by default", () =>
      Effect.gen(function* () {
        const response = yield* performReadinessCheck();

        expect(response.status).toBe("healthy");
      }),
    );

    it.effect("should include timestamp and uptime", () =>
      Effect.gen(function* () {
        const response = yield* performReadinessCheck();

        expect(response.timestamp).toBeDefined();
        expect(response.uptime).toBeDefined();
        expect(typeof response.uptime).toBe("number");
      }),
    );

    it.effect("should check storage when enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkStorage: true };
        const response = yield* performReadinessCheck(config);

        expect(response.components?.storage).toBeDefined();
        expect(response.components?.storage?.status).toBe("healthy");
      }),
    );

    it.effect("should skip storage when disabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkStorage: false };
        const response = yield* performReadinessCheck(config);

        expect(response.components?.storage).toBeUndefined();
      }),
    );

    it.effect("should check KV store when enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkKvStore: true };
        const response = yield* performReadinessCheck(config);

        expect(response.components?.kvStore).toBeDefined();
        expect(response.components?.kvStore?.status).toBe("healthy");
      }),
    );

    it.effect("should skip KV store when disabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkKvStore: false };
        const response = yield* performReadinessCheck(config);

        expect(response.components?.kvStore).toBeUndefined();
      }),
    );

    it.effect("should check event broadcaster when enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkEventBroadcaster: true };
        const response = yield* performReadinessCheck(config);

        expect(response.components?.eventBroadcaster).toBeDefined();
        expect(response.components?.eventBroadcaster?.status).toBe("healthy");
      }),
    );

    it.effect("should include version when configured", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { version: "2.0.0" };
        const response = yield* performReadinessCheck(config);

        expect(response.version).toBe("2.0.0");
      }),
    );

    it.effect("should check all components when all enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = {
          checkStorage: true,
          checkKvStore: true,
          checkEventBroadcaster: true,
        };
        const response = yield* performReadinessCheck(config);

        expect(response.components?.storage).toBeDefined();
        expect(response.components?.kvStore).toBeDefined();
        expect(response.components?.eventBroadcaster).toBeDefined();
      }),
    );
  });

  describe("performComponentsCheck", () => {
    it.effect("should return healthy status by default", () =>
      Effect.gen(function* () {
        const response = yield* performComponentsCheck();

        expect(response.status).toBe("healthy");
      }),
    );

    it.effect("should include timestamp and uptime", () =>
      Effect.gen(function* () {
        const response = yield* performComponentsCheck();

        expect(response.timestamp).toBeDefined();
        expect(response.uptime).toBeDefined();
      }),
    );

    it.effect("should check storage when enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkStorage: true };
        const response = yield* performComponentsCheck(config);

        expect(response.components?.storage).toBeDefined();
      }),
    );

    it.effect("should check KV store when enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkKvStore: true };
        const response = yield* performComponentsCheck(config);

        expect(response.components?.kvStore).toBeDefined();
      }),
    );

    it.effect("should check event broadcaster when enabled", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { checkEventBroadcaster: true };
        const response = yield* performComponentsCheck(config);

        expect(response.components?.eventBroadcaster).toBeDefined();
      }),
    );

    it.effect("should not include circuit breaker when not configured", () =>
      Effect.gen(function* () {
        // Without providing CircuitBreakerStoreService, it should not be included
        const response = yield* performComponentsCheck();

        // Circuit breaker is only included when the service is available
        // Since we're not providing it, it should be undefined
        expect(response.components?.circuitBreaker).toBeUndefined();
      }),
    );

    it.effect("should not include DLQ when not configured", () =>
      Effect.gen(function* () {
        // Without providing DeadLetterQueueService, it should not be included
        const response = yield* performComponentsCheck();

        // DLQ is only included when the service is available
        expect(response.components?.deadLetterQueue).toBeUndefined();
      }),
    );

    it.effect("should include version when configured", () =>
      Effect.gen(function* () {
        const config: HealthCheckConfig = { version: "3.0.0" };
        const response = yield* performComponentsCheck(config);

        expect(response.version).toBe("3.0.0");
      }),
    );
  });

  describe("Health Status Values", () => {
    it("should only allow valid health status values", () => {
      const validStatuses: HealthStatus[] = ["healthy", "degraded", "unhealthy"];

      // Test aggregation with each valid status
      for (const status of validStatuses) {
        const components: HealthComponents = {
          storage: {
            status,
            latency: 10,
            lastCheck: getTimestamp(),
          },
        };

        const result = aggregateHealthStatus(components);
        expect(validStatuses).toContain(result);
      }
    });
  });
});
