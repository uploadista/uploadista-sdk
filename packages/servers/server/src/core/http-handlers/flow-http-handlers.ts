import { FlowServer } from "@uploadista/core/flow";
import { Effect } from "effect";
import { AuthCacheService } from "../../cache";
import { QuotaExceededError } from "../../permissions/errors";
import { PERMISSIONS } from "../../permissions/types";
import { AuthContextService } from "../../service";
import { UsageHookService } from "../../usage-hooks/service";
import type {
  CancelFlowRequest,
  CancelFlowResponse,
  GetFlowRequest,
  GetFlowResponse,
  GetJobStatusRequest,
  GetJobStatusResponse,
  PauseFlowRequest,
  PauseFlowResponse,
  ResumeFlowRequest,
  ResumeFlowResponse,
  RunFlowRequest,
  RunFlowResponse,
} from "../routes";

export const handleGetFlow = ({ flowId }: GetFlowRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    // Check permission for reading flow status
    yield* authService.requirePermission(PERMISSIONS.FLOW.STATUS);

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Getting flow data: ${flowId}, client: ${clientId}`,
      );
    }

    const flowData = yield* flowServer.getFlowData(flowId, clientId);

    return {
      status: 200,
      body: flowData,
    } as GetFlowResponse;
  });
};

export const handleRunFlow = <TRequirements>({
  flowId,
  storageId,
  inputs,
}: RunFlowRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const usageHookService = yield* UsageHookService;
    const clientId = yield* authService.getClientId();

    // Check permission for executing flows
    yield* authService.requirePermission(PERMISSIONS.FLOW.EXECUTE);

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Executing flow: ${flowId}, storage: ${storageId}, client: ${clientId}`,
      );
      yield* Effect.logInfo(JSON.stringify(inputs, null, 2));
    } else {
      yield* Effect.logInfo(
        `[Flow] Executing flow: ${flowId}, storage: ${storageId}`,
      );
      yield* Effect.logInfo(
        `[Flow] Inputs: ${JSON.stringify(inputs, null, 2)}`,
      );
    }

    // Execute onFlowStart hook for quota checking
    if (clientId) {
      const hookResult = yield* usageHookService.onFlowStart({
        clientId,
        operation: "flow",
        metadata: {
          flowId,
        },
      });

      if (hookResult.action === "abort") {
        return yield* Effect.fail(
          new QuotaExceededError(
            hookResult.reason,
            hookResult.code ?? "SUBSCRIPTION_REQUIRED",
          ),
        );
      }
    }

    // Run flow returns immediately with jobId
    const startTime = Date.now();
    yield* Effect.logInfo(`[Flow] Calling flowServer.runFlow...`);
    const result = yield* flowServer
      .runFlow<TRequirements>({
        flowId,
        storageId,
        clientId,
        inputs,
      })
      .pipe(
        Effect.tap(() =>
          Effect.logInfo(`[Flow] runFlow completed successfully`),
        ),
        Effect.tapError((error) =>
          Effect.logError(`[Flow] runFlow failed with error: ${error}`),
        ),
      );

    // Cache auth context for subsequent flow operations (continue, status)
    const authContext = yield* authService.getAuthContext();
    if (authContext) {
      yield* authCache.set(result.id, authContext);
    }

    yield* Effect.logInfo(`[Flow] Flow started with jobId: ${result.id}`);

    // Note: onFlowComplete hook is called when the flow actually completes,
    // which happens asynchronously. The hook should be invoked from the
    // flow execution pipeline, not here where we just start the flow.

    return {
      status: 200,
      body: result,
    } as RunFlowResponse;
  });
};

export const handleJobStatus = ({ jobId }: GetJobStatusRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    // Check permission for checking flow status
    yield* authService.requirePermission(PERMISSIONS.FLOW.STATUS);

    if (!jobId) {
      throw new Error("No job id");
    }

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Getting job status: ${jobId}, client: ${clientId}`,
      );
    }

    const result = yield* flowServer.getJobStatus(jobId);

    // Clear cache if flow is completed or failed
    if (result.status === "completed" || result.status === "failed") {
      yield* authCache.delete(jobId);
      if (clientId) {
        yield* Effect.logInfo(
          `[Flow] Flow ${result.status}, cleared auth cache: ${jobId}`,
        );
      }
    }

    return {
      status: 200,
      body: result,
    } as GetJobStatusResponse;
  });
};

export const handleResumeFlow = <TRequirements>({
  jobId,
  nodeId,
  newData,
}: ResumeFlowRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;

    // Check permission for executing flows (resume is part of execution)
    yield* authService.requirePermission(PERMISSIONS.FLOW.EXECUTE);

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(jobId);
      clientId = cachedAuth?.clientId ?? null;
    }

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Continuing flow: jobId=${jobId}, nodeId=${nodeId}, client: ${clientId}`,
      );
    }

    if (newData === undefined) {
      throw new Error("Missing newData");
    }

    const result = yield* flowServer.resumeFlow<TRequirements>({
      jobId,
      nodeId,
      newData,
      clientId,
    });

    // Clear cache if flow is completed or failed
    if (result.status === "completed" || result.status === "failed") {
      yield* authCache.delete(jobId);
      if (clientId) {
        yield* Effect.logInfo(
          `[Flow] Flow ${result.status}, cleared auth cache: ${jobId}`,
        );
      }
    }

    return {
      status: 200,
      body: result,
    } as ResumeFlowResponse;
  });
};

export const handlePauseFlow = ({ jobId }: PauseFlowRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;

    // Check permission for cancelling flows (pause is related to cancel)
    yield* authService.requirePermission(PERMISSIONS.FLOW.CANCEL);

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(jobId);
      clientId = cachedAuth?.clientId ?? null;
    }

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Pausing flow: jobId=${jobId}, client: ${clientId}`,
      );
    }

    const result = yield* flowServer.pauseFlow(jobId, clientId);

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Flow paused: ${jobId}, status: ${result.status}`,
      );
    }

    return {
      status: 200,
      body: result,
    } as PauseFlowResponse;
  });
};

export const handleCancelFlow = ({ jobId }: CancelFlowRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const usageHookService = yield* UsageHookService;

    // Check permission for cancelling flows
    yield* authService.requirePermission(PERMISSIONS.FLOW.CANCEL);

    if (!jobId) {
      throw new Error("No job id");
    }

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(jobId);
      clientId = cachedAuth?.clientId ?? null;
    }

    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Cancelling flow: jobId=${jobId}, client: ${clientId}`,
      );
    }

    const result = yield* flowServer.cancelFlow(jobId, clientId);

    // Clear cache since flow is cancelled
    yield* authCache.delete(jobId);
    if (clientId) {
      yield* Effect.logInfo(
        `[Flow] Flow cancelled, cleared auth cache: ${jobId}`,
      );

      // Execute onFlowComplete hook for cancelled flow
      yield* Effect.forkDaemon(
        usageHookService.onFlowComplete({
          clientId,
          operation: "flow",
          metadata: {
            jobId,
            status: "cancelled",
          },
        }),
      );
    }

    return {
      status: 200,
      body: result,
    } as CancelFlowResponse;
  });
};
