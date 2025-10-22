import type { FlowServerShape } from "@uploadista/core/flow";
import {
  AuthCacheService,
  AuthContextService,
  getLastSegment,
} from "@uploadista/server";
import { Effect } from "effect";
import type { Request, Response } from "express";
import { handleErrorResponse } from "./error-types";

export const handleFlowGet = (
  req: Request,
  res: Response,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    // Access auth context if available
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const url = new URL(req.url, `http://${req.get("host")}`);
    const id = getLastSegment(url.pathname);
    if (!id) {
      res.status(400).json({ error: "No id" });
      return;
    }

    const flowData = yield* flowServer.getFlowData(id, clientId);

    res.status(200).json(flowData);
  }).pipe(Effect.catchAll(handleErrorResponse(res)));
};

export const handleFlowPost = <TRequirements = never>(
  req: Request,
  res: Response,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    const urlSegments = req.url.split("/");
    const storageId = urlSegments.pop();
    const flowId = urlSegments.pop();

    if (!flowId) {
      res.status(400).json({ error: "No id" });
      return;
    }
    if (!storageId) {
      res.status(400).json({ error: "No storage id" });
      return;
    }

    const params = req.body;

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

    res.status(200).json(result);
  }).pipe(Effect.catchAll(handleErrorResponse(res)));
};

export const handleJobStatus = (
  req: Request,
  res: Response,
  flowServer: FlowServerShape,
): Effect.Effect<void> => {
  return Effect.gen(function* () {
    const urlSegments = req.url.split("/");
    const jobId = urlSegments[urlSegments.length - 2]; // .../jobs/:jobId/status

    if (!jobId) {
      res.status(400).json({ error: "No job id" });
      return;
    }

    const result = yield* flowServer.getJobStatus(jobId);

    res.status(200).json(result);
  }).pipe(Effect.catchAll(handleErrorResponse(res)));
};

export const handleResumeFlow = <TRequirements = never>(
  req: Request,
  res: Response,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const url = new URL(req.url, `http://${req.get("host")}`);
    const urlSegments = url.pathname.split("/");
    const jobId = urlSegments[urlSegments.length - 3]; // .../jobs/:jobId/resume/:nodeId
    const nodeId = urlSegments[urlSegments.length - 1]; // .../jobs/:jobId/resume/:nodeId

    if (!jobId) {
      console.error("No job id");
      res.status(400).json({ error: "No job id" });
      return;
    }

    if (!nodeId) {
      console.error("No node id");
      res.status(400).json({ error: "No node id" });
      return;
    }

    const contentType = req.get("Content-Type");

    let newData: unknown;

    // Handle different content types
    if (contentType?.includes("application/octet-stream")) {
      // For streaming data, convert Node.js Readable to web ReadableStream
      newData = new ReadableStream({
        start(controller) {
          req.on("data", (chunk) => {
            controller.enqueue(chunk);
          });
          req.on("end", () => {
            controller.close();
          });
          req.on("error", (error) => {
            controller.error(error);
          });
        },
      });
    } else if (contentType?.includes("application/json")) {
      // For JSON data, use the parsed body
      const body = req.body;

      if (body.newData === undefined) {
        console.error("Missing newData");
        res.status(400).json({ error: "Missing newData" });
        return;
      }

      newData = body.newData;
    } else {
      res.status(415).json({ error: "Unsupported Content-Type" });
      return;
    }

    const result = yield* flowServer.resumeFlow<TRequirements>({
      jobId,
      nodeId,
      newData,
      clientId,
    });

    res.status(200).json(result);
  }).pipe(Effect.catchAll(handleErrorResponse(res)));
};
