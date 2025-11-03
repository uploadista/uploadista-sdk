import { inputFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { isSupportedAlgorithm } from "@uploadista/core/utils";
import { MetricsService } from "@uploadista/observability";
import { Effect } from "effect";
import { AuthCacheService } from "../../cache";
import { ValidationError } from "../../error-types";
import { AuthContextService } from "../../service";
import type {
  CreateUploadRequest,
  CreateUploadResponse,
  GetCapabilitiesRequest,
  GetCapabilitiesResponse,
  GetUploadRequest,
  GetUploadResponse,
  UploadChunkRequest,
  UploadChunkResponse,
} from "../routes";

export const handleCreateUpload = (req: CreateUploadRequest) =>
  Effect.gen(function* () {
    const server = yield* UploadServer;
    // Access auth context if available
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const clientId = yield* authService.getClientId();

    if (clientId) {
      console.log(`[Upload] Creating upload for client: ${clientId}`);
    }

    const parsedInputFile = yield* Effect.sync(() =>
      inputFileSchema.safeParse(req.data),
    );

    if (!parsedInputFile.success) {
      return yield* Effect.fail(
        new ValidationError("Invalid input file schema"),
      );
    }

    // Validate checksum algorithm if provided
    if (
      parsedInputFile.data.checksumAlgorithm &&
      !isSupportedAlgorithm(parsedInputFile.data.checksumAlgorithm)
    ) {
      return yield* Effect.fail(
        new ValidationError(
          `Unsupported checksum algorithm: ${parsedInputFile.data.checksumAlgorithm}. Supported algorithms: sha256`,
        ),
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

    return {
      status: 200,
      body: fileCreated,
    } as CreateUploadResponse;
  });

export const handleGetCapabilities = ({ storageId }: GetCapabilitiesRequest) =>
  Effect.gen(function* () {
    const server = yield* UploadServer;
    const authService = yield* AuthContextService;
    const clientId = yield* authService.getClientId();

    const capabilities = yield* server.getCapabilities(storageId, clientId);

    return {
      status: 200,
      body: {
        storageId,
        capabilities,
        timestamp: new Date().toISOString(),
      },
    } as GetCapabilitiesResponse;
  });

export const handleGetUpload = ({ uploadId }: GetUploadRequest) =>
  Effect.gen(function* () {
    const server = yield* UploadServer;
    const fileResult = yield* server.getUpload(uploadId);

    return {
      status: 200,
      body: fileResult,
    } as GetUploadResponse;
  });

export const handleUploadChunk = (req: UploadChunkRequest) =>
  Effect.gen(function* () {
    const server = yield* UploadServer;
    // Try to get auth from current request or cached auth
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const metricsService = yield* MetricsService;

    const { uploadId, data } = req;

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

    const fileResult = yield* server.uploadChunk(uploadId, clientId, data);

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

    return {
      status: 200,
      body: fileResult,
    } as UploadChunkResponse;
  });
