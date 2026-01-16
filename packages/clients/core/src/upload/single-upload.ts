import type { InputFile, UploadFile } from "@uploadista/core/types";
import type { UploadistaApi } from "../client/uploadista-api";
import { UploadistaError } from "../error";
import type { Logger } from "../logger";
import type { AbortControllerLike } from "../services/abort-controller-service";
import type { ChecksumService } from "../services/checksum-service";
import type { FileSource } from "../services/file-reader-service";
import type { IdGenerationService } from "../services/id-generation-service";
import type { PlatformService, Timeout } from "../services/platform-service";
import type { WebSocketLike } from "../services/websocket-service";
import type { SmartChunker, SmartChunkerConfig } from "../smart-chunker";
import type { ClientStorage } from "../storage/client-storage";
import {
  type OnProgress,
  type OnShouldRetry,
  shouldRetry,
  uploadChunk,
} from "./chunk-upload";
import type { UploadMetrics } from "./upload-metrics";
import {
  removeFromClientStorage,
  saveUploadInClientStorage,
} from "./upload-storage";
import { encodeMetadata, inStatusCategory } from "./upload-utils";

export type Callbacks = {
  onProgress?: OnProgress;
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;
  onSuccess?: (payload: UploadFile) => void;
  onError?: (error: Error | UploadistaError) => void;
  onStart?: (file: { uploadId: string; size: number | null }) => void;
  onJobStart?: (jobId: string) => void;
  onShouldRetry?: OnShouldRetry;
};

export type SingleUploadResult = {
  uploadIdStorageKey: string | undefined;
  uploadId: string;
  offset: number;
};

/**
 * Start uploading the file using PATCH requests. The file will be divided
 * into chunks as specified in the chunkSize option. During the upload
 * the onProgress event handler may be invoked multiple times.
 */
