import type { UploadFile } from "@uploadista/core/types";
import type { UploadistaApi } from "../client/uploadista-api";
import { UploadistaError } from "../error";
import type { Logger } from "../logger";
import type { AbortControllerLike } from "../services";
import type { FileSource } from "../services/file-reader-service";
import type { PlatformService, Timeout } from "../services/platform-service";
import type { SmartChunker, SmartChunkerConfig } from "../smart-chunker";
import type { FlowUploadConfig } from "../types/flow-upload-config";

import { shouldRetry } from "./chunk-upload";
import type { Callbacks } from "./single-upload";
import type { UploadMetrics } from "./upload-metrics";
import { inStatusCategory } from "./upload-utils";

/**
 * Start a flow-based upload by initializing the streaming input node
 */
export async function startFlowUpload({
  source,
  flowConfig,
  uploadistaApi,
  logger,
  platformService,
  openWebSocket,
  closeWebSocket,
  ...callbacks
}: {
  source: FileSource;
  flowConfig: FlowUploadConfig;
  uploadistaApi: UploadistaApi;
  logger: Logger;
  platformService: PlatformService;
  openWebSocket: (jobId: string) => void;
  closeWebSocket: (jobId: string) => void;
} & Callbacks): Promise<
  { jobId: string; uploadFile: UploadFile; inputNodeId: string } | undefined
> {
  const { flowId, storageId } = flowConfig;

  // Get the flow to find the streaming input node
  const { flow } = await uploadistaApi.getFlow(flowId);

  // Find the streaming-input-node in the flow
  const inputNode = flow.nodes.find((node) => node.type === "input");

  if (!inputNode) {
    const error = new UploadistaError({
      name: "FLOW_INCOMPATIBLE",
      message: `Flow ${flowId} does not have a streaming input node. The flow must contain a node with type "input" to support flow uploads.`,
    });
    callbacks.onError?.(error);
    throw error;
  }

  const inputNodeId = inputNode.id;

  // Step 1: Initialize the flow with init operation
  const metadata = {
    originalName: source.name ?? "unknown",
    mimeType: source.type ?? "application/octet-stream",
    size: source.size ?? 0,
    ...flowConfig.metadata,
  };

  logger.log(`Starting flow upload for flow ${flowId}, node ${inputNodeId}`);

  const { status, job } = await uploadistaApi.runFlow(flowId, storageId, {
    [inputNodeId]: {
      operation: "init",
      storageId,
      metadata,
    },
  });

  const jobId = job.id;

  if (!inStatusCategory(status, 200) || !jobId) {
    const error = new UploadistaError({
      name: "FLOW_INIT_FAILED",
      message: "Failed to initialize flow upload",
    });
    callbacks.onError?.(error);
    throw error;
  }

  callbacks.onJobStart?.(jobId);

  logger.log(`Flow job ${jobId} created, opening WebSocket`);

  // Open WebSocket to listen for flow events
  // Events are buffered in the Durable Object until connection is established
  openWebSocket(jobId);

  logger.log(`Waiting for upload ID from node`);

  // Step 2: Wait for the streaming-input-node to pause and return the upload file
  // Poll job status until paused (with timeout)
  const maxAttempts = 60; // 30 seconds total
  const pollInterval = 500; // 0.5 second
  let attempts = 0;
  let jobStatus = await uploadistaApi.getJobStatus(jobId);

  while (jobStatus.status !== "paused" && attempts < maxAttempts) {
    await new Promise<void>((resolve) =>
      platformService.setTimeout(resolve, pollInterval),
    );
    jobStatus = await uploadistaApi.getJobStatus(jobId);
    attempts++;
  }

  if (jobStatus.status !== "paused") {
    const error = new UploadistaError({
      name: "FLOW_TIMEOUT",
      message: `Flow did not pause after init (status: ${jobStatus.status})`,
    });
    callbacks.onError?.(error);
    throw error;
  }

  // Get the upload file from streaming input node task result
  const streamingInputTask = jobStatus.tasks.find(
    (task) => task.nodeId === inputNodeId,
  );
  const uploadFile = streamingInputTask?.result as UploadFile;

  if (!uploadFile?.id) {
    const error = new UploadistaError({
      name: "FLOW_NO_UPLOAD_ID",
      message: "Flow did not return upload ID after init",
    });
    callbacks.onError?.(error);
    throw error;
  }

  logger.log(`Upload ID received: ${uploadFile.id}`);

  callbacks.onStart?.({
    uploadId: uploadFile.id,
    size: source.size ?? null,
  });

  return { jobId, uploadFile, inputNodeId };
}

