/**
 * Tests for HTTP Health Check Handlers
 *
 * Covers:
 * - Liveness probe endpoint (/health)
 * - Readiness probe endpoint (/ready)
 * - Component details endpoint (/health/components)
 * - Response format negotiation (JSON/plain text)
 * - HTTP status codes
 */

import { it } from "@effect/vitest";
import type {
  HealthResponse as HealthResponseBody,
  HealthStatus,
} from "@uploadista/core/types";
import { Effect } from "effect";
import { describe, expect } from "vitest";
import { AuthContextServiceLive } from "../../../src";
import {
  handleHealthComponents,
  handleHealthLiveness,
  handleHealthReadiness,
} from "../../../src/core/http-handlers/health-http-handlers";
import type {
  HealthComponentsRequest,
  HealthReadyRequest,
  HealthRequest,
} from "../../../src/core/routes";

describe("HTTP Health Check Handlers", () => {
  describe("Liveness Probe (/health)", () => {
    it.effect("should return 200 OK for liveness check", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthLiveness(request);

        expect(response.status).toBe(200);
        expect(response.type).toBe("health");
      }),
    );

    it.effect("should return healthy status in JSON format", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthLiveness(request);

        expect(response.headers["Content-Type"]).toBe("application/json");
        const body = response.body as HealthResponseBody;
        expect(body.status).toBe("healthy");
        expect(body.timestamp).toBeDefined();
      }),
    );

    it.effect("should include uptime in response", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthLiveness(request);
        const body = response.body as HealthResponseBody;

        expect(body.uptime).toBeDefined();
        expect(typeof body.uptime).toBe("number");
        expect(body.uptime).toBeGreaterThanOrEqual(0);
      }),
    );

    it.effect("should return plain text 'OK' when Accept: text/plain", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "text/plain",
        };

        const response = yield* handleHealthLiveness(request);

        expect(response.headers["Content-Type"]).toBe("text/plain");
        expect(response.body).toBe("OK");
      }),
    );

    it.effect("should include version when configured", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };
        const config = { version: "1.2.3" };

        const response = yield* handleHealthLiveness(request, config);
        const body = response.body as HealthResponseBody;

        expect(body.version).toBe("1.2.3");
      }),
    );

    it.effect("should return timestamp in ISO 8601 format", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthLiveness(request);
        const body = response.body as HealthResponseBody;

        // Verify timestamp is valid ISO 8601
        const parsedDate = new Date(body.timestamp);
        expect(parsedDate.toISOString()).toBe(body.timestamp);
      }),
    );
  });

  describe("Readiness Probe (/ready)", () => {
    it.effect("should return 200 OK when all dependencies healthy", () =>
      Effect.gen(function* () {
        const request: HealthReadyRequest = {
          type: "health-ready",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthReadiness(request);

        expect(response.status).toBe(200);
        expect(response.type).toBe("health-ready");
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should include component status in response", () =>
      Effect.gen(function* () {
        const request: HealthReadyRequest = {
          type: "health-ready",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthReadiness(request);
        const body = response.body as HealthResponseBody;

        expect(body.components).toBeDefined();
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should return plain text when Accept: text/plain", () =>
      Effect.gen(function* () {
        const request: HealthReadyRequest = {
          type: "health-ready",
          acceptHeader: "text/plain",
        };

        const response = yield* handleHealthReadiness(request);

        expect(response.headers["Content-Type"]).toBe("text/plain");
        expect(typeof response.body).toBe("string");
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should respect checkStorage config option", () =>
      Effect.gen(function* () {
        const request: HealthReadyRequest = {
          type: "health-ready",
          acceptHeader: "application/json",
        };
        const config = { checkStorage: true };

        const response = yield* handleHealthReadiness(request, config);
        const body = response.body as HealthResponseBody;

        // Storage should be checked when enabled
        expect(body.components?.storage).toBeDefined();
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should skip storage check when disabled", () =>
      Effect.gen(function* () {
        const request: HealthReadyRequest = {
          type: "health-ready",
          acceptHeader: "application/json",
        };
        const config = { checkStorage: false };

        const response = yield* handleHealthReadiness(request, config);
        const body = response.body as HealthResponseBody;

        // Storage should not be present when disabled
        expect(body.components?.storage).toBeUndefined();
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );
  });

  describe("Component Details (/health/components)", () => {
    it.effect("should always return 200 OK (for debugging)", () =>
      Effect.gen(function* () {
        const request: HealthComponentsRequest = {
          type: "health-components",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthComponents(request);

        // Components endpoint always returns 200 for debugging
        expect(response.status).toBe(200);
        expect(response.type).toBe("health-components");
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should include detailed component status", () =>
      Effect.gen(function* () {
        const request: HealthComponentsRequest = {
          type: "health-components",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthComponents(request);
        const body = response.body as HealthResponseBody;

        expect(body.components).toBeDefined();
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should include timestamp and uptime", () =>
      Effect.gen(function* () {
        const request: HealthComponentsRequest = {
          type: "health-components",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthComponents(request);
        const body = response.body as HealthResponseBody;

        expect(body.timestamp).toBeDefined();
        expect(body.uptime).toBeDefined();
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );

    it.effect("should return plain text when Accept: text/plain", () =>
      Effect.gen(function* () {
        const request: HealthComponentsRequest = {
          type: "health-components",
          acceptHeader: "text/plain",
        };

        const response = yield* handleHealthComponents(request);

        expect(response.headers["Content-Type"]).toBe("text/plain");
        expect(typeof response.body).toBe("string");
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );
  });

  describe("Response Format Negotiation", () => {
    it.effect("should default to JSON when no Accept header", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: null,
        };

        const response = yield* handleHealthLiveness(request);

        expect(response.headers["Content-Type"]).toBe("application/json");
      }),
    );

    it.effect("should return JSON for application/json Accept header", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthLiveness(request);

        expect(response.headers["Content-Type"]).toBe("application/json");
        expect(typeof response.body).toBe("object");
      }),
    );

    it.effect("should return plain text for text/plain Accept header", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "text/plain",
        };

        const response = yield* handleHealthLiveness(request);

        expect(response.headers["Content-Type"]).toBe("text/plain");
        expect(typeof response.body).toBe("string");
      }),
    );

    it.effect("should handle Accept header with multiple types", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "text/plain, application/json",
        };

        const response = yield* handleHealthLiveness(request);

        // text/plain takes precedence when listed first
        expect(response.headers["Content-Type"]).toBe("text/plain");
      }),
    );
  });

  describe("Health Status Values", () => {
    it.effect("should return 'healthy' status for liveness", () =>
      Effect.gen(function* () {
        const request: HealthRequest = {
          type: "health",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthLiveness(request);
        const body = response.body as HealthResponseBody;

        expect(body.status).toBe("healthy");
      }),
    );

    it.effect("should return valid HealthStatus values", () =>
      Effect.gen(function* () {
        const request: HealthReadyRequest = {
          type: "health-ready",
          acceptHeader: "application/json",
        };

        const response = yield* handleHealthReadiness(request);
        const body = response.body as HealthResponseBody;

        const validStatuses: HealthStatus[] = [
          "healthy",
          "degraded",
          "unhealthy",
        ];
        expect(validStatuses).toContain(body.status);
      }).pipe(Effect.provide(AuthContextServiceLive(null, { bypassAuth: true }))),
    );
  });
});