export async function performUpload({
  uploadId,
  offset,
  source,
  uploadLengthDeferred,
  retryAttempt = 0,
  abortController,
  retryDelays,
  smartChunker,
  uploadistaApi,
  logger,
  smartChunking,
  metrics,
  platformService,
  onRetry,
  ...callbacks
}: {
  uploadId: string;
  offset: number;
  retryAttempt?: number;
  source: FileSource;
  abortController: AbortControllerLike;
  uploadLengthDeferred: boolean | undefined;
  retryDelays: number[] | undefined;
  smartChunker: SmartChunker;
  uploadistaApi: UploadistaApi;
  logger: Logger;
  smartChunking?: SmartChunkerConfig;
  metrics: UploadMetrics;
  platformService: PlatformService;
  onRetry?: (timeout: Timeout) => void;
} & Callbacks): Promise<void> {
  let offsetBeforeRetry = offset;
  let currentOffset = offset;

  try {
    const res = await uploadChunk({
      uploadId,
      source,
      offset,
      uploadLengthDeferred,
      onProgress: callbacks.onProgress,
      abortController,
      smartChunker,
      uploadistaApi,
      logger,
    });

    if (!inStatusCategory(res.status, 200) || res.upload == null) {
      throw new UploadistaError({
        name: "NETWORK_UNEXPECTED_RESPONSE",
        message: "Unexpected response while uploading chunk",
      });
    }

    currentOffset = res.upload.offset;

    callbacks.onProgress?.(uploadId, currentOffset, res.upload.size ?? 0);
    callbacks.onChunkComplete?.(
      currentOffset - offset,
      offset,
      res.upload?.size ?? 0,
    );

    // Record detailed chunk metrics
    if (smartChunking?.enabled !== false) {
      const chunkIndex = Math.floor(offset / (currentOffset - offset || 1));
      const chunkSize = currentOffset - offset;
      const chunkDuration = Date.now() - (Date.now() - 100); // Approximate, real timing is in uploadChunk
      const lastDecision = smartChunker.getLastDecision();

      metrics.recordChunk({
        chunkIndex,
        size: chunkSize,
        duration: chunkDuration,
        speed: chunkSize / (chunkDuration / 1000),
        success: true,
        retryCount: retryAttempt,
        networkCondition: lastDecision?.networkCondition?.type,
        chunkingStrategy: lastDecision?.strategy,
      });

      // Update smart chunker with connection metrics for pooling optimization
      const connectionMetrics = uploadistaApi.getConnectionMetrics();
      smartChunker.updateConnectionMetrics(connectionMetrics);
    }

    if (currentOffset >= (source.size ?? 0)) {
      if (source) source.close();

      // Complete metrics session
      if (smartChunking?.enabled !== false) {
        const sessionMetrics = metrics.endSession();
        if (sessionMetrics) {
          logger.log(
            `Upload completed: ${sessionMetrics.totalSize} bytes in ${sessionMetrics.totalDuration}ms, avg speed: ${Math.round(sessionMetrics.averageSpeed / 1024)}KB/s`,
          );
        }
      }

      callbacks.onSuccess?.(res.upload);
      return;
    }

    await performUpload({
      uploadId,
      offset: currentOffset,
      source,
      uploadLengthDeferred,
      retryDelays,
      smartChunker,
      platformService,
      uploadistaApi,
      logger,
      smartChunking,
      metrics,
      onRetry,
      abortController,
      ...callbacks,
    });
  } catch (err) {
    // Check if we should retry, when enabled, before sending the error to the user.
    if (retryDelays != null) {
      // We will reset the attempt counter if
      // - we were already able to connect to the server (offset != null) and
      // - we were able to upload a small chunk of data to the server
      const shouldResetDelays =
        offset != null && currentOffset > offsetBeforeRetry;
      if (shouldResetDelays) {
        retryAttempt = 0;
      }

      const castedErr = !(err instanceof UploadistaError)
        ? new UploadistaError({
            name: "NETWORK_ERROR",
            message: "Network error",
            cause: err as Error,
          })
        : err;

      if (
        shouldRetry(
          platformService,
          castedErr,
          retryAttempt,
          retryDelays,
          callbacks.onShouldRetry,
        )
      ) {
        const delay = retryDelays[retryAttempt];

        offsetBeforeRetry = offset;

        const timeout = platformService.setTimeout(async () => {
          await performUpload({
            uploadId,
            offset,
            source,
            retryAttempt: retryAttempt + 1,
            uploadLengthDeferred,
            retryDelays,
            smartChunker,
            platformService,
            uploadistaApi,
            logger,
            smartChunking,
            metrics,
            onRetry,
            abortController,
            ...callbacks,
          });
        }, delay);
        onRetry?.(timeout);
      } else {
        throw new UploadistaError({
          name: "UPLOAD_CHUNK_FAILED",
          message: `failed to upload chunk for ${uploadId} at offset ${offset}`,
          cause: err as Error,
        });
      }
    }
  }
}

/**
 * Create a new upload using the creation extension by sending a POST
 * request to the endpoint. After successful creation the file will be
 * uploaded
 */