/**
 * Upload chunks directly to the upload API (not through resumeFlow)
 * This is more efficient and reuses the existing upload infrastructure
 */
export async function performFlowUpload({
  jobId,
  uploadFile,
  inputNodeId,
  offset,
  source,
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
  jobId: string;
  uploadFile: UploadFile;
  inputNodeId: string;
  offset: number;
  retryAttempt?: number;
  source: FileSource;
  abortController: AbortControllerLike;
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
    // Get optimal chunk size
    const remainingBytes = source.size ? source.size - offset : undefined;
    const chunkSizeDecision = smartChunker.getNextChunkSize(remainingBytes);
    const chunkSize = chunkSizeDecision.size;
    const endByte = Math.min(offset + chunkSize, source.size ?? 0);
    const sliceResult = await source.slice(offset, endByte);

    if (!sliceResult || !sliceResult.value) {
      throw new UploadistaError({
        name: "NETWORK_ERROR",
        message: "Failed to read chunk from file",
      });
    }

    const chunkData = sliceResult.value;

    // Upload chunk directly to upload API (bypassing flow)
    const startTime = Date.now();

    const res = await uploadistaApi.uploadChunk(uploadFile.id, chunkData, {
      abortController,
    });

    const duration = Date.now() - startTime;

    if (!res.upload) {
      throw new UploadistaError({
        name: "UPLOAD_CHUNK_FAILED",
        message: "Upload chunk response missing upload data",
      });
    }

    currentOffset = res.upload.offset;

    callbacks.onProgress?.(uploadFile.id, currentOffset, source.size ?? 0);
    callbacks.onChunkComplete?.(
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

    // Check if upload is complete after uploading the chunk
    if (currentOffset >= (source.size ?? 0)) {
      if (source) source.close();

      // Complete metrics session
      if (smartChunking?.enabled !== false) {
        const sessionMetrics = metrics.endSession();
        if (sessionMetrics) {
          logger.log(
            `Flow upload completed: ${sessionMetrics.totalSize} bytes in ${sessionMetrics.totalDuration}ms, avg speed: ${Math.round(sessionMetrics.averageSpeed / 1024)}KB/s`,
          );
        }
      }

      // Upload is complete - finalize the flow
      logger.log(`Finalizing flow upload for job ${jobId}`);

      try {
        await uploadistaApi.resumeFlow(
          jobId,
          inputNodeId,
          {
            operation: "finalize",
            uploadId: uploadFile.id,
          },
          { contentType: "application/json" },
        );
      } catch (err) {
        // Finalization errors should not trigger chunk retry logic
        const error = new UploadistaError({
          name: "FLOW_FINALIZE_FAILED",
          message: `Failed to finalize flow upload for job ${jobId}`,
          cause: err as Error,
        });
        callbacks.onError?.(error);
        throw error;
      }
      return;
    }

    // Continue uploading next chunk
    await performFlowUpload({
      jobId,
      uploadFile,
      inputNodeId,
      offset: currentOffset,
      source,
      platformService,
      retryDelays,
      smartChunker,
      uploadistaApi,
      logger,
      smartChunking,
      metrics,
      onRetry,
      abortController,
      ...callbacks,
    });
  } catch (err) {
    // Retry logic similar to single-upload
    if (retryDelays != null) {
      const shouldResetDelays =
        offset != null && currentOffset > offsetBeforeRetry;
      if (shouldResetDelays) {
        retryAttempt = 0;
      }

      const castedErr = !(err instanceof UploadistaError)
        ? new UploadistaError({
            name: "NETWORK_ERROR",
            message: "Network error during flow upload",
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
          await performFlowUpload({
            jobId,
            uploadFile,
            inputNodeId,
            offset,
            source,
            retryAttempt: retryAttempt + 1,
            retryDelays,
            smartChunker,
            uploadistaApi,
            logger,
            smartChunking,
            metrics,
            platformService,
            onRetry,
            abortController,
            ...callbacks,
          });
        }, delay);
        onRetry?.(timeout);
      } else {
        throw new UploadistaError({
          name: "UPLOAD_CHUNK_FAILED",
          message: `Failed to upload chunk for job ${jobId} at offset ${offset}`,
          cause: err as Error,
        });
      }
    }
  }
}
