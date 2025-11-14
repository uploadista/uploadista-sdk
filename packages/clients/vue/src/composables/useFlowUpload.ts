import type { FlowUploadOptions } from "@uploadista/client-browser";
import {
  type FlowManager,
  type FlowUploadState,
  type FlowUploadStatus,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import { computed, onMounted, onUnmounted, readonly, ref } from "vue";
import { useFlowManagerContext } from "./useFlowManagerContext";

// Re-export types from core for convenience
export type { FlowUploadState, FlowUploadStatus };

export interface UseFlowUploadOptions<TOutput = UploadFile> {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadOptions<TOutput>["flowConfig"];

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
   * Called when the flow completes successfully (receives full flow outputs)
   * This is the recommended callback for multi-output flows
   * Format: { [outputNodeId]: result, ... }
   */
  onFlowComplete?: (outputs: Record<string, unknown>) => void;

  /**
   * Called when upload succeeds (legacy, single-output flows)
   * For single-output flows, receives the value from the specified outputNodeId
   * or the first output node if outputNodeId is not specified
   */
  onSuccess?: (result: TOutput) => void;

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

const initialState: FlowUploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  error: null,
  result: null,
  jobId: null,
  flowStarted: false,
  currentNodeName: null,
  currentNodeType: null,
  flowOutputs: null,
};

/**
 * Vue composable for uploading files through a flow.
 *
 * This composable provides a simple interface for uploading files through a flow.
 * The flow handles the upload process and can perform post-processing like
 * saving to storage, optimizing images, etc.
 *
 * Must be used within FlowManagerProvider (which must be within UploadistaProvider).
 * Flow events are automatically routed by the provider to the appropriate manager.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useFlowUpload } from '@uploadista/vue';
 *
 * const flowUpload = useFlowUpload({
 *   flowConfig: {
 *     flowId: "my-upload-flow",
 *     storageId: "my-storage",
 *   },
 *   onSuccess: (result) => {
 *     console.log("Upload complete:", result);
 *   },
 * });
 *
 * const handleFileChange = (event: Event) => {
 *   const file = (event.target as HTMLInputElement).files?.[0];
 *   if (file) flowUpload.upload(file);
 * };
 * </script>
 *
 * <template>
 *   <input type="file" @change="handleFileChange" />
 * </template>
 * ```
 */
export function useFlowUpload<TOutput = UploadFile>(
  options: UseFlowUploadOptions<TOutput>,
) {
  const { getManager, releaseManager } = useFlowManagerContext();
  const state = ref<FlowUploadState<TOutput>>(
    initialState as FlowUploadState<TOutput>,
  );
  let manager: FlowManager<unknown, TOutput> | null = null;

  // Store latest options in a ref to access in callbacks
  const optionsRef = ref(options);

  // Get or create manager from context when component mounts
  onMounted(() => {
    const flowId = options.flowConfig.flowId;

    // Create stable callback wrappers
    const stableCallbacks = {
      onStateChange: (newState: FlowUploadState<TOutput>) => {
        state.value = newState;
      },
      onProgress: (_uploadId: string, bytesUploaded: number, totalBytes: number | null) => {
        if (optionsRef.value.onProgress) {
          const progress = totalBytes
            ? Math.round((bytesUploaded / totalBytes) * 100)
            : 0;
          optionsRef.value.onProgress(progress, bytesUploaded, totalBytes);
        }
      },
      onChunkComplete: (chunkSize: number, bytesAccepted: number, bytesTotal: number | null) => {
        optionsRef.value.onChunkComplete?.(chunkSize, bytesAccepted, bytesTotal);
      },
      onFlowComplete: (outputs: TypedOutput[]) => {
        optionsRef.value.onFlowComplete?.(outputs as unknown as Record<string, unknown>);
      },
      onSuccess: (result: TOutput) => {
        optionsRef.value.onSuccess?.(result);
      },
      onError: (error: Error) => {
        optionsRef.value.onError?.(error);
      },
      onAbort: () => {
        optionsRef.value.onAbort?.();
      },
    };

    // Get manager from context
    manager = getManager(flowId, stableCallbacks, {
      flowConfig: options.flowConfig,
      onChunkComplete: options.onChunkComplete,
      onFlowComplete: options.onFlowComplete as ((outputs: TypedOutput[]) => void) | undefined,
      onSuccess: options.onSuccess,
      onError: options.onError,
      onAbort: options.onAbort,
      onShouldRetry: options.onShouldRetry,
    });
  });

  // Cleanup on unmount
  onUnmounted(() => {
    if (manager) {
      releaseManager(options.flowConfig.flowId);
      manager = null;
    }
  });

  const upload = async (file: File | Blob) => {
    await manager?.upload(file);
  };

  const abort = () => {
    manager?.abort();
  };

  const pause = () => {
    manager?.pause();
  };

  const reset = () => {
    manager?.reset();
  };

  return {
    state: readonly(state),
    upload,
    abort,
    pause,
    reset,
    // Derive computed values from state (reactive to state changes)
    isUploading: computed(
      () =>
        state.value.status === "uploading" ||
        state.value.status === "processing",
    ),
    isUploadingFile: computed(() => state.value.status === "uploading"),
    isProcessing: computed(() => state.value.status === "processing"),
  };
}
