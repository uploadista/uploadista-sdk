import type { UploadistaEvent } from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { UploadEventType } from "@uploadista/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FilePickResult } from "../types";
import { useUploadistaContext } from "./use-uploadista-context";

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
 *   const handlePickFile = async () => {
 *     const file = await fileSystemProvider.pickDocument();
 *     if (file) {
 *       await upload.upload(file);
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Button title="Pick File" onPress={handlePickFile} />
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
  const { client, fileSystemProvider, subscribeToEvents } =
    useUploadistaContext();
  const [state, setState] = useState<UploadState>(initialState);
  const abortControllerRef = useRef<{ abort: () => void } | null>(null);
  const lastFileRef = useRef<FilePickResult | null>(null);
  const currentUploadIdRef = useRef<string | null>(null);

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
    currentUploadIdRef.current = null;
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
    async (file: FilePickResult) => {
      // Reset any previous state
      setState({
        ...initialState,
        status: "uploading",
        totalBytes: file.size,
      });

      lastFileRef.current = file;

      try {
        // Read file content
        const fileContent = await fileSystemProvider.readFile(file.uri);

        // Create a Blob from the file content
        // Convert ArrayBuffer to Uint8Array for better compatibility
        const data =
          fileContent instanceof ArrayBuffer
            ? new Uint8Array(fileContent)
            : fileContent;
        // Note: Using any cast here because React Native Blob accepts BufferSource
        // but TypeScript's lib.dom.d.ts Blob type doesn't include it
        // biome-ignore lint/suspicious/noExplicitAny: React Native Blob accepts BufferSource
        const blob = new Blob([data as any], {
          type: file.mimeType || "application/octet-stream",
          // biome-ignore lint/suspicious/noExplicitAny: BlobPropertyBag type differs by platform
        } as any);

        // use the Blob (for React Native)
        const uploadInput = blob;

        // Start the upload using the client
        const uploadPromise = client.upload(uploadInput, {
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
        const controller = await uploadPromise;
        abortControllerRef.current = controller;
      } catch (error) {
        updateState({
          status: "error",
          error: error as Error,
        });

        options.onError?.(error as Error);
        abortControllerRef.current = null;
      }
    },
    [client, fileSystemProvider, options, updateState],
  );

  const retry = useCallback(() => {
    if (
      lastFileRef.current &&
      (state.status === "error" || state.status === "aborted")
    ) {
      upload(lastFileRef.current);
    }
  }, [upload, state.status]);

  // Subscribe to events from context (WebSocket events)
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event: UploadistaEvent) => {
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
    });

    return unsubscribe;
  }, [subscribeToEvents, options]);

  const isUploading = state.status === "uploading";
  const canRetry =
    (state.status === "error" || state.status === "aborted") &&
    lastFileRef.current !== null;

  return {
    state,
    upload,
    abort,
    reset,
    retry,
    isUploading,
    canRetry,
  };
}
