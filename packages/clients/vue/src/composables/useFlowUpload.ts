import type {
  FlowUploadOptions,
  UploadistaEvent,
} from "@uploadista/client-browser";
import {
  FlowManager,
  type FlowUploadState,
  type FlowUploadStatus,
  type InternalFlowUploadOptions,
} from "@uploadista/client-core";
import { EventType, type FlowEvent } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import { UploadEventType } from "@uploadista/core/types";
import { computed, onMounted, onUnmounted, readonly, ref } from "vue";
import { useUploadistaClient } from "./useUploadistaClient";

/**
 * Type guard to check if an event is a flow event
 */
function isFlowEvent(event: UploadistaEvent): event is FlowEvent {
  const flowEvent = event as FlowEvent;
  return (
    flowEvent.eventType === EventType.FlowStart ||
    flowEvent.eventType === EventType.FlowEnd ||
    flowEvent.eventType === EventType.FlowError ||
    flowEvent.eventType === EventType.NodeStart ||
    flowEvent.eventType === EventType.NodeEnd ||
    flowEvent.eventType === EventType.NodePause ||
    flowEvent.eventType === EventType.NodeResume ||
    flowEvent.eventType === EventType.NodeError
  );
}

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
 * Must be used within a component tree that has the Uploadista plugin installed.
 * Events are automatically wired up through the plugin.
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
  // Get client
  const client = useUploadistaClient();
  const state = ref<FlowUploadState<TOutput>>(
    initialState as FlowUploadState<TOutput>,
  );
  let manager: FlowManager<File | Blob, TOutput> | null = null;
  let unsubscribe: (() => void) | null = null;

  // Create FlowManager instance
  onMounted(() => {
    manager = new FlowManager(
      async (
        file: File | Blob,
        flowConfig: {
          flowId: string;
          storageId: string;
          outputNodeId?: string;
          metadata?: Record<string, string>;
        },
        internalOptions: InternalFlowUploadOptions,
      ) => {
        const result = await client.client.uploadWithFlow(file, flowConfig, {
          onJobStart: internalOptions.onJobStart,
          onProgress: internalOptions.onProgress,
          onChunkComplete: internalOptions.onChunkComplete,
          onSuccess: internalOptions.onSuccess,
          onError: internalOptions.onError,
          onShouldRetry: internalOptions.onShouldRetry,
        });
        // Return only abort and pause (ignore jobId and return value)
        return {
          abort: async () => {
            await result.abort();
          },
          pause: async () => {
            await result.pause();
            // Ignore the FlowJob return value
          },
        };
      },
      {
        onStateChange: (newState) => {
          state.value = newState;
        },
        onProgress: options.onProgress
          ? (_uploadId, bytesUploaded, totalBytes) => {
              const progress = totalBytes
                ? Math.round((bytesUploaded / totalBytes) * 100)
                : 0;
              options.onProgress?.(progress, bytesUploaded, totalBytes);
            }
          : undefined,
        onChunkComplete: options.onChunkComplete,
        onFlowComplete: options.onFlowComplete,
        onSuccess: options.onSuccess,
        onError: options.onError,
        onAbort: options.onAbort,
      },
      {
        flowConfig: options.flowConfig,
        onChunkComplete: options.onChunkComplete,
        onFlowComplete: options.onFlowComplete,
        onSuccess: options.onSuccess,
        onError: options.onError,
        onAbort: options.onAbort,
        onShouldRetry: options.onShouldRetry,
      },
    );

    // Subscribe to events and forward them to the manager
    unsubscribe = client.subscribeToEvents((event: UploadistaEvent) => {
      // Handle flow events
      if (isFlowEvent(event)) {
        manager?.handleFlowEvent(event);
        return;
      }

      // Handle upload progress events for this job's upload
      const uploadEvent = event as {
        type: string;
        data?: { id: string; progress: number; total: number };
        flow?: { jobId: string };
      };
      if (
        uploadEvent.type === UploadEventType.UPLOAD_PROGRESS &&
        uploadEvent.flow?.jobId === manager?.getJobId() &&
        uploadEvent.data
      ) {
        const { progress: bytesUploaded, total: totalBytes } = uploadEvent.data;

        manager?.handleUploadProgress(
          uploadEvent.data.id,
          bytesUploaded,
          totalBytes,
        );
      }
    });
  });

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribe?.();
    manager?.cleanup();
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
    isUploading: computed(() => manager?.isUploading() ?? false),
    isUploadingFile: computed(() => manager?.isUploadingFile() ?? false),
    isProcessing: computed(() => manager?.isProcessing() ?? false),
  };
}
