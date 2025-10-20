import type {
  FlowUploadConfig,
  UploadistaEvent,
} from "@uploadista/client-browser";
import { EventType, type FlowEvent } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import { UploadEventType } from "@uploadista/core/types";
import { computed, onUnmounted, readonly, ref } from "vue";
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

export type FlowUploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "success"
  | "error"
  | "aborted";

export interface FlowUploadState<TOutput = UploadFile> {
  status: FlowUploadStatus;
  progress: number;
  bytesUploaded: number;
  totalBytes: number | null;
  error: Error | null;
  result: TOutput | null;
  jobId: string | null;
  // Flow execution tracking
  flowStarted: boolean;
  currentNodeName: string | null;
  currentNodeType: string | null;
  // Full flow outputs (all output nodes)
  flowOutputs: Record<string, unknown> | null;
}

export interface UseFlowUploadOptions<TOutput = UploadFile> {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

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
  // Get client and event subscription
  const client = useUploadistaClient();
  const state = ref<FlowUploadState<TOutput>>(
    initialState as FlowUploadState<TOutput>,
  );
  const abortFn = ref<(() => void) | null>(null);
  const jobId = ref<string | null>(null);

  // Handle flow events
  const handleFlowEvent = (event: FlowEvent) => {
    console.log("handleFlowEvent", event);
    // Only handle events for the current job
    if (!jobId.value || event.jobId !== jobId.value) {
      console.log("handleFlowEvent - jobId mismatch", event.jobId, jobId.value);
      return;
    }

    switch (event.eventType) {
      case EventType.FlowStart:
        state.value = {
          ...state.value,
          flowStarted: true,
          status: "processing",
        };
        break;

      case EventType.NodeStart:
        state.value = {
          ...state.value,
          status: "processing",
          currentNodeName: event.nodeName,
          currentNodeType: event.nodeType,
        };
        break;

      case EventType.NodePause:
        // When input node pauses, it's waiting for upload - switch to uploading state
        state.value = {
          ...state.value,
          status: "uploading",
          currentNodeName: event.nodeName,
        };
        break;

      case EventType.NodeResume:
        // When node resumes, upload is complete - switch to processing state
        state.value = {
          ...state.value,
          status: "processing",
          currentNodeName: event.nodeName,
          currentNodeType: event.nodeType,
        };
        break;

      case EventType.NodeEnd:
        state.value = {
          ...state.value,
          status:
            state.value.status === "uploading"
              ? "processing"
              : state.value.status,
          currentNodeName: null,
          currentNodeType: null,
        };
        break;

      case EventType.FlowEnd: {
        // Get flow outputs from the event result
        const flowOutputs = (event.result as Record<string, unknown>) || null;

        // Call onFlowComplete with full outputs
        if (flowOutputs && options.onFlowComplete) {
          options.onFlowComplete(flowOutputs);
        }

        // Extract single output for onSuccess callback
        let extractedOutput: TOutput | null = null;
        if (flowOutputs) {
          if (
            options.flowConfig.outputNodeId &&
            options.flowConfig.outputNodeId in flowOutputs
          ) {
            // Use specified output node
            extractedOutput = flowOutputs[
              options.flowConfig.outputNodeId
            ] as TOutput;
          } else {
            // Use first output node
            const firstOutputValue = Object.values(flowOutputs)[0];
            extractedOutput = firstOutputValue as TOutput;
          }
        }

        // Call onSuccess with extracted output
        if (extractedOutput && options.onSuccess) {
          options.onSuccess(extractedOutput);
        }

        state.value = {
          ...state.value,
          status: "success",
          currentNodeName: null,
          currentNodeType: null,
          result: extractedOutput,
          flowOutputs,
        };
        break;
      }

      case EventType.FlowError:
        state.value = {
          ...state.value,
          status: "error",
          error: new Error(event.error),
        };
        options.onError?.(new Error(event.error));
        break;

      case EventType.NodeError:
        state.value = {
          ...state.value,
          status: "error",
          error: new Error(event.error),
        };
        options.onError?.(new Error(event.error));
        break;
    }
  };

  // Automatically subscribe to flow events and upload events
  const unsubscribe = client.subscribeToEvents((event: UploadistaEvent) => {
    console.log("subscribeToEvents", event);
    // Handle flow events
    if (isFlowEvent(event)) {
      handleFlowEvent(event);
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
      uploadEvent.flow?.jobId === jobId.value &&
      uploadEvent.data
    ) {
      const { progress: bytesUploaded, total: totalBytes } = uploadEvent.data;
      const progress = totalBytes
        ? Math.round((bytesUploaded / totalBytes) * 100)
        : 0;

      state.value = {
        ...state.value,
        progress,
        bytesUploaded,
        totalBytes,
      };
    }
  });

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribe();
  });

  const abort = () => {
    if (abortFn.value) {
      abortFn.value();
      abortFn.value = null;

      state.value = {
        ...state.value,
        status: "aborted",
      };

      options.onAbort?.();
    }
  };

  const upload = async (file: File | Blob) => {
    jobId.value = null;

    state.value = {
      ...initialState,
      status: "uploading",
      totalBytes: file.size,
    } as FlowUploadState<TOutput>;

    try {
      const { abort: _abortFn } = await client.client.uploadWithFlow(
        file,
        options.flowConfig,
        {
          onJobStart: (id: string) => {
            jobId.value = id;
            state.value = { ...state.value, jobId: id };
          },
          onProgress: (
            _uploadId: string,
            bytesUploaded: number,
            totalBytes: number | null,
          ) => {
            const progress = totalBytes
              ? Math.round((bytesUploaded / totalBytes) * 100)
              : 0;

            state.value = {
              ...state.value,
              progress,
              bytesUploaded,
              totalBytes,
            };

            options.onProgress?.(progress, bytesUploaded, totalBytes);
          },
          onChunkComplete: options.onChunkComplete,
          onSuccess: (_result: UploadFile) => {
            // Upload phase is complete, now waiting for flow execution
            // Status transition from "uploading" to "processing" is handled by NodeResume event
            state.value = {
              ...state.value,
              progress: 100,
            };
            // Don't call onSuccess here - wait for FlowEnd event
          },
          onError: (error: Error) => {
            state.value = {
              ...state.value,
              status: "error",
              error,
            };

            options.onError?.(error);
          },
          onShouldRetry: options.onShouldRetry,
        },
      );

      abortFn.value = _abortFn;
    } catch (error) {
      state.value = {
        ...state.value,
        status: "error",
        error: error as Error,
      };

      options.onError?.(error as Error);
    }
  };

  const reset = () => {
    state.value = initialState as FlowUploadState<TOutput>;
    abortFn.value = null;
    jobId.value = null;
  };

  return {
    state: readonly(state),
    upload,
    abort,
    reset,
    isUploading: computed(
      () =>
        state.value.status === "uploading" ||
        state.value.status === "processing",
    ),
    isUploadingFile: computed(() => state.value.status === "uploading"),
    isProcessing: computed(() => state.value.status === "processing"),
  };
}
