import type { UploadFile } from "@uploadista/core/types";
import type { UploadistaApi } from "../client/uploadista-api";
import { UploadistaError } from "../error";
import type { Logger } from "../logger";
import type { AbortControllerLike } from "../services";
import type { FileSource } from "../services/file-reader-service";
import type { PlatformService, Timeout } from "../services/platform-service";
import type { SmartChunker, SmartChunkerConfig } from "../smart-chunker";

import { shouldRetry } from "./chunk-upload";
import type { Callbacks } from "./single-upload";
import type { UploadMetrics } from "./upload-metrics";
import { inStatusCategory } from "./upload-utils";

/**
 * Result from initializing a flow input node
 */
export interface FlowInputInitResult {
  uploadFile: UploadFile;
  nodeId: string;
}

/**
 * Options for initializing a flow input node
 */
export interface InitializeFlowInputOptions {
  nodeId: string;
  jobId: string;
  source: FileSource;
  storageId: string;
  metadata?: Record<string, unknown>;
  uploadistaApi: UploadistaApi;
  logger: Logger;
  platformService: PlatformService;
  callbacks?: Pick<Callbacks, "onStart" | "onError">;
}

/**
 * Options for uploading chunks for a flow input
 */
export interface UploadInputChunksOptions {
  nodeId: string;
  jobId: string;
  uploadFile: UploadFile;
  source: FileSource;
  offset?: number;
  retryAttempt?: number;
  abortController: AbortControllerLike;
  retryDelays: number[] | undefined;
  smartChunker: SmartChunker;
  uploadistaApi: UploadistaApi;
  logger: Logger;
  smartChunking?: SmartChunkerConfig;
  metrics: UploadMetrics;
  platformService: PlatformService;
  onRetry?: (timeout: Timeout) => void;
  callbacks?: Callbacks;
}

/**
 * Options for finalizing a flow input
 */
export interface FinalizeFlowInputOptions {
  nodeId: string;
  jobId: string;
  uploadId: string;
  uploadistaApi: UploadistaApi;
  logger: Logger;
  callbacks?: Pick<Callbacks, "onError">;
}

/**
 * Initialize a single flow input node with the init operation.
 * This starts the input processing and waits for the upload ID.
 *
 * @param options - Configuration for initializing the input
 * @returns Upload file metadata and node ID
 */
export async function initializeFlowInput(
  options: InitializeFlowInputOptions,
): Promise<FlowInputInitResult> {
  const {
    nodeId,
    jobId,
    source,
    storageId,
    metadata = {},
    uploadistaApi,
    logger,
    platformService,
    callbacks,
  } = options;

  // Build metadata for the input
  const inputMetadata = {
    originalName: source.name ?? "unknown",
    mimeType: source.type ?? "application/octet-stream",
    size: source.size ?? 0,
    ...metadata,
  };

  logger.log(`Initializing input node ${nodeId} for job ${jobId}`);

  // Resume the job with init operation for this specific node
  await uploadistaApi.resumeFlow(
    jobId,
    nodeId,
    {
      operation: "init",
      storageId,
      metadata: inputMetadata,
    },
    { contentType: "application/json" },
  );

  logger.log(`Waiting for upload ID from node ${nodeId}`);

  // Poll job status until this node's task is paused with upload file
  const maxAttempts = 60; // 30 seconds total
  const pollInterval = 500; // 0.5 second
  let attempts = 0;
  let jobStatus = await uploadistaApi.getJobStatus(jobId);

  while (attempts < maxAttempts) {
    // Find this specific node's task
    const nodeTask = jobStatus.tasks.find((task) => task.nodeId === nodeId);

    // Check if this node is paused and has a result
    if (
      nodeTask?.status === "paused" &&
      nodeTask.result &&
      (nodeTask.result as UploadFile).id
    ) {
      const uploadFile = nodeTask.result as UploadFile;
      logger.log(`Upload ID received for node ${nodeId}: ${uploadFile.id}`);

      callbacks?.onStart?.({
        uploadId: uploadFile.id,
        size: source.size ?? null,
      });

      return { uploadFile, nodeId };
    }

    // If task failed, throw error
    if (nodeTask?.status === "failed") {
      const error = new UploadistaError({
        name: "FLOW_INIT_FAILED",
        message: `Input node ${nodeId} failed during initialization`,
      });
      callbacks?.onError?.(error);
      throw error;
    }

    await new Promise<void>((resolve) =>
      platformService.setTimeout(resolve, pollInterval),
    );
    jobStatus = await uploadistaApi.getJobStatus(jobId);
    attempts++;
  }

  const error = new UploadistaError({
    name: "FLOW_TIMEOUT",
    message: `Input node ${nodeId} did not return upload ID after init`,
  });
  callbacks?.onError?.(error);
  throw error;
}

/**
 * Upload chunks for a single flow input.
 * This uploads file data directly to the upload API with smart chunking and retry logic.
 *
 * @param options - Configuration for uploading chunks
 */
