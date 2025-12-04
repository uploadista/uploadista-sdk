import { inputFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { isSupportedAlgorithm } from "@uploadista/core/utils";
import { MetricsService } from "@uploadista/observability";
import { Effect } from "effect";
import { AuthCacheService } from "../../cache";
import { ValidationError } from "../../error-types";
import { QuotaExceededError } from "../../permissions/errors";
import { PERMISSIONS } from "../../permissions/types";
import { AuthContextService } from "../../service";
import { UsageHookService } from "../../usage-hooks/service";
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
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const usageHookService = yield* UsageHookService;
    const clientId = yield* authService.getClientId();

    // Check permission for creating uploads
    yield* authService.requirePermission(PERMISSIONS.UPLOAD.CREATE);

    if (clientId) {
      yield* Effect.logInfo(`[Upload] Creating upload for client: ${clientId}`);
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

    // Execute onUploadStart hook for quota checking
    if (clientId) {
      const hookResult = yield* usageHookService.onUploadStart({
        clientId,
        operation: "upload",
        metadata: {
          fileSize: parsedInputFile.data.size,
          mimeType: parsedInputFile.data.type,
          fileName: parsedInputFile.data.fileName,
        },
      });

      if (hookResult.action === "abort") {
        return yield* Effect.fail(
          new QuotaExceededError(
            hookResult.reason,
            hookResult.code ?? "QUOTA_EXCEEDED",
          ),
        );
      }
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
      yield* Effect.logInfo(
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

    // Check permission for reading upload capabilities
    yield* authService.requirePermission(PERMISSIONS.UPLOAD.READ);

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
    const authService = yield* AuthContextService;

    // Check permission for reading upload status
    yield* authService.requirePermission(PERMISSIONS.UPLOAD.READ);

    const fileResult = yield* server.getUpload(uploadId);

    return {
      status: 200,
      body: fileResult,
    } as GetUploadResponse;
  });

export const handleUploadChunk = (req: UploadChunkRequest) =>
  Effect.gen(function* () {
    const server = yield* UploadServer;
    const authService = yield* AuthContextService;
    const authCache = yield* AuthCacheService;
    const metricsService = yield* MetricsService;
    const usageHookService = yield* UsageHookService;

    const { uploadId, data } = req;

    // Check permission for creating uploads (chunks are part of creation)
    yield* authService.requirePermission(PERMISSIONS.UPLOAD.CREATE);

    // Try current auth first, fallback to cached auth
    let clientId = yield* authService.getClientId();
    let authMetadata = yield* authService.getMetadata();
    if (!clientId) {
      const cachedAuth = yield* authCache.get(uploadId);
      clientId = cachedAuth?.clientId ?? null;
      authMetadata = cachedAuth?.metadata ?? {};
    }

    if (clientId) {
      yield* Effect.logInfo(
        `[Upload] Uploading chunk for upload: ${uploadId}, client: ${clientId}`,
      );
    }

    const startTime = Date.now();
    const fileResult = yield* server.uploadChunk(uploadId, clientId, data);

    // Clear cache and record metrics if upload is complete
    if (fileResult.size && fileResult.offset >= fileResult.size) {
      yield* authCache.delete(uploadId);
      if (clientId) {
        yield* Effect.logInfo(
          `[Upload] Upload completed, cleared auth cache: ${uploadId}`,
        );
      }

      // Record upload metrics if we have organization ID
      if (clientId && fileResult.size) {
        yield* Effect.logInfo(
          `[Upload] Recording metrics for org: ${clientId}, size: ${fileResult.size}`,
        );
        yield* Effect.forkDaemon(
          metricsService.recordUpload(clientId, fileResult.size, authMetadata),
        );

        // Execute onUploadComplete hook for usage tracking
        const duration = Date.now() - startTime;
        yield* Effect.forkDaemon(
          usageHookService.onUploadComplete({
            clientId,
            operation: "upload",
            metadata: {
              uploadId,
              fileSize: fileResult.size,
              duration,
            },
          }),
        );
      } else {
        yield* Effect.logWarning(
          `[Upload] Cannot record metrics - missing organizationId or size`,
        );
      }
    }

    if (clientId) {
      yield* Effect.logInfo(
        `[Upload] Chunk uploaded for upload: ${uploadId}, client: ${clientId}`,
      );
    }

    return {
      status: 200,
      body: fileResult,
    } as UploadChunkResponse;
  });
