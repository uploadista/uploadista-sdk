import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import {
  computed,
  onMounted,
  onUnmounted,
  readonly,
  ref,
  shallowReadonly,
  type Ref,
} from "vue";
import { useFlowManagerContext } from "./useFlowManagerContext";
import { useUploadistaClient } from "./useUploadistaClient";

// Re-export types from core for convenience
export type { FlowUploadState, FlowUploadStatus, InputExecutionState };

/**
 * Input metadata discovered from the flow
 */
export interface FlowInputMetadata {
  /** Input node ID */
  nodeId: string;
  /** Human-readable node name */
  nodeName: string;
  /** Node description explaining what input is needed */
  nodeDescription: string;
  /** Input type ID from inputTypeRegistry - describes how clients interact with this node */
  inputTypeId?: string;
  /** Whether this input is required */
  required: boolean;
}

/**
 * Return value from the useFlow composable with upload control methods and state.
 *
 * @property state - Complete flow upload state with progress and outputs
 * @property inputMetadata - Metadata about discovered input nodes (null until discovered)
 * @property inputStates - Per-input execution state for multi-input flows
 * @property inputs - Current input values set via setInput()
 * @property setInput - Set an input value for a specific node (for progressive provision)
 * @property execute - Execute the flow with current inputs (auto-detects types)
 * @property upload - Convenience method for single-file upload (same as execute with one file input)
 * @property abort - Cancel the current upload and flow execution
 * @property pause - Pause the current upload
 * @property reset - Reset state to idle (clears all data)
 * @property isUploading - True when upload or processing is active
 * @property isUploadingFile - True only during file upload phase
 * @property isProcessing - True only during flow processing phase
 * @property isDiscoveringInputs - True while discovering flow inputs
 */
export interface UseFlowReturn {
  /**
   * Current upload state
   */
  state: Readonly<Ref<FlowUploadState>>;

  /**
   * Discovered input nodes metadata (null until discovery completes)
   */
  inputMetadata: Readonly<Ref<FlowInputMetadata[] | null>>;

  /**
   * Per-input execution state for multi-input flows
   */
  inputStates: Readonly<Ref<ReadonlyMap<string, InputExecutionState>>>;

  /**
   * Current inputs set via setInput()
   */
  inputs: Readonly<Ref<Record<string, unknown>>>;

  /**
   * Set an input value for a specific node.
   * For progressive input provision before calling execute().
   *
   * @param nodeId - The input node ID
   * @param value - The input value (File, URL string, or structured data)
   */
  setInput: (nodeId: string, value: unknown) => void;

  /**
   * Execute the flow with current inputs.
   * Automatically detects input types and routes appropriately.
   * For single input, uses standard upload path.
   * For multiple inputs, requires multiInputUploadFn.
   */
  execute: () => Promise<void>;

  /**
   * Upload a single file through the flow (convenience method).
   * Equivalent to setInput(firstNodeId, file) + execute().
   *
   * @param file - File or Blob to upload
   */
  upload: (file: File | Blob) => Promise<void>;

  /**
   * Abort the current upload
   */
  abort: () => void;

  /**
   * Pause the current upload
   */
  pause: () => void;

  /**
   * Reset the upload state and clear all inputs
   */
  reset: () => void;

  /**
   * Whether an upload or flow execution is in progress (uploading OR processing)
   */
  isUploading: Readonly<Ref<boolean>>;

  /**
   * Whether the file is currently being uploaded (chunks being sent)
   */
  isUploadingFile: Readonly<Ref<boolean>>;

  /**
   * Whether the flow is currently processing (after upload completes)
   */
  isProcessing: Readonly<Ref<boolean>>;

