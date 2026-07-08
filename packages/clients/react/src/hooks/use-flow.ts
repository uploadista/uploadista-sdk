import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { UploadEventType } from "@uploadista/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";
import { useFlowManagerContext } from "../contexts/flow-manager-context";
import { isUploadEvent } from "./event-utils";

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
 * Return value from the useFlow hook with upload control methods and state.
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
  state: FlowUploadState;

  /**
   * Discovered input nodes metadata (null until discovery completes)
   */
  inputMetadata: FlowInputMetadata[] | null;

  /**
   * Per-input execution state for multi-input flows
   */
  inputStates: ReadonlyMap<string, InputExecutionState>;

  /**
   * Current inputs set via setInput()
   */
  inputs: Record<string, unknown>;

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
  abort: () => Promise<void>;

  /**
   * Pause the current upload
   */
  pause: () => Promise<void>;

  /**
   * Resume a paused upload
   */
  resume: () => Promise<void>;

  /**
   * Reset the upload state and clear all inputs
   */
  reset: () => void;

  /**
   * Whether an upload or flow execution is in progress (uploading OR processing)
   */
  isUploading: boolean;

  /**
   * Whether the file is currently being uploaded (chunks being sent)
   */
  isUploadingFile: boolean;

  /**
   * Whether the flow is currently processing (after upload completes)
   */
  isProcessing: boolean;

  /**
   * Whether the hook is discovering flow inputs
   */
  isDiscoveringInputs: boolean;

  /**
   * Whether the flow is currently paused
   */
  isPaused: boolean;
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
  pausedAtNodeId: null,
};

/**
 * React hook for executing flows with single or multiple inputs.
 * Automatically discovers input nodes and detects input types (File, URL, structured data).
 * Supports progressive input provision via setInput() and execute().
 *
 * This is the unified flow hook that replaces useFlowUpload for advanced use cases.
 * It provides:
 * - Auto-discovery of flow input nodes
 * - Automatic input type detection (file → upload, string → URL, object → data)
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
 * ```tsx
 * // Single file upload (simple case)
 * function SingleFileUploader() {
 *   const flow = useFlow({
 *     flowConfig: {
 *       flowId: "image-optimization",
 *       storageId: "s3-images",
 *     },
 *     onSuccess: (outputs) => {
 *       console.log("Flow outputs:", outputs);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         onChange={(e) => {
 *           const file = e.target.files?.[0];
 *           if (file) flow.upload(file);
 *         }}
 *       />
 *       {flow.isUploading && <div>Progress: {flow.state.progress}%</div>}
 *     </div>
 *   );
 * }
 *
 * // Multi-input with progressive provision
 * function MultiInputFlow() {
 *   const flow = useFlow({
 *     flowConfig: {
 *       flowId: "multi-source-processing",
 *       storageId: "default",
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       {flow.inputMetadata?.map((input) => (
 *         <div key={input.nodeId}>
 *           <label>{input.nodeId}</label>
 *           {input.nodeType === "streaming-input-v1" ? (
 *             <input
 *               type="file"
 *               onChange={(e) => {
 *                 const file = e.target.files?.[0];
 *                 if (file) flow.setInput(input.nodeId, file);
 *               }}
 *             />
 *           ) : (
 *             <input
 *               type="url"
 *               onChange={(e) => flow.setInput(input.nodeId, e.target.value)}
 *             />
 *           )}
 *         </div>
 *       ))}
 *       <button onClick={flow.execute} disabled={flow.isUploading}>
 *         Execute Flow
 *       </button>
 *
 *       {flow.isUploading && (
 *         <div>
 *           {Array.from(flow.inputStates.values()).map((inputState) => (
 *             <div key={inputState.nodeId}>
 *               {inputState.nodeId}: {inputState.status} ({inputState.progress}%)
 *             </div>
 *           ))}
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link useFlowUpload} for a simpler file-only upload hook
 */
