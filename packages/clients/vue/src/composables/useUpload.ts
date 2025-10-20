import type {
  UploadistaEvent,
  UploadOptions,
} from "@uploadista/client-browser";
import type { UploadFile } from "@uploadista/core/types";
import { UploadEventType } from "@uploadista/core/types";
import { computed, onUnmounted, readonly, ref } from "vue";
import { useUploadistaClient } from "./useUploadistaClient";

// Re-export types for convenience
export type UploadInput = File | Blob;
export type ChunkMetrics = any;
export type PerformanceInsights = any;
export type UploadSessionMetrics = any;

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

const initialState: UploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  error: null,
  result: null,
};

/**
 * Vue composable for managing individual file uploads with full state management.
 * Provides upload progress tracking, error handling, abort functionality, and retry logic.
 *
 * Must be used within a component tree that has the Uploadista plugin installed.
 *
 * @param options - Upload configuration and event handlers
 * @returns Upload state and control methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUpload } from '@uploadista/vue';
 *
 * const upload = useUpload({
 *   onSuccess: (result) => console.log('Upload complete:', result),
 *   onError: (error) => console.error('Upload failed:', error),
 *   onProgress: (progress) => console.log('Progress:', progress + '%'),
 * });
 *
 * const handleFileChange = (event: Event) => {
 *   const file = (event.target as HTMLInputElement).files?.[0];
 *   if (file) upload.upload(file);
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <input type="file" @change="handleFileChange" />
 *     <div v-if="upload.isUploading">Progress: {{ upload.state.progress }}%</div>
 *     <div v-if="upload.state.error">Error: {{ upload.state.error.message }}</div>
 *     <button v-if="upload.canRetry" @click="upload.retry">Retry</button>
 *     <button @click="upload.abort" :disabled="!upload.isUploading">Abort</button>
 *   </div>
 * </template>
 * ```
 */
export function useUpload(options: UploadOptions = {}) {
  const uploadistaClient = useUploadistaClient();
  const state = ref<UploadState>({ ...initialState });
  const abortController = ref<{ abort: () => void } | null>(null);
  const lastFile = ref<UploadInput | null>(null);

  const updateState = (update: Partial<UploadState>) => {
    state.value = { ...state.value, ...update };
  };

  const reset = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }
    state.value = { ...initialState };
    lastFile.value = null;
  };

  const abort = () => {
    if (abortController.value) {
      abortController.value.abort();
      abortController.value = null;
    }

    updateState({
      status: "aborted",
    });

    options.onAbort?.();
  };

  const upload = (file: UploadInput) => {
    // Reset any previous state but keep the file reference for retries
    state.value = {
      ...initialState,
      status: "uploading",
      totalBytes: file instanceof File ? file.size : null,
    };

    lastFile.value = file;

    // Start the upload and handle the promise
    const uploadPromise = uploadistaClient.client.upload(file, {
      metadata: options.metadata,
      uploadLengthDeferred: options.uploadLengthDeferred,
      uploadSize: options.uploadSize,

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
        abortController.value = null;
      },

      onError: (error: Error) => {
        updateState({
          status: "error",
          error,
        });

        options.onError?.(error);
        abortController.value = null;
      },

      onShouldRetry: options.onShouldRetry,
    });

    // Handle the promise to get the abort controller
    uploadPromise
      .then((controller) => {
        abortController.value = controller;
      })
      .catch((error) => {
        updateState({
          status: "error",
          error: error as Error,
        });

        options.onError?.(error as Error);
        abortController.value = null;
      });
  };

  const retry = () => {
    if (
      lastFile.value &&
      (state.value.status === "error" || state.value.status === "aborted")
    ) {
      upload(lastFile.value);
    }
  };

  // Subscribe to events from context (WebSocket events)
  const unsubscribe = uploadistaClient.subscribeToEvents(
    (event: UploadistaEvent) => {
      console.log("useUpload - subscribeToEvents", event);
      // Handle upload progress events
      const uploadEvent = event as {
        type: string;
        data?: { id: string; progress: number; total: number };
      };
      if (
        uploadEvent.type === UploadEventType.UPLOAD_PROGRESS &&
        uploadEvent.data
      ) {
        const { progress: bytesUploaded, total: totalBytes } = uploadEvent.data;

        // Update state for this upload
        // Note: We update for all uploads since we don't track upload IDs in single upload mode
        const progress = totalBytes
          ? Math.round((bytesUploaded / totalBytes) * 100)
          : 0;

        // Only update if we're currently uploading
        if (state.value.status === "uploading") {
          updateState({
            progress,
            bytesUploaded,
            totalBytes,
          });

          options.onProgress?.(progress, bytesUploaded, totalBytes);
        }
      }
    },
  );

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribe();
  });

  const isUploading = computed(() => state.value.status === "uploading");
  const canRetry = computed(
    () =>
      (state.value.status === "error" || state.value.status === "aborted") &&
      lastFile.value !== null,
  );

  // Create metrics object that delegates to the upload client
  const metrics: UploadMetrics = {
    getInsights: () => uploadistaClient.client.getChunkingInsights(),
    exportMetrics: () => uploadistaClient.client.exportMetrics(),
    getNetworkMetrics: () => uploadistaClient.client.getNetworkMetrics(),
    getNetworkCondition: () => uploadistaClient.client.getNetworkCondition(),
    resetMetrics: () => uploadistaClient.client.resetMetrics(),
  };

  return {
    state: readonly(state),
    upload,
    abort,
    reset,
    retry,
    isUploading,
    canRetry,
    metrics,
  };
}
