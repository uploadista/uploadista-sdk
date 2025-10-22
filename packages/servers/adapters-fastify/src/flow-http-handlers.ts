import type { FlowServerShape } from "@uploadista/core/flow";
import {
  AuthCacheService,
  AuthContextService,
  getLastSegment,
} from "@uploadista/server";
import { Effect } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";
import { handleErrorResponse } from "./error-types";

export const handleFlowGet = (
  req: FastifyRequest,
  reply: FastifyReply,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    // Access auth context if available
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const url = new URL(req.url, `http://${req.hostname}`);
    const id = getLastSegment(url.pathname);
    if (!id) {
      return yield* Effect.sync(() =>
        reply.status(400).send({ error: "No id" }),
      );
    }

    const flowData = yield* flowServer.getFlowData(id, clientId);

    return yield* Effect.sync(() => reply.status(200).send(flowData));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));
};

export const handleFlowPost = <TRequirements = never>(
  req: FastifyRequest,
  reply: FastifyReply,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    const url = new URL(req.url, `http://${req.hostname}`);
    const urlSegments = url.pathname.split("/");
    const storageId = urlSegments.pop();
    const flowId = urlSegments.pop();

    if (!flowId) {
      return yield* Effect.sync(() =>
        reply.status(400).send({ error: "No id" }),
      );
    }
    if (!storageId) {
      return yield* Effect.sync(() =>
        reply.status(400).send({ error: "No storage id" }),
      );
    }

    const params = req.body as { inputs?: unknown };

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

    return yield* Effect.sync(() => reply.status(200).send(result));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));
};

export const handleJobStatus = (
  req: FastifyRequest,
  reply: FastifyReply,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    const url = new URL(req.url, `http://${req.hostname}`);
    const urlSegments = url.pathname.split("/");
    const jobId = urlSegments[urlSegments.length - 2]; // .../jobs/:jobId/status

    if (!jobId) {
      return yield* Effect.sync(() =>
        reply.status(400).send({ error: "No job id" }),
      );
    }

    const result = yield* flowServer.getJobStatus(jobId);

    return yield* Effect.sync(() => reply.status(200).send(result));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));
};

export const handleResumeFlow = <TRequirements = never>(
  req: FastifyRequest,
  reply: FastifyReply,
  flowServer: FlowServerShape,
) => {
  return Effect.gen(function* () {
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const url = new URL(req.url, `http://${req.hostname}`);
    const urlSegments = url.pathname.split("/");
    const jobId = urlSegments[urlSegments.length - 3]; // .../jobs/:jobId/resume/:nodeId
    const nodeId = urlSegments[urlSegments.length - 1]; // .../jobs/:jobId/resume/:nodeId

    if (!jobId) {
      console.error("No job id");
      return yield* Effect.sync(() =>
        reply.status(400).send({ error: "No job id" }),
      );
    }

    if (!nodeId) {
      console.error("No node id");
      return yield* Effect.sync(() =>
        reply.status(400).send({ error: "No node id" }),
      );
    }

    const contentType = req.headers["content-type"];

    let newData: unknown;

    // Handle different content types
    if (contentType?.includes("application/octet-stream")) {
      // For streaming data, convert Fastify request to web ReadableStream
      newData = new ReadableStream({
        start(controller) {
          req.raw.on("data", (chunk) => {
            controller.enqueue(chunk);
          });
          req.raw.on("end", () => {
            controller.close();
          });
          req.raw.on("error", (error) => {
            controller.error(error);
          });
        },
      });
    } else if (contentType?.includes("application/json")) {
      // For JSON data, use the parsed body
      const body = req.body as { newData?: unknown };

      if (body.newData === undefined) {
        console.error("Missing newData");

        return yield* Effect.sync(() =>
          reply.status(400).send({ error: "Missing newData" }),
        );
      }

      newData = body.newData;
    } else {
      return yield* Effect.sync(() =>
        reply.status(415).send({ error: "Unsupported Content-Type" }),
      );
    }

    const result = yield* flowServer.resumeFlow<TRequirements>({
      jobId,
      nodeId,
      newData,
      clientId,
    });

    return yield* Effect.sync(() => reply.status(200).send(result));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));
};
