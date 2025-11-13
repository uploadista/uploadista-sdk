import type { BrowserUploadInput } from "@uploadista/client-browser";
import type { UploadMetrics, UploadOptions } from "@uploadista/client-core";
import {
  UploadManager,
  type UploadState,
  type UploadStatus,
} from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

// Re-export types from core for convenience
export type { UploadState, UploadStatus };

export interface UseUploadOptions {
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
   * @param bytesUploaded - Number of bytes uploaded
   * @param totalBytes - Total bytes to upload, null if unknown
   */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when a chunk completes
   *
   * @param chunkSize - Size of the completed chunk
   * @param bytesAccepted - Total bytes accepted so far
   * @param bytesTotal - Total bytes to upload, null if unknown
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
   * @param retryAttempt - The current retry attempt number
   * @returns true to retry, false to fail
   */
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}

export interface UseUploadReturn {
  /**
   * Current upload state
   */
  state: UploadState;

  /**
   * Start uploading a file
   */
  upload: (file: BrowserUploadInput) => void;

  /**
   * Abort the current upload
   */
  abort: () => void;

  /**
   * Reset the upload state to idle
   */
  reset: () => void;

  /**
   * Retry the last failed upload
   */
  retry: () => void;

  /**
   * Whether an upload is currently active
   */
  isUploading: boolean;

  /**
   * Whether the upload can be retried
   */
  canRetry: boolean;

  /**
   * Upload metrics and performance insights from the client
   */
  metrics: UploadMetrics;
}

/**
 * React hook for managing individual file uploads with full state management.
 * Provides upload progress tracking, error handling, abort functionality, and retry logic.
 *
 * Must be used within an UploadistaProvider.
 *
 * @param options - Upload configuration and event handlers
 * @returns Upload state and control methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const upload = useUpload({
 *     onSuccess: (result) => console.log('Upload complete:', result),
 *     onError: (error) => console.error('Upload failed:', error),
 *     onProgress: (uploadId, bytesUploaded, totalBytes) => {
 *       const progress = totalBytes ? Math.round((bytesUploaded / totalBytes) * 100) : 0;
 *       console.log(`Upload ${uploadId}: ${progress}% (${bytesUploaded}/${totalBytes} bytes)`);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         onChange={(e) => {
 *           const file = e.target.files?.[0];
 *           if (file) upload.upload(file);
 *         }}
 *       />
 *       {upload.isUploading && <div>Progress: {upload.state.progress}%</div>}
 *       {upload.state.error && <div>Error: {upload.state.error.message}</div>}
 *       {upload.canRetry && <button onClick={upload.retry}>Retry</button>}
 *       <button onClick={upload.abort} disabled={!upload.isUploading}>Abort</button>
 *     </div>
 *   );
 * }
 * ```
 */
const initialState: UploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  error: null,
  result: null,
};

export function useUpload(options: UseUploadOptions = {}): UseUploadReturn {
  const uploadClient = useUploadistaContext();
  const [state, setState] = useState<UploadState>(initialState);
  const managerRef = useRef<UploadManager<
    BrowserUploadInput,
    UploadOptions
  > | null>(null);

  // Create UploadManager instance
  useEffect(() => {
    managerRef.current = new UploadManager(
      (file: BrowserUploadInput, opts: UploadOptions) =>
        uploadClient.client.upload(file, opts),
      {
        onStateChange: setState,
        onProgress: options.onProgress,
        onChunkComplete: options.onChunkComplete,
        onSuccess: options.onSuccess,
        onError: options.onError,
        onAbort: options.onAbort,
      },
      {
        metadata: options.metadata,
        uploadLengthDeferred: options.uploadLengthDeferred,
        uploadSize: options.uploadSize,
        onShouldRetry: options.onShouldRetry,
      },
    );

    return () => {
      managerRef.current?.cleanup();
    };
  }, [uploadClient, options]);

  // Wrap manager methods with useCallback
  const upload = useCallback((file: BrowserUploadInput) => {
    managerRef.current?.upload(file);
  }, []);

  const abort = useCallback(() => {
    managerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    managerRef.current?.reset();
  }, []);

  const retry = useCallback(() => {
    managerRef.current?.retry();
  }, []);

  // Derive computed values from state
  const isUploading = state.status === "uploading";
  const canRetry = managerRef.current?.canRetry() ?? false;

  // Create metrics object that delegates to the upload client
  const metrics: UploadMetrics = {
    getInsights: () => uploadClient.client.getChunkingInsights(),
    exportMetrics: () => uploadClient.client.exportMetrics(),
    getNetworkMetrics: () => uploadClient.client.getNetworkMetrics(),
    getNetworkCondition: () => uploadClient.client.getNetworkCondition(),
    resetMetrics: () => uploadClient.client.resetMetrics(),
  };

  return {
    state,
    upload,
    abort,
    reset,
    retry,
    isUploading,
    canRetry,
    metrics,
  };
}
