import type { UploadistaApi } from "../client/uploadista-api";
import { UploadistaError } from "../error";
import type { Logger } from "../logger";
import type { AbortControllerLike } from "../services";
import type { FileSource } from "../services/file-reader-service";
import type { PlatformService } from "../services/platform-service";
import type { SmartChunker } from "../smart-chunker";
import type { UploadResponse } from "../types/upload-response";
import { inStatusCategory } from "./upload-utils";

export type OnProgress = (
  uploadId: string,
  bytesSent: number,
  bytesTotal: number | null,
) => void;

export type OnShouldRetry = (
  error: UploadistaError,
  retryAttempt: number,
) => boolean;

/**
 * uploadChunk reads a chunk from the source and sends it using the
 * supplied request object. It will not handle the response.
 */
export async function uploadChunk({
  uploadId,
  source,
  offset,
  uploadLengthDeferred,
  abortController,
  onProgress,
  smartChunker,
  uploadistaApi,
  logger,
}: {
  uploadId: string;
  source: FileSource;
  offset: number;
  uploadLengthDeferred: boolean | undefined;
  abortController: AbortControllerLike;
  onProgress?: OnProgress;
  smartChunker: SmartChunker;
  uploadistaApi: UploadistaApi;
  logger: Logger;
}): Promise<UploadResponse> {
  const start = offset ?? 0;
  const remainingBytes = source.size ? source.size - start : undefined;
  const chunkSizeDecision = smartChunker.getNextChunkSize(remainingBytes);
  const currentChunkSize = chunkSizeDecision.size;
  let end = start + currentChunkSize;

  // The specified chunkSize may be Infinity or the calcluated end position
  // may exceed the file's size. In both cases, we limit the end position to
  // the input's total size for simpler calculations and correctness.
  if (
    source.size &&
    (end === Number.POSITIVE_INFINITY || end > source.size) &&
    !uploadLengthDeferred
  ) {
    end = source.size;
  }

  const { value, size, done } = await source.slice(start, end);
  const sizeOfValue = size ?? 0;
  const chunkStartTime = Date.now();

  // If the upload length is deferred, the upload size was not specified during
  // upload creation. So, if the file reader is done reading, we know the total
  // upload size and can tell the tus server.
  if (uploadLengthDeferred && done) {
    source.size = offset + sizeOfValue;
  }

  // The specified uploadSize might not match the actual amount of data that a source
  // provides. In these cases, we cannot successfully complete the upload, so we
  // rather error out and let the user know. If not, tus-js-client will be stuck
  // in a loop of repeating empty PATCH requests.
  // See https://community.transloadit.com/t/how-to-abort-hanging-companion-uploads/16488/13
  const newSize = offset + sizeOfValue;
  if (!uploadLengthDeferred && done && newSize !== source.size) {
    throw new UploadistaError({
      name: "WRONG_UPLOAD_SIZE",
      message: `upload was configured with a size of ${size} bytes, but the source is done after ${newSize} bytes`,
    });
  }

  const result = await uploadistaApi.uploadChunk(uploadId, value, {
    onProgress: (bytes, total) => {
      onProgress?.(uploadId, bytes, total);
    },
    abortController,
  });

  // Record performance metrics
  const chunkDuration = Date.now() - chunkStartTime;
  const success = result.status >= 200 && result.status < 300;

  smartChunker.recordChunkResult(sizeOfValue, chunkDuration, success);

  logger.log(
    `Chunk upload ${success ? "succeeded" : "failed"}: ${sizeOfValue} bytes in ${chunkDuration}ms (${chunkSizeDecision.strategy} strategy)`,
  );

  return result;
}

/**
 * Checks whether or not it is ok to retry a request.
 * @param {UploadistaError} err the error returned from the last request
 * @param {number} retryAttempt the number of times the request has already been retried
 * @param {number[]} retryDelays configured retry delays
 * @param {OnShouldRetry} onShouldRetry optional custom retry logic
 */
export function shouldRetry(
  platformService: PlatformService,
  err: UploadistaError,
  retryAttempt: number,
  retryDelays?: number[],
  onShouldRetry?: OnShouldRetry,
): boolean {
  if (
    retryDelays == null ||
    retryAttempt >= retryDelays.length ||
    !err.isNetworkError()
  ) {
    return false;
  }

  if (onShouldRetry) {
    return onShouldRetry(err, retryAttempt);
  }

  return defaultOnShouldRetry(platformService, err);
}

/**
 * determines if the request should be retried. Will only retry if not a status 4xx except a 409 or 423
 * @param {UploadistaError} err
 * @returns {boolean}
 */
export function defaultOnShouldRetry(
  platformService: PlatformService,
  err: UploadistaError,
): boolean {
  const status = err.status ?? 0;
  return (
    (!inStatusCategory(status, 400) || status === 409 || status === 423) &&
    platformService.isOnline()
  );
}
