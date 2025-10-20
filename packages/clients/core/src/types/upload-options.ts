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
   */
  onProgress?: (
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when a chunk completes
   */
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;

  /**
   * Called when upload succeeds
   */
  onSuccess?: (result: UploadFile) => void;

  /**
   * Called when upload fails
   */
  onError?: (error: Error) => void;

  /**
   * Called when upload is aborted
   */
  onAbort?: () => void;

  /**
   * Custom retry logic
   */
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}