  /**
   * Whether the hook is discovering flow inputs
   */
  isDiscoveringInputs: Readonly<Ref<boolean>>;
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
 * Vue composable for executing flows with single or multiple inputs.
 * Automatically discovers input nodes and detects input types (File, URL, structured data).
 * Supports progressive input provision via setInput() and execute().
 *
 * This is the unified flow composable that replaces useFlowUpload for advanced use cases.
 * It provides:
 * - Auto-discovery of flow input nodes
 * - Automatic input type detection (file -> upload, string -> URL, object -> data)
 * - Progressive input provision via setInput()
 * - Multi-input support with parallel coordination
 * - Per-input state tracking
 *
 * Must be used within FlowManagerProvider (which must be within UploadistaProvider).
 * Flow events are automatically routed by the provider to the appropriate manager.
 *
 * @param options - Flow upload configuration including flow ID and event handlers
 * @returns Flow upload state and control methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useFlow } from '@uploadista/vue';
 *
 * // Single file upload (simple case)
 * const flow = useFlow({
 *   flowConfig: {
 *     flowId: "image-optimization",
 *     storageId: "s3-images",
 *   },
 *   onSuccess: (outputs) => {
 *     console.log("Flow outputs:", outputs);
 *   },
 * });
 *
 * const handleFileChange = (event: Event) => {
 *   const file = (event.target as HTMLInputElement).files?.[0];
 *   if (file) flow.upload(file);
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <input type="file" @change="handleFileChange" />
 *     <div v-if="flow.isUploading.value">Progress: {{ flow.state.value.progress }}%</div>
 *   </div>
 * </template>
 * ```
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useFlow } from '@uploadista/vue';
 *
 * // Multi-input with progressive provision
 * const flow = useFlow({
 *   flowConfig: {
 *     flowId: "multi-source-processing",
 *     storageId: "default",
 *   },
 * });
 *
 * const handleInputChange = (nodeId: string, event: Event) => {
 *   const target = event.target as HTMLInputElement;
 *   if (target.type === 'file') {
 *     const file = target.files?.[0];
 *     if (file) flow.setInput(nodeId, file);
 *   } else {
 *     flow.setInput(nodeId, target.value);
 *   }
 * };
 * </script>
 *
 * <template>
 *   <div v-if="flow.inputMetadata.value">
 *     <div v-for="input in flow.inputMetadata.value" :key="input.nodeId">
 *       <label>{{ input.nodeName }}</label>
 *       <input
 *         v-if="input.inputTypeId === 'streaming-input-v1'"
 *         type="file"
 *         @change="(e) => handleInputChange(input.nodeId, e)"
 *       />
 *       <input
 *         v-else
 *         type="url"
 *         @change="(e) => handleInputChange(input.nodeId, e)"
 *       />
 *     </div>
 *     <button @click="flow.execute" :disabled="flow.isUploading.value">
 *       Execute Flow
 *     </button>
 *   </div>
 * </template>
 * ```
 *
 * @see {@link useFlowUpload} for a simpler file-only upload composable
 */
export function useFlow(options: FlowUploadOptions): UseFlowReturn {
  const { client } = useUploadistaClient();
  const { getManager, releaseManager } = useFlowManagerContext();

  const state = ref<FlowUploadState>(initialState);
  const inputMetadata = ref<FlowInputMetadata[] | null>(null);
  const isDiscoveringInputs = ref(false);
  const inputs = ref<Record<string, unknown>>({});
  const inputStates = ref<ReadonlyMap<string, InputExecutionState>>(new Map());

  let manager: FlowManager<unknown> | null = null;

  // Store latest options in a ref to access in callbacks
  const optionsRef = ref(options);
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Auto-discover flow inputs on mount
  onMounted(async () => {
    // Discover inputs
    isDiscoveringInputs.value = true;
    try {
      const { flow } = await client.getFlow(options.flowConfig.flowId);

      // Find all input nodes
      const inputNodes = flow.nodes.filter((node) => node.type === "input");

      const metadata: FlowInputMetadata[] = inputNodes.map((node) => ({
        nodeId: node.id,
        nodeName: node.name,
        nodeDescription: node.description,
        inputTypeId: node.inputTypeId,
        // TODO: Add required field to node schema to determine if input is required
        required: true,
      }));

      inputMetadata.value = metadata;
    } catch (error) {
      console.error("Failed to discover flow inputs:", error);
    } finally {
      isDiscoveringInputs.value = false;
    }

    // Create stable callback wrappers
    const stableCallbacks = {
      onStateChange: (newState: FlowUploadState) => {
        state.value = newState;
      },
      onProgress: (
        uploadId: string,
        bytesUploaded: number,
        totalBytes: number | null,
      ) => {
        optionsRef.value.onProgress?.(uploadId, bytesUploaded, totalBytes);
      },
      onChunkComplete: (
        chunkSize: number,
        bytesAccepted: number,
        bytesTotal: number | null,
      ) => {
        optionsRef.value.onChunkComplete?.(chunkSize, bytesAccepted, bytesTotal);
      },
      onFlowComplete: (outputs: TypedOutput[]) => {
        optionsRef.value.onFlowComplete?.(outputs);
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
    manager = getManager(options.flowConfig.flowId, stableCallbacks, options);

    // Set up interval to poll input states for multi-input flows
    pollInterval = setInterval(() => {
      if (manager) {
        const states = manager.getInputStates();
        if (states.size > 0) {
          inputStates.value = new Map(states);
        }
      }
    }, 100); // Poll every 100ms
  });

  // Cleanup on unmount
  onUnmounted(() => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    if (manager) {
      releaseManager(options.flowConfig.flowId);
      manager = null;
    }
  });

  // Set an input value
  const setInput = (nodeId: string, value: unknown) => {
    inputs.value = { ...inputs.value, [nodeId]: value };
  };

  // Execute flow with current inputs
  const execute = async () => {
    if (!manager) {
      throw new Error("FlowManager not initialized");
    }

    if (Object.keys(inputs.value).length === 0) {
      throw new Error(
        "No inputs provided. Use setInput() to provide inputs before calling execute()",
      );
    }

    await manager.executeFlow(inputs.value);
  };

  // Convenience method for single file upload
  const upload = async (file: File | Blob) => {
    if (!manager) {
      throw new Error("FlowManager not initialized");
    }

    // If we have input metadata, use the first input node
    // Otherwise, let the manager discover it
    if (inputMetadata.value && inputMetadata.value.length > 0) {
      const firstInputNode = inputMetadata.value[0];
      if (!firstInputNode) {
        throw new Error("No input nodes found");
      }
      inputs.value = { [firstInputNode.nodeId]: file };
      await manager.executeFlow({ [firstInputNode.nodeId]: file });
    } else {
      // Fall back to direct upload (manager will handle discovery)
      await manager.upload(file);
    }
  };

  const abort = () => {
    manager?.abort();
  };

  const pause = () => {
    manager?.pause();
  };

  const reset = () => {
    manager?.reset();
    inputs.value = {};
    inputStates.value = new Map();
  };

  // Derive computed values from state
  const isUploading = computed(
    () =>
      state.value.status === "uploading" || state.value.status === "processing",
  );
  const isUploadingFile = computed(() => state.value.status === "uploading");
  const isProcessing = computed(() => state.value.status === "processing");

  return {
    state: shallowReadonly(state),
    inputMetadata: shallowReadonly(inputMetadata),
    inputStates: shallowReadonly(inputStates),
    inputs: shallowReadonly(inputs),
    setInput,
    execute,
    upload,
    abort,
    pause,
    reset,
    isUploading: readonly(isUploading),
    isUploadingFile: readonly(isUploadingFile),
    isProcessing: readonly(isProcessing),
    isDiscoveringInputs: readonly(isDiscoveringInputs),
  };
}
