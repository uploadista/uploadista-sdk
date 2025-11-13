import type { UploadFile } from "@uploadista/core";

export interface UploadOptions {
  /**
   * Upload metadata to attach to the file
   */
  metadata?: Record<string, string>;

  /**
   * Whether to defer the upload size calculation
   */
  uploadLengthDeferred?: boolean;

  /**
   * Manual upload size override
   */
  uploadSize?: number;

  /**
   * Called when upload progress updates
   *
   * @param uploadId - The unique identifier for this upload
   * @param bytesUploaded - Number of bytes uploaded so far
   * @param totalBytes - Total bytes to upload, null if unknown/deferred
   */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when a chunk completes
   *
   * @param chunkSize - Size of the completed chunk in bytes
   * @param bytesAccepted - Total bytes accepted by server so far
   * @param bytesTotal - Total bytes to upload, null if unknown/deferred
   */
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;

  /**
   * Called when upload succeeds
   *
   * @param result - The uploaded file result
   */
  onSuccess?: (result: UploadFile) => void;

  /**
   * Called when upload fails
   *
   * @param error - The error that caused the failure
   */
  onError?: (error: Error) => void;

  /**
   * Called when upload is aborted
   */
  onAbort?: () => void;

  /**
   * Custom retry logic
   *
   * @param error - The error that triggered the retry check
   * @param retryAttempt - The current retry attempt number (0-indexed)
   * @returns true to retry, false to fail
   */
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}
