import type { FlowServerShape } from "@uploadista/core/flow";
import {
  AuthCacheService,
  AuthContextService,
  getLastSegment,
} from "@uploadista/server";
import { Effect } from "effect";
import { handleErrorResponse } from "./error-types";

export const handleFlowGet = (req: Request, flowServer: FlowServerShape) => {
  return Effect.gen(function* () {
    // Access auth context if available
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const id = getLastSegment(new URL(req.url).pathname);
    if (!id) {
      return new Response("No id", { status: 400 });
    }

    if (clientId) {
      console.log(`[Flow] Getting flow data: ${id}, client: ${clientId}`);
    }

    const flowData = yield* flowServer.getFlowData(id, clientId);

    return new Response(JSON.stringify(flowData), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }).pipe(Effect.catchAll(handleErrorResponse));
};

export const handleFlowPost = <TRequirements>(
  req: Request,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    // Access auth context if available
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    const urlSegments = req.url.split("/");
    const storageId = urlSegments.pop();
    const flowId = urlSegments.pop();

    if (!flowId) {
      return new Response("No id", { status: 400 });
    }
    if (!storageId) {
      return new Response("No storage id", { status: 400 });
    }

    const params = yield* Effect.tryPromise({
      try: () => req.json(),
      catch: () => new Error("Invalid JSON body"),
    });

    if (clientId) {
      console.log(
        `[Flow] Executing flow: ${flowId}, storage: ${storageId}, client: ${clientId}`,
      );
      console.log(JSON.stringify(params, null, 2));
    } else {
      console.log(`Flow execution params: ${flowId} ${storageId}`);
      console.log(JSON.stringify(params, null, 2));
    }

    // Run flow returns immediately with jobId
    const result = yield* flowServer.runFlow<TRequirements>({
      flowId,
      storageId,
      clientId,
      inputs: params.inputs,
    });

    // Cache auth context for subsequent flow operations (continue, status)
    const authContext = yield* authService.getAuthContext();
    if (authContext) {
      yield* authCache.set(result.id, authContext);
    }

    if (clientId) {
      console.log(
        `[Flow] Flow started with jobId: ${result.id}, client: ${clientId}`,
      );
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }).pipe(Effect.catchAll(handleErrorResponse));
};

export const handleJobStatus = (req: Request, flowServer: FlowServerShape) => {
  return Effect.gen(function* () {
    // Access auth context if available
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    const urlSegments = req.url.split("/");
    const jobId = urlSegments[urlSegments.length - 2]; // .../jobs/:jobId/status

    if (!jobId) {
      return new Response("No job id", { status: 400 });
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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }).pipe(Effect.catchAll(handleErrorResponse));
};

export const handleContinueFlow = <TRequirements>(
  req: Request,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    // Try to get auth from current request or cached auth
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;

    const url = new URL(req.url);
    const urlSegments = url.pathname.split("/");
    const jobId = urlSegments[urlSegments.length - 3]; // .../jobs/:jobId/continue/:nodeId
    const nodeId = urlSegments[urlSegments.length - 1]; // .../jobs/:jobId/continue/:nodeId

    if (!jobId) {
      console.error("No job id");
      return new Response("No job id", { status: 400 });
    }

    if (!nodeId) {
      console.error("No node id");
      return new Response("No node id", { status: 400 });
    }

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

    const contentType = req.headers.get("Content-Type");

    let newData: unknown;

    // Handle different content types
    if (contentType?.includes("application/octet-stream")) {
      // For streaming data, pass the ReadableStream directly
      if (!req.body) {
        return new Response("Missing body for octet-stream", { status: 400 });
      }
      newData = req.body;
    } else if (contentType?.includes("application/json")) {
      // For JSON data, parse the body
      const body = yield* Effect.tryPromise({
        try: () => req.json(),
        catch: () => new Error("Invalid JSON body"),
      });

      if (body.newData === undefined) {
        console.error("Missing newData");
        return new Response("Missing newData", { status: 400 });
      }

      newData = body.newData;
    } else {
      return new Response("Unsupported Content-Type", { status: 415 });
    }

    const result = yield* flowServer.continueFlow<TRequirements>({
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

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }).pipe(Effect.catchAll(handleErrorResponse));
};
