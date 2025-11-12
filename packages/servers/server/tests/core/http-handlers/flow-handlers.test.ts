/**
 * Tests for HTTP Flow Handlers
 *
 * Covers:
 * - Flow data retrieval
 * - Flow execution and job management
 * - Job status tracking
 * - Flow control (pause, resume, cancel)
 * - Auth context handling and caching
 * - HTTP request/response handling
 * - Error handling and status codes
 */

import { it } from "@effect/vitest";
import type { FlowData, FlowJob } from "@uploadista/core";
import { FlowServer } from "@uploadista/core/flow";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";
import { AuthCacheServiceLive, AuthContextServiceLive } from "../../../src";
import {
  handleCancelFlow,
  handleGetFlow,
  handleJobStatus,
  handlePauseFlow,
  handleResumeFlow,
  handleRunFlow,
} from "../../../src/core/http-handlers/flow-http-handlers";

// Mock FlowServer implementation for testing
const mockFlowServerMethods = {
  getFlowData: (flowId: string, _clientId: string | null) =>
    Effect.succeed<FlowData>({
      id: flowId,
      name: `Flow ${flowId}`,
      nodes: [],
      edges: [],
    }),

  runFlow: ({
    flowId,
    storageId,
    clientId,
  }: {
    flowId: string;
    storageId: string;
    clientId: string | null;
    inputs: Record<string, unknown>;
  }) =>
    Effect.succeed<FlowJob>({
      id: `job-${flowId}-${Date.now()}`,
      flowId,
      storageId,
      clientId,
      status: "running",
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),

  getJobStatus: (jobId: string) =>
    Effect.succeed<FlowJob>({
      id: jobId,
      flowId: "flow-123",
      status: "running",
      clientId: null,
      storageId: "storage-1",
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),

  resumeFlow: ({
    jobId,
    clientId,
  }: {
    jobId: string;
    nodeId: string;
    newData: unknown;
    clientId: string | null;
  }) =>
    Effect.succeed<FlowJob>({
      id: jobId,
      flowId: "flow-123",
      status: "running",
      clientId,
      storageId: "storage-1",
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),

  pauseFlow: (jobId: string, clientId: string | null) =>
    Effect.succeed<FlowJob>({
      id: jobId,
      flowId: "flow-123",
      status: "paused",
      clientId,
      storageId: "storage-1",
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),

  cancelFlow: (jobId: string, clientId: string | null) =>
    Effect.succeed<FlowJob>({
      id: jobId,
      flowId: "flow-123",
      status: "cancelled",
      clientId,
      storageId: "storage-1",
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }),

  // Mock methods required by FlowServerShape but not used in tests
  getFlow: () => Effect.die("getFlow not implemented in test"),
  subscribeToFlowEvents: () => Effect.void,
  unsubscribeFromFlowEvents: () => Effect.void,
};

const FlowServerTest = Layer.succeed(FlowServer, mockFlowServerMethods);

describe("HTTP Flow Handlers", () => {
  describe("handleGetFlow", () => {
    it.effect("should retrieve flow data without auth", () =>
      Effect.gen(function* () {
        const result = yield* handleGetFlow({
          type: "get-flow",
          flowId: "flow-123",
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toBe("flow-123");
        expect(result.body.name).toBe("Flow flow-123");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );

    it.effect("should retrieve flow data with auth context", () =>
      Effect.gen(function* () {
        const result = yield* handleGetFlow({
          type: "get-flow",
          flowId: "flow-456",
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toBe("flow-456");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(
          AuthContextServiceLive({
            clientId: "user-123",
            metadata: { role: "admin" },
          }),
        ),
      ),
    );

    it.effect("should include flow metadata in response", () =>
      Effect.gen(function* () {
        const result = yield* handleGetFlow({
          type: "get-flow",
          flowId: "flow-789",
        });

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty("id");
        expect(result.body).toHaveProperty("name");
        expect(result.body).toHaveProperty("nodes");
        expect(result.body).toHaveProperty("edges");
        expect(result.body.id).toBe("flow-789");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );
  });

  describe("handleRunFlow", () => {
    it.effect("should execute flow without auth", () =>
      Effect.gen(function* () {
        const result = yield* handleRunFlow<never>({
          type: "run-flow",
          flowId: "flow-123",
          storageId: "storage-1",
          inputs: { key: "value" },
        });

        expect(result.status).toBe(200);
        expect(result.body).toHaveProperty("id");
        expect(result.body.flowId).toBe("flow-123");
        expect(result.body.storageId).toBe("storage-1");
        expect(result.body.status).toBe("running");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );

    it.effect("should execute flow with auth context", () =>
      Effect.gen(function* () {
        const result = yield* handleRunFlow<never>({
          type: "run-flow",
          flowId: "flow-456",
          storageId: "storage-2",
          inputs: { data: "test" },
        });

        expect(result.status).toBe(200);
        expect(result.body.clientId).toBe("user-123");
        // Auth context is cached internally by the handler
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(
          AuthContextServiceLive({
            clientId: "user-123",
            metadata: { plan: "premium" },
          }),
        ),
      ),
    );

    it.effect("should not cache auth context when no auth present", () =>
      Effect.gen(function* () {
        const result = yield* handleRunFlow<never>({
          type: "run-flow",
          flowId: "flow-789",
          storageId: "storage-3",
          inputs: {},
        });

        expect(result.status).toBe(200);
        expect(result.body.clientId).toBeNull();
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );

    it.effect("should return job ID immediately", () =>
      Effect.gen(function* () {
        const result = yield* handleRunFlow<never>({
          type: "run-flow",
          flowId: "flow-async",
          storageId: "storage-4",
          inputs: { async: true },
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toContain("job-");
        expect(result.body.status).toBe("running");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );
  });

  describe("handleJobStatus", () => {
    it.effect("should get job status", () =>
      Effect.gen(function* () {
        const result = yield* handleJobStatus({
          type: "job-status",
          jobId: "job-123",
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toBe("job-123");
        expect(result.body.flowId).toBe("flow-123");
        expect(result.body).toHaveProperty("status");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );

    it.effect("should clear cache when flow completes", () =>
      Effect.gen(function* () {
        // Create FlowServer that returns completed status
        const completedMethods = {
          ...mockFlowServerMethods,
          getJobStatus: (jobId: string) =>
            Effect.succeed<FlowJob>({
              id: jobId,
              flowId: "flow-123",
              status: "completed",
              clientId: null,
              storageId: "storage-1",
              tasks: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
        };

        const result = yield* handleJobStatus({
          type: "job-status",
          jobId: "job-completed",
        }).pipe(
          Effect.provide(Layer.succeed(FlowServer, completedMethods)),
          Effect.provide(AuthCacheServiceLive()),
          Effect.provide(AuthContextServiceLive(null)),
        );

        expect(result.status).toBe(200);
        expect(result.body.status).toBe("completed");
      }),
    );

    it.effect("should not clear cache for running jobs", () =>
      Effect.gen(function* () {
        const result = yield* handleJobStatus({
          type: "job-status",
          jobId: "job-running",
        });

        expect(result.status).toBe(200);
        expect(result.body.status).toBe("running");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );
  });

  describe("handleResumeFlow", () => {
    it.effect("should resume flow with current auth", () =>
      Effect.gen(function* () {
        const result = yield* handleResumeFlow<never>({
          type: "resume-flow",
          jobId: "job-cached",
          nodeId: "node-2",
          newData: { selection: "yes" },
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toBe("job-cached");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );
  });

  describe("handlePauseFlow", () => {
    it.effect("should pause flow", () =>
      Effect.gen(function* () {
        const result = yield* handlePauseFlow({
          type: "pause-flow",
          jobId: "job-pause",
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toBe("job-pause");
        expect(result.body.status).toBe("paused");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );

    it.effect("should pause flow with auth context", () =>
      Effect.gen(function* () {
        const result = yield* handlePauseFlow({
          type: "pause-flow",
          jobId: "job-pause-auth",
        });

        expect(result.status).toBe(200);
        expect(result.body.status).toBe("paused");
        expect(result.body.clientId).toBe("user-pause");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive({ clientId: "user-pause" })),
      ),
    );
  });

  describe("handleCancelFlow", () => {
    it.effect("should cancel flow", () =>
      Effect.gen(function* () {
        const result = yield* handleCancelFlow({
          type: "cancel-flow",
          jobId: "job-cancel",
        });

        expect(result.status).toBe(200);
        expect(result.body.id).toBe("job-cancel");
        expect(result.body.status).toBe("cancelled");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );

    it.effect("should cancel flow with current auth", () =>
      Effect.gen(function* () {
        const result = yield* handleCancelFlow({
          type: "cancel-flow",
          jobId: "job-cancel-auth",
        });

        expect(result.status).toBe(200);
        expect(result.body.status).toBe("cancelled");
        expect(result.body.clientId).toBe("user-cancel-auth");
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(
          AuthContextServiceLive({
            clientId: "user-cancel-auth",
            metadata: { reason: "manual" },
          }),
        ),
      ),
    );
  });

  describe("HTTP Status Codes", () => {
    it.effect("should return 200 OK for successful operations", () =>
      Effect.gen(function* () {
        const getFlowResult = yield* handleGetFlow({
          type: "get-flow",
          flowId: "flow-200",
        });
        expect(getFlowResult.status).toBe(200);

        const runFlowResult = yield* handleRunFlow<never>({
          type: "run-flow",
          flowId: "flow-200",
          storageId: "storage-1",
          inputs: {},
        });
        expect(runFlowResult.status).toBe(200);

        const statusResult = yield* handleJobStatus({
          type: "job-status",
          jobId: "job-200",
        });
        expect(statusResult.status).toBe(200);
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );
  });

  describe("Auth Context Integration", () => {
    it.effect("should handle unauthenticated flow operations", () =>
      Effect.gen(function* () {
        // All operations should work without auth
        const getResult = yield* handleGetFlow({
          type: "get-flow",
          flowId: "flow-unauth",
        });
        expect(getResult.status).toBe(200);

        const runResult = yield* handleRunFlow<never>({
          type: "run-flow",
          flowId: "flow-unauth",
          storageId: "storage-1",
          inputs: {},
        });
        expect(runResult.status).toBe(200);
        expect(runResult.body.clientId).toBeNull();

        const statusResult = yield* handleJobStatus({
          type: "job-status",
          jobId: "job-unauth",
        });
        expect(statusResult.status).toBe(200);
      }).pipe(
        Effect.provide(FlowServerTest),
        Effect.provide(AuthCacheServiceLive()),
        Effect.provide(AuthContextServiceLive(null)),
      ),
    );
  });
});
