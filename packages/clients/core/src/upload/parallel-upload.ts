import type { UploadFile } from "@uploadista/core/types";
import type { UploadistaApi } from "../client/uploadista-api";
import { UploadistaError } from "../error";
import type { Logger } from "../logger";
import type {
  AbortControllerFactory,
  AbortControllerLike,
} from "../services/abort-controller-service";
import type { ChecksumService } from "../services/checksum-service";
import type { FileSource } from "../services/file-reader-service";
import type { IdGenerationService } from "../services/id-generation-service";
import type { PlatformService, Timeout } from "../services/platform-service";
import type { WebSocketLike } from "../services/websocket-service";
import type { SmartChunker, SmartChunkerConfig } from "../smart-chunker";
import type { ClientStorage } from "../storage/client-storage";
import { type Callbacks, createUpload, performUpload } from "./single-upload";
import type { UploadMetrics } from "./upload-metrics";
import { calculateSegments } from "./upload-utils";

export type ParallelUploadSegment = {
  uploadId: string;
  uploadIdStorageKey: string | undefined;
  segmentIndex: number;
  startByte: number;
  endByte: number;
  offset: number;
  abortController: AbortControllerLike;
  retryTimeout: Timeout | null;
};

export type ParallelUploadState = {
  segments: ParallelUploadSegment[];
  totalProgress: number;
  completed: boolean;
  failed: boolean;
  error?: Error;
};

export type ParallelUploadResult = {
  parallelState: ParallelUploadState;
  abort: () => Promise<void>;
};

/**
 * Initiate the uploading procedure for a parallelized upload, where one file is split into
 * multiple request which are run in parallel.
 */