export function useFlow(options: FlowUploadOptions): UseFlowReturn {
  const { client, subscribeToEvents } = useUploadistaContext();
  const { getManager, releaseManager } = useFlowManagerContext();
  const [state, setState] = useState<FlowUploadState>(initialState);
  const currentUploadIdRef = useRef<string | null>(null);

  // Subscribe to WebSocket progress events for granular byte-level updates during upload phase
  useEffect(() => {
    return subscribeToEvents((event) => {
      if (
        !isUploadEvent(event) ||
        event.type !== UploadEventType.UPLOAD_PROGRESS
      )
        return;
      const data = event.data as {
        id: string;
        progress: number;
        total: number;
      };
      if (data.id !== currentUploadIdRef.current || data.total <= 0) return;
      setState((prev) => {
        if (prev.status !== "uploading") return prev;
        return {
          ...prev,
          progress: Math.round((data.progress / data.total) * 100),
          bytesUploaded: data.progress,
          totalBytes: data.total,
        };
      });
    });
  }, [subscribeToEvents]);

  const [inputMetadata, setInputMetadata] = useState<
    FlowInputMetadata[] | null
  >(null);
  const [isDiscoveringInputs, setIsDiscoveringInputs] = useState(false);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [inputStates, setInputStates] = useState<
    ReadonlyMap<string, InputExecutionState>
  >(new Map());
  const managerRef = useRef<FlowManager<unknown> | null>(null);

  // Store callbacks in refs so they can be updated without recreating the manager
  const callbacksRef = useRef(options);

  // Update refs on every render to capture latest callbacks
  useEffect(() => {
    callbacksRef.current = options;
  });

  // Auto-discover flow inputs on mount
  useEffect(() => {
    const discoverInputs = async () => {
      setIsDiscoveringInputs(true);
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

        setInputMetadata(metadata);
      } catch (error) {
        console.error("Failed to discover flow inputs:", error);
      } finally {
        setIsDiscoveringInputs(false);
      }
    };

    discoverInputs();
  }, [client, options.flowConfig.flowId]);

  // Get or create manager from context when component mounts
  useEffect(() => {
    const flowId = options.flowConfig.flowId;

    // Create stable callback wrappers that call the latest callbacks via refs
    const stableCallbacks = {
      onStateChange: (newState: FlowUploadState) => {
        setState(newState);
      },
      onProgress: (
        uploadId: string,
        bytesUploaded: number,
        totalBytes: number | null,
      ) => {
        currentUploadIdRef.current = uploadId;
        callbacksRef.current.onProgress?.(uploadId, bytesUploaded, totalBytes);
      },
      onChunkComplete: (
        chunkSize: number,
        bytesAccepted: number,
        bytesTotal: number | null,
      ) => {
        callbacksRef.current.onChunkComplete?.(
          chunkSize,
          bytesAccepted,
          bytesTotal,
        );
      },
      onFlowComplete: (outputs: TypedOutput[]) => {
        callbacksRef.current.onFlowComplete?.(outputs);
      },
      onSuccess: (outputs: TypedOutput[]) => {
        currentUploadIdRef.current = null;
        callbacksRef.current.onSuccess?.(outputs);
      },
      onError: (error: Error) => {
        currentUploadIdRef.current = null;
        callbacksRef.current.onError?.(error);
      },
      onAbort: () => {
        currentUploadIdRef.current = null;
        callbacksRef.current.onAbort?.();
      },
    };

    // Get manager from context (creates if doesn't exist, increments ref count)
    managerRef.current = getManager(flowId, stableCallbacks, options);

    // Set up interval to poll input states for multi-input flows
    const pollInterval = setInterval(() => {
      if (managerRef.current) {
        const states = managerRef.current.getInputStates();
        if (states.size > 0) {
          setInputStates(new Map(states));
        }
      }
    }, 100); // Poll every 100ms

    // Release manager when component unmounts or flowId changes
    return () => {
      clearInterval(pollInterval);
      releaseManager(flowId);
      managerRef.current = null;
    };
  }, [
    options.flowConfig.flowId,
    options.flowConfig.storageId,
    options.flowConfig.outputNodeId,
    getManager,
    releaseManager,
  ]);

  // Set an input value
  const setInput = useCallback((nodeId: string, value: unknown) => {
    setInputs((prev) => ({ ...prev, [nodeId]: value }));
  }, []);

  // Execute flow with current inputs
  const execute = useCallback(async () => {
    if (!managerRef.current) {
      throw new Error("FlowManager not initialized");
    }

    if (Object.keys(inputs).length === 0) {
      throw new Error(
        "No inputs provided. Use setInput() to provide inputs before calling execute()",
      );
    }

    await managerRef.current.executeFlow(inputs);
  }, [inputs]);

  // Convenience method for single file upload
  const upload = useCallback(
    async (file: File | Blob) => {
      if (!managerRef.current) {
        throw new Error("FlowManager not initialized");
      }

      // If we have input metadata, use the first input node
      // Otherwise, let the manager discover it
      if (inputMetadata && inputMetadata.length > 0) {
        const firstInputNode = inputMetadata[0];
        if (!firstInputNode) {
          throw new Error("No input nodes found");
        }
        setInputs({ [firstInputNode.nodeId]: file });
        await managerRef.current.executeFlow({ [firstInputNode.nodeId]: file });
      } else {
        // Fall back to direct upload (manager will handle discovery)
        await managerRef.current.upload(file);
      }
    },
    [inputMetadata],
  );

  const abort = useCallback(async () => {
    await managerRef.current?.abort();
  }, []);

  const pause = useCallback(async () => {
    await managerRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    await managerRef.current?.resume();
  }, []);

  const reset = useCallback(() => {
    currentUploadIdRef.current = null;
    managerRef.current?.reset();
    setInputs({});
    setInputStates(new Map());
  }, []);

  // Derive computed values from state (reactive to state changes)
  const isUploading =
    state.status === "uploading" || state.status === "processing";
  const isUploadingFile = state.status === "uploading";
  const isProcessing = state.status === "processing";
  const isPaused = state.status === "paused";

  return {
    state,
    inputMetadata,
    inputStates,
    inputs,
    setInput,
    execute,
    upload,
    abort,
    pause,
    resume,
    reset,
    isUploading,
    isUploadingFile,
    isProcessing,
    isDiscoveringInputs,
    isPaused,
  };
}
