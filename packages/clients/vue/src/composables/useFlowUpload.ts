import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { computed, onMounted, onUnmounted, readonly, ref } from "vue";
import { useFlowManagerContext } from "./useFlowManagerContext";

// Re-export types from core for convenience
export type { FlowUploadState, FlowUploadStatus };

export interface UseFlowUploadOptions {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadOptions["flowConfig"];

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
   * Called when upload succeeds (receives typed outputs from all output nodes)
   * Each output includes nodeId, optional nodeType, data, and timestamp.
   *
   * @param outputs - Array of typed outputs from all output nodes
   */
  onSuccess?: (outputs: TypedOutput[]) => void;

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
 *   onSuccess: (outputs) => {
 *     console.log("Flow outputs:", outputs);
 *     for (const output of outputs) {
 *       console.log(`${output.nodeId}:`, output.data);
 *     }
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
export function useFlowUpload(options: UseFlowUploadOptions) {
  const { getManager, releaseManager } = useFlowManagerContext();
  const state = ref<FlowUploadState>(initialState);
  let manager: FlowManager<unknown> | null = null;

  // Store latest options in a ref to access in callbacks
  const optionsRef = ref(options);

  // Get or create manager from context when component mounts
  onMounted(() => {
    const flowId = options.flowConfig.flowId;

    // Create stable callback wrappers
    const stableCallbacks = {
      onStateChange: (newState: FlowUploadState) => {
        state.value = newState;
      },
      onProgress: (
        _uploadId: string,
        bytesUploaded: number,
        totalBytes: number | null,
      ) => {
        if (optionsRef.value.onProgress) {
          const progress = totalBytes
            ? Math.round((bytesUploaded / totalBytes) * 100)
            : 0;
          optionsRef.value.onProgress(progress, bytesUploaded, totalBytes);
        }
      },
      onChunkComplete: (
        chunkSize: number,
        bytesAccepted: number,
        bytesTotal: number | null,
      ) => {
        optionsRef.value.onChunkComplete?.(
          chunkSize,
          bytesAccepted,
          bytesTotal,
        );
      },
      onFlowComplete: (outputs: TypedOutput[]) => {
        optionsRef.value.onFlowComplete?.(
          outputs as unknown as Record<string, unknown>,
        );
      },
      onSuccess: (outputs: TypedOutput[]) => {
        optionsRef.value.onSuccess?.(outputs);
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
      onFlowComplete: options.onFlowComplete as
        | ((outputs: TypedOutput[]) => void)
        | undefined,
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
