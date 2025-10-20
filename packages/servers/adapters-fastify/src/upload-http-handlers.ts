import { inputFileSchema } from "@uploadista/core/types";
import type { UploadServerShape } from "@uploadista/core/upload";
import { MetricsService } from "@uploadista/observability";
import { AuthCacheService, AuthContextService } from "@uploadista/server";
import { Effect } from "effect";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  BadRequestError,
  handleErrorResponse,
  ValidationError,
} from "./error-types";

export const handleUploadPost = (
  req: FastifyRequest,
  reply: FastifyReply,
  server: UploadServerShape,
) =>
  Effect.gen(function* () {
    // Access auth context if available
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    if (clientId) {
      console.log(`[Upload] Creating upload for client: ${clientId}`);
    }

    const json = req.body;

    if (!json) {
      return yield* Effect.fail(new BadRequestError("Invalid JSON payload"));
    }

    const parsedInputFile = yield* Effect.sync(() =>
      inputFileSchema.safeParse(json),
    );

    if (!parsedInputFile.success) {
      return yield* Effect.fail(
        new ValidationError("Invalid input file schema"),
      );
    }

    const fileCreated = yield* server.createUpload(
      parsedInputFile.data,
      clientId,
    );

    // Cache auth context for subsequent chunk uploads
    const authContext = yield* authService.getAuthContext();
    if (authContext) {
      yield* authCache.set(fileCreated.id, authContext);
    }

    if (clientId) {
      console.log(
        `[Upload] Upload created: ${fileCreated.id} for client: ${clientId}`,
      );
    }

    return yield* Effect.sync(() => reply.status(200).send(fileCreated));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));

export const handleUploadGet = (
  req: FastifyRequest,
  reply: FastifyReply,
  server: UploadServerShape,
) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const url = new URL(req.url, `http://${req.hostname}`);
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const lastSegment = pathSegments[pathSegments.length - 1];

    if (lastSegment === "capabilities") {
      const storageId =
        url.searchParams.get("storageId") ||
        pathSegments[pathSegments.length - 2];

      if (!storageId) {
        return yield* Effect.fail(
          new BadRequestError("storageId is required for capabilities"),
        );
      }

      const capabilities = yield* server.getCapabilities(storageId, clientId);

      return yield* Effect.sync(() =>
        reply.status(200).send({
          storageId,
          capabilities,
          timestamp: new Date().toISOString(),
        }),
      );
    }

    if (!lastSegment) {
      return yield* Effect.fail(new BadRequestError("Upload ID is required"));
    }

    const fileResult = yield* server.getUpload(lastSegment);

    return yield* Effect.sync(() => reply.status(200).send(fileResult));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));

export const handleUploadPatch = (
  req: FastifyRequest,
  reply: FastifyReply,
  server: UploadServerShape,
) =>
  Effect.gen(function* () {
    // Try to get auth from current request or cached auth
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const metricsService = yield* MetricsService;

    const url = new URL(req.url, `http://${req.hostname}`);
    const uploadId = url.pathname.split("/").pop();
    if (!uploadId) {
      return yield* Effect.fail(new BadRequestError("Upload ID is required"));
    }

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    let authMetadata = yield* authService.getMetadata();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(uploadId);
      clientId = cachedAuth?.clientId ?? null;
      authMetadata = cachedAuth?.metadata ?? {};
    }

    if (clientId) {
      console.log(
        `[Upload] Uploading chunk for upload: ${uploadId}, client: ${clientId}`,
      );
    }

    // Convert Fastify request stream to web ReadableStream
    const body = new ReadableStream({
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

    const fileResult = yield* server.uploadChunk(uploadId, clientId, body);

    // Clear cache and record metrics if upload is complete
    if (fileResult.size && fileResult.offset >= fileResult.size) {
      yield* authCache.delete(uploadId);
      if (clientId) {
        console.log(
          `[Upload] Upload completed, cleared auth cache: ${uploadId}`,
        );
      }

      // Record upload metrics if we have organization ID
      if (clientId && fileResult.size) {
        console.log(
          `[Upload] Recording metrics for org: ${clientId}, size: ${fileResult.size}`,
        );
        yield* Effect.forkDaemon(
          metricsService.recordUpload(clientId, fileResult.size, authMetadata),
        );
      } else {
        console.warn(
          `[Upload] Cannot record metrics - missing organizationId or size`,
        );
      }
    }

    if (clientId) {
      console.log(
        `[Upload] Chunk uploaded for upload: ${uploadId}, client: ${clientId}`,
      );
    }

    return yield* Effect.sync(() => reply.status(200).send(fileResult));
  }).pipe(Effect.catchAll(handleErrorResponse(reply)));
