import type {
  UploadMetrics,
  UploadOptions,
} from "@uploadista/client-core";
import {
  UploadManager,
  type UploadState,
  type UploadStatus,
} from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FilePickResult } from "../types";
import { createBlobFromBuffer } from "../types/platform-types";
import { useUploadistaContext } from "./use-uploadista-context";

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

export interface UseUploadReturn {
  /**
   * Current upload state
   */
  state: UploadState;

  /**
   * Start uploading a file from a file pick result
   */
  upload: (file: FilePickResult) => Promise<void>;

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
 * React Native hook for managing individual file uploads with full state management.
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
 *   const handleFilePick = async () => {
 *     const file = await pickFile();
 *     if (file) await upload.upload(file);
 *   };
 *
 *   return (
 *     <View>
 *       <Button title="Pick File" onPress={handleFilePick} />
 *       {upload.isUploading && <Text>Progress: {upload.state.progress}%</Text>}
 *       {upload.state.error && <Text>Error: {upload.state.error.message}</Text>}
 *       {upload.canRetry && <Button title="Retry" onPress={upload.retry} />}
 *       <Button title="Abort" onPress={upload.abort} disabled={!upload.isUploading} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useUpload(options: UseUploadOptions = {}): UseUploadReturn {
  const { client, fileSystemProvider } = useUploadistaContext();
  const [state, setState] = useState<UploadState>(initialState);
  const managerRef = useRef<UploadManager | null>(null);
  const lastFileRef = useRef<FilePickResult | null>(null);

  // Create UploadManager instance
  useEffect(() => {
    // Create upload function that handles React Native file reading
    const uploadFn = async (input: unknown, opts: UploadOptions) => {
      const file = input as FilePickResult;

      // Read file content from React Native file system
      const fileContent = await fileSystemProvider.readFile(file.data.uri);

      // Create a Blob from the file content using platform-aware utility
      const blob = createBlobFromBuffer(fileContent, {
        type: file.data.mimeType || "application/octet-stream",
      });

      // Upload the Blob
      return client.upload(blob, opts);
    };

    managerRef.current = new UploadManager(
      uploadFn,
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
  }, [client, fileSystemProvider, options]);

  // Upload function - stores file reference for retry
  const upload = useCallback(async (file: FilePickResult) => {
    lastFileRef.current = file;
    await managerRef.current?.upload(file);
  }, []);

  // Abort function
  const abort = useCallback(() => {
    managerRef.current?.abort();
  }, []);

  // Reset function
  const reset = useCallback(() => {
    managerRef.current?.reset();
    lastFileRef.current = null;
  }, []);

  // Retry function
  const retry = useCallback(() => {
    if (lastFileRef.current && managerRef.current?.canRetry()) {
      managerRef.current.retry();
    }
  }, []);

  // Derive computed values from state
  const isUploading = state.status === "uploading";
  const canRetry = managerRef.current?.canRetry() ?? false;

  // Create metrics object that delegates to the upload client
  const metrics: UploadMetrics = {
    getInsights: () => client.getChunkingInsights(),
    exportMetrics: () => client.exportMetrics(),
    getNetworkMetrics: () => client.getNetworkMetrics(),
    getNetworkCondition: () => client.getNetworkCondition(),
    resetMetrics: () => client.resetMetrics(),
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