export async function startParallelUpload({
  source,
  storageId,
  fingerprint,
  uploadLengthDeferred,
  parallelUploads,
  parallelChunkSize,
  retryDelays,
  smartChunker,
  uploadistaApi,
  logger,
  checksumService,
  smartChunking,
  metrics,
  clientStorage,
  generateId,
  storeFingerprintForResuming,
  openWebSocket,
  closeWebSocket,
  terminate,
  abortControllerFactory,
  platformService,
  ...callbacks
}: {
  source: FileSource;
  storageId: string;
  fingerprint: string;
  uploadLengthDeferred: boolean | undefined;
  parallelUploads: number;
  parallelChunkSize?: number;
  retryDelays?: number[];
  smartChunker: SmartChunker;
  uploadistaApi: UploadistaApi;
  checksumService: ChecksumService;
  logger: Logger;
  smartChunking?: SmartChunkerConfig;
  metrics: UploadMetrics;
  clientStorage: ClientStorage;
  generateId: IdGenerationService;
  storeFingerprintForResuming: boolean;
  openWebSocket: (uploadId: string) => WebSocketLike;
  closeWebSocket: (uploadId: string) => void;
  terminate: (uploadId: string) => Promise<void>;
  abortControllerFactory: AbortControllerFactory;
  platformService: PlatformService;
} & Callbacks): Promise<ParallelUploadResult | undefined> {
  if (!source.size || source.size === 0) {
    callbacks.onError?.(
      new UploadistaError({
        name: "UPLOAD_SIZE_NOT_SPECIFIED",
        message: "Parallel upload requires a known file size",
      }),
    );
    return;
  }

  // Calculate segments for parallel upload
  const segments = calculateSegments(
    source.size,
    parallelUploads,
    parallelChunkSize,
  );
  logger.log(`Starting parallel upload with ${segments.length} segments`);

  // Initialize parallel upload state
  const parallelState: ParallelUploadState = {
    segments: [],
    totalProgress: 0,
    completed: false,
    failed: false,
  };

  // Progress tracking for aggregation
  const segmentProgress = new Map<number, number>();
  const segmentTotals = new Map<number, number>();

  const updateTotalProgress = () => {
    const totalBytes = Array.from(segmentTotals.values()).reduce(
      (sum, size) => sum + size,
      0,
    );
    const progressBytes = Array.from(segmentProgress.values()).reduce(
      (sum, progress) => sum + progress,
      0,
    );
    parallelState.totalProgress =
      totalBytes > 0 ? progressBytes / totalBytes : 0;

    // Aggregate progress callback
    if (callbacks.onProgress && totalBytes > 0) {
      callbacks.onProgress(`parallel-upload`, progressBytes, totalBytes);
    }
  };

  try {
    // Create upload sessions for each segment
    const segmentUploads = await Promise.all(
      segments.map(async (segment) => {
        // Create a segmented source for this chunk
        const segmentSource: FileSource = {
          ...source,
          size: segment.endByte - segment.startByte,
          async slice(start, end) {
            // Adjust slice to segment boundaries
            const actualStart = segment.startByte + (start ?? 0);
            const actualEnd = Math.min(
              segment.startByte + (end ?? segment.endByte - segment.startByte),
              segment.endByte,
            );
            return await source.slice(actualStart, actualEnd);
          },
        };

        const createResult = await createUpload({
          fingerprint: `${fingerprint}-segment-${segment.segmentIndex}`,
          storageId,
          source: segmentSource,
          uploadLengthDeferred,
          platformService,
          metadata: {
            parallelUpload: "true",
            segmentIndex: segment.segmentIndex.toString(),
            totalSegments: segments.length.toString(),
            parentFingerprint: fingerprint,
          },
          checksumService,
          uploadistaApi,
          logger,
          clientStorage,
          generateId,
          storeFingerprintForResuming,
          openWebSocket,
          closeWebSocket,
          onSuccess: () => {},
          onError: (error) =>
            logger.log(
              `Segment ${segment.segmentIndex} creation error: ${error}`,
            ),
          onStart: (info) => {
            segmentTotals.set(segment.segmentIndex, info.size ?? 0);
            updateTotalProgress();
          },
        });

        if (!createResult) {
          throw new UploadistaError({
            name: "PARALLEL_SEGMENT_CREATION_FAILED",
            message: `Failed to create upload segment ${segment.segmentIndex}`,
          });
        }

        const parallelSegment: ParallelUploadSegment = {
          uploadId: createResult.uploadId,
          uploadIdStorageKey: createResult.uploadIdStorageKey,
          segmentIndex: segment.segmentIndex,
          startByte: segment.startByte,
          endByte: segment.endByte,
          offset: createResult.offset,
          abortController: abortControllerFactory.create(),
          retryTimeout: null,
        };

        return {
          segment: parallelSegment,
          source: segmentSource,
        };
      }),
    );

    // Store segments in state
    parallelState.segments = segmentUploads.map((upload) => upload.segment);

    // Notify start with combined upload info
    callbacks.onStart?.({
      uploadId: `parallel-${parallelState.segments.map((s) => s.uploadId).join(",")}`,
      size: source.size,
    });

    // Start parallel upload for each segment
    const uploadPromises = segmentUploads.map(
      async ({ segment, source: segmentSource }) => {
        try {
          await performUpload({
            uploadId: segment.uploadId,
            offset: segment.offset,
            source: segmentSource,
            uploadLengthDeferred,
            abortController: segment.abortController,
            retryDelays,
            smartChunker,
            uploadistaApi,
            platformService,
            logger,
            smartChunking,
            metrics,
            onProgress: (_, bytes, total) => {
              segmentProgress.set(segment.segmentIndex, bytes);
              if (total) segmentTotals.set(segment.segmentIndex, total);
              updateTotalProgress();
            },
            onChunkComplete: (chunkSize, bytesAccepted, bytesTotal) => {
              if (callbacks.onChunkComplete) {
                callbacks.onChunkComplete(chunkSize, bytesAccepted, bytesTotal);
              }
            },
            onSuccess: (_uploadFile) => {
              logger.log(
                `Segment ${segment.segmentIndex} completed successfully`,
              );
              // Mark this segment as completed
              segmentProgress.set(
                segment.segmentIndex,
                segmentTotals.get(segment.segmentIndex) ?? 0,
              );
              updateTotalProgress();
            },
            onShouldRetry: (error, retryAttempt) => {
              logger.log(
                `Segment ${segment.segmentIndex} retry attempt ${retryAttempt}: ${error}`,
              );
              return retryAttempt < (retryDelays?.length ?? 0);
            },
            onRetry: (timeout) => {
              segment.retryTimeout = timeout;
            },
            onError: (error) => {
              logger.log(`Segment ${segment.segmentIndex} failed: ${error}`);
              throw error;
            },
          });
        } catch (error) {
          logger.log(`Segment ${segment.segmentIndex} upload failed: ${error}`);
          throw new UploadistaError({
            name: "PARALLEL_SEGMENT_UPLOAD_FAILED",
            message: `Segment ${segment.segmentIndex} upload failed`,
            cause: error as Error,
          });
        }
      },
    );

    // Wait for all segments to complete
    await Promise.all(uploadPromises);

    // Mark as completed
    parallelState.completed = true;
    logger.log("All parallel upload segments completed successfully");

    // Call success callback with aggregated result
    if (callbacks.onSuccess) {
      const aggregatedResult: UploadFile = {
        id: `parallel-${parallelState.segments.map((s) => s.uploadId).join(",")}`,
        offset: source.size,
        size: source.size,
        storage: {
          id: storageId,
          type: "parallel-upload",
        },
        metadata: {
          parallelUpload: "true",
          totalSegments: segments.length.toString(),
          fingerprint,
        },
      };
      callbacks.onSuccess(aggregatedResult);
    }

    // Close all sources
    for (const upload of segmentUploads) {
      upload.source.close?.();
    }

    return {
      parallelState,
      abort: async () => {
        await abortParallelUpload(
          parallelState,
          logger,
          terminate,
          closeWebSocket,
          platformService,
        );
      },
    };
  } catch (error) {
    parallelState.failed = true;
    parallelState.error = error as Error;

    // Clean up any created segments
    await abortParallelUpload(
      parallelState,
      logger,
      terminate,
      closeWebSocket,
      platformService,
    );

    callbacks.onError?.(error as Error);
    throw error;
  }
}

/**
 * Abort a parallel upload by cleaning up all segments
 */
export async function abortParallelUpload(
  state: ParallelUploadState,
  logger: Logger,
  terminate: (uploadId: string) => Promise<void>,
  closeWebSocket: (uploadId: string) => void,
  platformService: PlatformService,
): Promise<void> {
  logger.log("Aborting parallel upload...");

  // Abort all segment controllers
  for (const segment of state.segments) {
    segment.abortController.abort();

    if (segment.retryTimeout) {
      platformService.clearTimeout(segment.retryTimeout);
      segment.retryTimeout = null;
    }

    // Attempt to terminate the upload on the server
    try {
      await terminate(segment.uploadId);
    } catch (error) {
      logger.log(
        `Failed to terminate segment ${segment.segmentIndex}: ${error}`,
      );
    }

    // Close websockets
    closeWebSocket(segment.uploadId);
  }

  state.completed = false;
  state.failed = true;
  logger.log("Parallel upload aborted");
}