export async function createUpload({
  fingerprint,
  storageId,
  source,
  uploadLengthDeferred,
  metadata,
  uploadistaApi,
  logger,
  checksumService,
  clientStorage,
  generateId,
  storeFingerprintForResuming,
  openWebSocket,
  closeWebSocket,
  computeChecksum = true,
  checksumAlgorithm = "sha256",
  platformService,
  ...callbacks
}: {
  fingerprint: string;
  storageId: string;
  source: FileSource;
  uploadLengthDeferred: boolean | undefined;
  metadata: Record<string, string>;
  uploadistaApi: UploadistaApi;
  logger: Logger;
  clientStorage: ClientStorage;
  generateId: IdGenerationService;
  storeFingerprintForResuming: boolean;
  openWebSocket: (uploadId: string) => WebSocketLike;
  closeWebSocket: (uploadId: string) => void;
  checksumService: ChecksumService;
  computeChecksum?: boolean;
  checksumAlgorithm?: string;
  platformService: PlatformService;
} & Callbacks): Promise<SingleUploadResult | undefined> {
  if (!uploadLengthDeferred && source.size == null) {
    const error = new UploadistaError({
      name: "UPLOAD_SIZE_NOT_SPECIFIED",
      message: "expected size to be set",
    });
    callbacks.onError?.(error);
    throw error;
  }

  // Compute checksum if enabled and file is a File object
  let checksum: string | undefined;
  if (computeChecksum && platformService.isFileLike(source.input)) {
    try {
      logger.log("Computing file checksum...");
      checksum = await checksumService.computeChecksum(
        new Uint8Array(source.input as unknown as ArrayBuffer),
      );
      logger.log(`Checksum computed: ${checksum}`);
    } catch (error) {
      logger.log(
        `Warning: Failed to compute checksum: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      // Continue without checksum if computation fails
    }
  }

  const createUploadData: InputFile = {
    uploadLengthDeferred,
    storageId,
    size: source.size ?? 0,
    metadata: metadata ? encodeMetadata(metadata) : undefined,
    fileName: source.name ?? undefined,
    type: source.type ?? "",
    lastModified: source.lastModified ?? undefined,
    checksum,
    checksumAlgorithm: checksum ? checksumAlgorithm : undefined,
  };

  const { upload, status } = await uploadistaApi.createUpload(createUploadData);

  if (!inStatusCategory(status, 200) || upload == null) {
    const error = new UploadistaError({
      name: "NETWORK_UNEXPECTED_RESPONSE",
      message: "Unexpected response while creating upload",
    });
    callbacks.onError?.(error);
    throw error;
  }

  logger.log(`Created upload ${upload.id}`);

  openWebSocket(upload.id);

  if (upload.size === 0) {
    // Nothing to upload and file was successfully created
    callbacks.onSuccess?.(upload);
    if (source) source.close();
    closeWebSocket(upload.id);
    return;
  }

  const uploadIdStorageKey = await saveUploadInClientStorage({
    clientStorage,
    fingerprint,
    size: upload.size ?? 0,
    metadata: upload.metadata ?? {},
    clientStorageKey: null,
    storeFingerprintForResuming,
    generateId,
  });

  callbacks.onStart?.({
    uploadId: upload.id,
    size: upload.size ?? null,
  });

  return {
    uploadIdStorageKey,
    uploadId: upload.id,
    offset: upload.offset,
  };
}

/**
 * Try to resume an existing upload. First a HEAD request will be sent
 * to retrieve the offset. If the request fails a new upload will be
 * created. In the case of a successful response the file will be uploaded.
 */
export async function resumeUpload({
  uploadId,
  storageId,
  uploadIdStorageKey,
  fingerprint,
  source,
  uploadLengthDeferred,
  uploadistaApi,
  logger,
  platformService,
  checksumService,
  clientStorage,
  generateId,
  storeFingerprintForResuming,
  openWebSocket,
  ...callbacks
}: {
  uploadId: string;
  storageId: string;
  uploadIdStorageKey: string;
  fingerprint: string;
  platformService: PlatformService;
  source: FileSource;
  uploadLengthDeferred: boolean | undefined;
  uploadistaApi: UploadistaApi;
  checksumService: ChecksumService;
  logger: Logger;
  clientStorage: ClientStorage;
  generateId: IdGenerationService;
  storeFingerprintForResuming: boolean;
  openWebSocket: (uploadId: string) => WebSocketLike;
} & Callbacks): Promise<SingleUploadResult | undefined> {
  const res = await uploadistaApi.getUpload(uploadId);
  const status = res.status;

  if (!inStatusCategory(status, 200)) {
    // If the upload is locked (indicated by the 423 Locked status code), we
    // emit an error instead of directly starting a new upload. This way the
    // retry logic can catch the error and will retry the upload. An upload
    // is usually locked for a short period of time and will be available
    // afterwards.
    if (status === 423) {
      const error = new UploadistaError({
        name: "UPLOAD_LOCKED",
        message: "upload is currently locked; retry later",
      });
      callbacks.onError?.(error);
      throw error;
    }

    if (inStatusCategory(status, 400)) {
      // Remove stored fingerprint and corresponding endpoint,
      // on client errors since the file can not be found
      await removeFromClientStorage(clientStorage, uploadIdStorageKey);
    }

    // Try to create a new upload
    return await createUpload({
      platformService,
      fingerprint,
      storageId,
      source,
      uploadLengthDeferred,
      metadata: {},
      uploadistaApi,
      logger,
      checksumService,
      clientStorage,
      generateId,
      storeFingerprintForResuming,
      openWebSocket,
      closeWebSocket: () => {}, // Placeholder, will be provided by caller
      ...callbacks,
    });
  }

  const upload = res.upload;
  if (upload == null) {
    const error = new UploadistaError({
      name: "NETWORK_UNEXPECTED_RESPONSE",
      message: "Unexpected response while resuming upload",
    });
    callbacks.onError?.(error);
    throw error;
  }

  await saveUploadInClientStorage({
    clientStorage,
    fingerprint,
    size: upload.size ?? 0,
    metadata: upload.metadata ?? {},
    clientStorageKey: uploadIdStorageKey,
    storeFingerprintForResuming,
    generateId,
  });

  // Upload has already been completed and we do not need to send additional
  // data to the server
  if (upload.offset === upload.size) {
    return undefined;
  }

  openWebSocket(upload.id);

  return {
    uploadId,
    uploadIdStorageKey,
    offset: upload.offset,
  };
}

/**
 * Initiate the uploading procedure for a non-parallel upload. Here the entire file is
 * uploaded in a sequential matter.
 */
export async function startSingleUpload({
  source,
  uploadId,
  uploadIdStorageKey,
  storageId,
  fingerprint,
  platformService,
  uploadLengthDeferred,
  uploadistaApi,
  checksumService,
  logger,
  clientStorage,
  generateId,
  storeFingerprintForResuming,
  openWebSocket,
  closeWebSocket,
  ...callbacks
}: {
  source: FileSource;
  uploadId: string | null;
  uploadIdStorageKey: string | null;
  storageId: string;
  fingerprint: string;
  platformService: PlatformService;
  uploadLengthDeferred: boolean | undefined;
  uploadistaApi: UploadistaApi;
  checksumService: ChecksumService;
  logger: Logger;
  clientStorage: ClientStorage;
  generateId: IdGenerationService;
  storeFingerprintForResuming: boolean;
  openWebSocket: (uploadId: string) => WebSocketLike;
  closeWebSocket: (uploadId: string) => void;
} & Callbacks): Promise<SingleUploadResult | undefined> {
  // The upload had been started previously and we should reuse this URL.
  if (uploadId != null && uploadIdStorageKey != null) {
    logger.log(`Resuming upload from previous id: ${uploadId}`);
    return await resumeUpload({
      uploadId,
      uploadIdStorageKey,
      storageId,
      fingerprint,
      source,
      checksumService,
      uploadLengthDeferred,
      uploadistaApi,
      logger,
      platformService,
      clientStorage,
      generateId,
      storeFingerprintForResuming,
      openWebSocket,
      ...callbacks,
    });
  }

  // An upload has not started for the file yet, so we start a new one
  logger.log("Creating a new upload");
  return await createUpload({
    fingerprint,
    storageId,
    source,
    uploadLengthDeferred,
    metadata: {},
    uploadistaApi,
    logger,
    checksumService,
    platformService,
    clientStorage,
    generateId,
    storeFingerprintForResuming,
    openWebSocket,
    closeWebSocket,
    ...callbacks,
  });
}
