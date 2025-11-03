import { FlowServer } from "@uploadista/core/flow";
import { Effect } from "effect";
import { AuthCacheService } from "../../cache";
import { AuthContextService } from "../../service";
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
    // Access auth context if available
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    if (clientId) {
      console.log(`[Flow] Getting flow data: ${flowId}, client: ${clientId}`);
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
    // Access auth context if available
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    if (clientId) {
      console.log(
        `[Flow] Executing flow: ${flowId}, storage: ${storageId}, client: ${clientId}`,
      );
      console.log(JSON.stringify(inputs, null, 2));
    } else {
      console.log(`[Flow] Executing flow: ${flowId}, storage: ${storageId}`);
      console.log(`[Flow] Inputs:`, JSON.stringify(inputs, null, 2));
    }

    // Run flow returns immediately with jobId
    console.log(`[Flow] Calling flowServer.runFlow...`);
    const result = yield* flowServer.runFlow<TRequirements>({
      flowId,
      storageId,
      clientId,
      inputs,
    }).pipe(
      Effect.tap(() => Effect.sync(() => console.log(`[Flow] runFlow completed successfully`))),
      Effect.tapError((error) => Effect.sync(() => {
        console.error(`[Flow] runFlow failed with error:`, error);
        return error;
      })),
    );

    // Cache auth context for subsequent flow operations (continue, status)
    const authContext = yield* authService.getAuthContext();
    if (authContext) {
      yield* authCache.set(result.id, authContext);
    }

    console.log(`[Flow] Flow started with jobId: ${result.id}`);

    return {
      status: 200,
      body: result,
    } as RunFlowResponse;
  });
};

export const handleJobStatus = ({ jobId }: GetJobStatusRequest) => {
  return Effect.gen(function* () {
    const flowServer = yield* FlowServer;
    // Access auth context if available
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    if (!jobId) {
      throw new Error("No job id");
    }

    if (clientId) {
      console.log(`[Flow] Getting job status: ${jobId}, client: ${clientId}`);
    }

    const result = yield* flowServer.getJobStatus(jobId);

    // Clear cache if flow is completed or failed
    if (result.status === "completed" || result.status === "failed") {
      yield* authCache.delete(jobId);
      if (clientId) {
        console.log(
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
    // Try to get auth from current request or cached auth
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(jobId);
      clientId = cachedAuth?.clientId ?? null;
    }

    if (clientId) {
      console.log(
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
        console.log(
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
    // Try to get auth from current request or cached auth
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(jobId);
      clientId = cachedAuth?.clientId ?? null;
    }

    if (clientId) {
      console.log(`[Flow] Pausing flow: jobId=${jobId}, client: ${clientId}`);
    }

    const result = yield* flowServer.pauseFlow(jobId, clientId);

    if (clientId) {
      console.log(`[Flow] Flow paused: ${jobId}, status: ${result.status}`);
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
    // Try to get auth from current request or cached auth
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;

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
      console.log(
        `[Flow] Cancelling flow: jobId=${jobId}, client: ${clientId}`,
      );
    }

    const result = yield* flowServer.cancelFlow(jobId, clientId);

    // Clear cache since flow is cancelled
    yield* authCache.delete(jobId);
    if (clientId) {
      console.log(`[Flow] Flow cancelled, cleared auth cache: ${jobId}`);
    }

    return {
      status: 200,
      body: result,
    } as CancelFlowResponse;
  });
};
