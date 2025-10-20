import type {
  BrowserUploadInput,
  ChunkMetrics,
  PerformanceInsights,
  UploadistaEvent,
  UploadSessionMetrics,
} from "@uploadista/client-browser";
import type { UploadFile } from "@uploadista/core/types";
import { UploadEventType } from "@uploadista/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

export type UploadStatus =
  | "idle"
  | "uploading"
  | "success"
  | "error"
  | "aborted";

export interface UploadState {
  status: UploadStatus;
  progress: number;
  bytesUploaded: number;
  totalBytes: number | null;
  error: Error | null;
  result: UploadFile | null;
}

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

export interface UploadMetrics {
  /**
   * Get performance insights from the upload client
   */
  getInsights: () => PerformanceInsights;

  /**
   * Export detailed metrics from the upload client
   */
  exportMetrics: () => {
    session: Partial<UploadSessionMetrics>;
    chunks: ChunkMetrics[];
    insights: PerformanceInsights;
  };

  /**
   * Get current network metrics
   */
  getNetworkMetrics: () => unknown;

  /**
   * Get current network condition
   */
  getNetworkCondition: () => unknown;

  /**
   * Reset all metrics
   */
  resetMetrics: () => void;
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

const initialState: UploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  error: null,
  result: null,
};

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
 *     onProgress: (progress) => console.log('Progress:', progress + '%'),
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
export function useUpload(options: UseUploadOptions = {}): UseUploadReturn {
  const uploadClient = useUploadistaContext();
  const [state, setState] = useState<UploadState>(initialState);
  const abortControllerRef = useRef<{ abort: () => void } | null>(null);
  const lastFileRef = useRef<BrowserUploadInput | null>(null);

  const updateState = useCallback((update: Partial<UploadState>) => {
    setState((prev) => ({ ...prev, ...update }));
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(initialState);
    lastFileRef.current = null;
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    updateState({
      status: "aborted",
    });

    options.onAbort?.();
  }, [options, updateState]);

  const upload = useCallback(
    (file: BrowserUploadInput) => {
      // Reset any previous state but keep the file reference for retries
      setState({
        ...initialState,
        status: "uploading",
        totalBytes: file instanceof File ? file.size : null,
      });

      lastFileRef.current = file;

      // Start the upload and handle the promise
      const uploadPromise = uploadClient.client.upload(file, {
        metadata: options.metadata,
        uploadLengthDeferred: options.uploadLengthDeferred,
        uploadSize: options.uploadSize,

        onStart: ({ uploadId }) => {
          currentUploadIdRef.current = uploadId;
        },

        onProgress: (
          _uploadId: string,
          bytesUploaded: number,
          totalBytes: number | null,
        ) => {
          const progress = totalBytes
            ? Math.round((bytesUploaded / totalBytes) * 100)
            : 0;

          updateState({
            progress,
            bytesUploaded,
            totalBytes,
          });

          options.onProgress?.(progress, bytesUploaded, totalBytes);
        },

        onChunkComplete: (
          chunkSize: number,
          bytesAccepted: number,
          bytesTotal: number | null,
        ) => {
          options.onChunkComplete?.(chunkSize, bytesAccepted, bytesTotal);
        },

        onSuccess: (result: UploadFile) => {
          updateState({
            status: "success",
            result,
            progress: 100,
            bytesUploaded: result.size || 0,
            totalBytes: result.size || null,
          });

          options.onSuccess?.(result);
          abortControllerRef.current = null;
        },

        onError: (error: Error) => {
          updateState({
            status: "error",
            error,
          });

          options.onError?.(error);
          abortControllerRef.current = null;
        },

        onShouldRetry: options.onShouldRetry,
      });

      // Handle the promise to get the abort controller
      uploadPromise
        .then((controller) => {
          abortControllerRef.current = controller;
        })
        .catch((error) => {
          updateState({
            status: "error",
            error: error as Error,
          });

          options.onError?.(error as Error);
          abortControllerRef.current = null;
        });
    },
    [uploadClient, options, updateState],
  );

  const retry = useCallback(() => {
    if (
      lastFileRef.current &&
      (state.status === "error" || state.status === "aborted")
    ) {
      upload(lastFileRef.current);
    }
  }, [upload, state.status]);

  // Store current upload ID for event matching
  const currentUploadIdRef = useRef<string | null>(null);

  // Subscribe to events from context (WebSocket events)
  useEffect(() => {
    const unsubscribe = uploadClient.subscribeToEvents(
      (event: UploadistaEvent) => {
        // Handle upload progress events
        const uploadEvent = event as {
          type: string;
          data?: { id: string; progress: number; total: number };
        };
        if (
          uploadEvent.type === UploadEventType.UPLOAD_PROGRESS &&
          uploadEvent.data
        ) {
          const {
            id: uploadId,
            progress: bytesUploaded,
            total: totalBytes,
          } = uploadEvent.data;

          if (uploadId !== currentUploadIdRef.current) {
            return;
          }

          // Update state for this upload
          // Note: We update for all uploads since we don't track upload IDs in single upload mode
          const progress = totalBytes
            ? Math.round((bytesUploaded / totalBytes) * 100)
            : 0;

          setState((prev) => {
            // Only update if we're currently uploading
            if (prev.status === "uploading") {
              return {
                ...prev,
                progress,
                bytesUploaded,
                totalBytes,
              };
            }
            return prev;
          });

          options.onProgress?.(progress, bytesUploaded, totalBytes);
        }
      },
    );

    return unsubscribe;
  }, [uploadClient, options]);

  const isUploading = state.status === "uploading";
  const canRetry =
    (state.status === "error" || state.status === "aborted") &&
    lastFileRef.current !== null;

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