export async function uploadInputChunks(
  options: UploadInputChunksOptions,
): Promise<void> {
  const {
    nodeId,
    jobId,
    uploadFile,
    source,
    offset = 0,
    abortController,
    retryDelays,
    smartChunker,
    uploadistaApi,
    logger,
    smartChunking,
    metrics,
    platformService,
    onRetry,
    callbacks,
  } = options;

  let retryAttempt = options.retryAttempt ?? 0;
  let offsetBeforeRetry = offset;
  let currentOffset = offset;

  try {
    // Get optimal chunk size
    const remainingBytes = source.size ? source.size - offset : undefined;
    const chunkSizeDecision = smartChunker.getNextChunkSize(remainingBytes);
    const chunkSize = chunkSizeDecision.size;
    const endByte = Math.min(offset + chunkSize, source.size ?? 0);
    const sliceResult = await source.slice(offset, endByte);

    if (!sliceResult || !sliceResult.value) {
      throw new UploadistaError({
        name: "NETWORK_ERROR",
        message: `Failed to read chunk from file for node ${nodeId}`,
      });
    }

    const chunkData = sliceResult.value;

    // Upload chunk directly to upload API
    const startTime = Date.now();

    const res = await uploadistaApi.uploadChunk(uploadFile.id, chunkData, {
      abortController,
    });

    const duration = Date.now() - startTime;

    if (!res.upload) {
      throw new UploadistaError({
        name: "UPLOAD_CHUNK_FAILED",
        message: `Upload chunk response missing upload data for node ${nodeId}`,
      });
    }

    currentOffset = res.upload.offset;

    callbacks?.onProgress?.(uploadFile.id, currentOffset, source.size ?? 0);
    callbacks?.onChunkComplete?.(
      currentOffset - offset,
      offset,
      source.size ?? 0,
    );

    // Record detailed chunk metrics
    if (smartChunking?.enabled !== false) {
      const chunkIndex = Math.floor(offset / chunkSize);

      metrics.recordChunk({
        chunkIndex,
        size: chunkSize,
        duration,
        speed: chunkSize / (duration / 1000),
        success: true,
        retryCount: retryAttempt,
        networkCondition:
          smartChunker.getLastDecision()?.networkCondition?.type,
        chunkingStrategy: smartChunker.getLastDecision()?.strategy,
      });

      // Update smart chunker with connection metrics
      const connectionMetrics = uploadistaApi.getConnectionMetrics();
      smartChunker.updateConnectionMetrics(connectionMetrics);
    }

    // Check if upload is complete
    if (currentOffset >= (source.size ?? 0)) {
      source.close();

      // Complete metrics session
      if (smartChunking?.enabled !== false) {
        const sessionMetrics = metrics.endSession();
        if (sessionMetrics) {
          logger.log(
            `Upload completed for node ${nodeId}: ${sessionMetrics.totalSize} bytes in ${sessionMetrics.totalDuration}ms, avg speed: ${Math.round(sessionMetrics.averageSpeed / 1024)}KB/s`,
          );
        }
      }

      return;
    }

    // Continue uploading next chunk
    await uploadInputChunks({
      ...options,
      offset: currentOffset,
      retryAttempt: 0, // Reset retry count on successful chunk
    });
  } catch (err) {
    // Retry logic
    if (retryDelays != null) {
      const shouldResetDelays = currentOffset > offsetBeforeRetry;
      if (shouldResetDelays) {
        // biome-ignore lint: mutation needed for retry logic
        retryAttempt = 0;
      }

      const castedErr = !(err instanceof UploadistaError)
        ? new UploadistaError({
            name: "NETWORK_ERROR",
            message: `Network error during upload for node ${nodeId}`,
            cause: err as Error,
          })
        : err;

      if (
        shouldRetry(
          platformService,
          castedErr,
          retryAttempt,
          retryDelays,
          callbacks?.onShouldRetry,
        )
      ) {
        const delay = retryDelays[retryAttempt];
        offsetBeforeRetry = offset;

        const timeout = platformService.setTimeout(async () => {
          await uploadInputChunks({
            ...options,
            offset,
            retryAttempt: retryAttempt + 1,
          });
        }, delay);
        onRetry?.(timeout);
      } else {
        throw new UploadistaError({
          name: "UPLOAD_CHUNK_FAILED",
          message: `Failed to upload chunk for node ${nodeId} at offset ${offset}`,
          cause: err as Error,
        });
      }
    } else {
      throw err;
    }
  }
}

/**
 * Finalize a flow input by sending the finalize operation.
 * This tells the flow that this input has completed uploading.
 *
 * @param options - Configuration for finalizing the input
 */
export async function finalizeFlowInput(
  options: FinalizeFlowInputOptions,
): Promise<void> {
  const { nodeId, jobId, uploadId, uploadistaApi, logger, callbacks } = options;

  logger.log(`Finalizing input node ${nodeId} for job ${jobId}`);

  try {
    await uploadistaApi.resumeFlow(
      jobId,
      nodeId,
      {
        operation: "finalize",
        uploadId,
      },
      { contentType: "application/json" },
    );

    logger.log(`Input node ${nodeId} finalized successfully`);
  } catch (err) {
    const error = new UploadistaError({
      name: "FLOW_FINALIZE_FAILED",
      message: `Failed to finalize input node ${nodeId} for job ${jobId}`,
      cause: err as Error,
    });
    callbacks?.onError?.(error);
    throw error;
  }
}
