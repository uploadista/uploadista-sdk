import type {
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
  InputExecutionState,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFlowManagerContext } from "../contexts/flow-manager-context";
import type { FilePickResult } from "../types";
import { createBlobFromBuffer } from "../types/platform-types";
import { useUploadistaContext } from "./use-uploadista-context";

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
  /** Input node type */
  nodeTypeId: string;
  /** Whether this input is required */
  required: boolean;
}

/**
 * Options for the useFlow hook
 */
export interface UseFlowOptions {
  /** Flow ID to execute */
  flowId: string;
  /** Storage ID for the upload */
  storageId: string;
  /** Output node ID for the flow */
  outputNodeId?: string;
  /** Metadata to pass to flow */
  metadata?: Record<string, unknown>;
  /** Called when upload succeeds (receives typed outputs from all output nodes) */
  onSuccess?: (outputs: TypedOutput[]) => void;
  /** Called when the flow completes successfully (receives full flow outputs) */
  onFlowComplete?: (outputs: TypedOutput[]) => void;
  /** Called when upload fails */
  onError?: (error: Error) => void;
  /** Called when upload progress updates */
  onProgress?: (
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
  /** Called when a chunk completes */
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;
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
 * @property reset - Reset state to idle (clears all data)
 * @property retry - Retry the last failed upload
 * @property isActive - True when upload or processing is active
 * @property isUploadingFile - True only during file upload phase
 * @property isProcessing - True only during flow processing phase
 * @property isDiscoveringInputs - True while discovering flow inputs
 * @property canRetry - True if a retry is possible
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
   * @param value - The input value (FilePickResult, URL string, or structured data)
   */
  setInput: (nodeId: string, value: FilePickResult | string | unknown) => void;

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
   * @param file - FilePickResult from a picker
   */
  upload: (file: FilePickResult) => Promise<void>;

  /**
   * Abort the current upload
   */
  abort: () => void;

  /**
   * Reset the upload state and clear all inputs
   */
  reset: () => void;

  /**
   * Retry the last failed upload
   */
  retry: () => void;

  /**
   * Whether an upload or flow execution is in progress (uploading OR processing)
   */
  isActive: boolean;

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
   * Whether a retry is possible (after error or abort with stored inputs)
   */
  canRetry: boolean;
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
 * React Native hook for executing flows with single or multiple inputs.
 * Automatically discovers input nodes and detects input types (File, URL, structured data).
 * Supports progressive input provision via setInput() and execute().
 *
 * This is the unified flow hook that replaces useFlowUpload for advanced use cases.
 * It provides:
 * - Auto-discovery of flow input nodes
 * - Automatic input type detection (FilePickResult -> upload, string -> URL, object -> data)
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
 * function MyComponent() {
 *   const flow = useFlow({
 *     flowId: 'image-processing-flow',
 *     storageId: 'my-storage',
 *     onSuccess: (outputs) => console.log('Flow complete:', outputs),
 *     onError: (error) => console.error('Flow failed:', error),
 *   });
 *
 *   const handlePickFile = async () => {
 *     const file = await fileSystemProvider.pickDocument();
 *     if (file) {
 *       await flow.upload(file);
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Button title="Pick File" onPress={handlePickFile} />
 *       {flow.isActive && <Text>Progress: {flow.state.progress}%</Text>}
 *       {flow.inputMetadata && (
 *         <Text>Found {flow.inputMetadata.length} input nodes</Text>
 *       )}
 *       <Button title="Abort" onPress={flow.abort} disabled={!flow.isActive} />
 *     </View>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Multi-input flow
 * function MultiInputComponent() {
 *   const flow = useFlow({
 *     flowId: 'multi-source-flow',
 *     storageId: 'my-storage',
 *   });
 *
 *   const handlePickPrimary = async () => {
 *     const file = await fileSystemProvider.pickDocument();
 *     if (file.status === 'success') {
 *       flow.setInput('primary-input', file);
 *     }
 *   };
 *
 *   const handleSetUrl = (url: string) => {
 *     flow.setInput('url-input', url);
 *   };
 *
 *   return (
 *     <View>
 *       <Button title="Pick Primary" onPress={handlePickPrimary} />
 *       <TextInput onChangeText={handleSetUrl} placeholder="Enter URL" />
 *       <Button title="Execute" onPress={flow.execute} />
 *     </View>
 *   );
 * }
 * ```
 *
 * @see {@link useFlowUpload} for a simpler file-only upload hook
 */
export function useFlow(options: UseFlowOptions): UseFlowReturn {
  const { client, fileSystemProvider } = useUploadistaContext();
  const { getManager, releaseManager } = useFlowManagerContext();
  const [state, setState] = useState<FlowUploadState>(initialState);
  const [inputMetadata, setInputMetadata] = useState<
    FlowInputMetadata[] | null
  >(null);
  const [isDiscoveringInputs, setIsDiscoveringInputs] = useState(false);
  const [inputs, setInputs] = useState<Record<string, unknown>>({});
  const [inputStates, setInputStates] = useState<
    ReadonlyMap<string, InputExecutionState>
  >(new Map());
  const managerRef = useRef<FlowManager<unknown> | null>(null);
  const lastInputsRef = useRef<Record<string, unknown> | null>(null);

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
        const { flow } = await client.getFlow(options.flowId);

        // Find all input nodes
        const inputNodes = flow.nodes.filter((node) => node.type === "input");

        const metadata: FlowInputMetadata[] = inputNodes.map((node) => ({
          nodeId: node.id,
          nodeName: node.name,
          nodeDescription: node.description,
          nodeTypeId: node.nodeTypeId,
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
  }, [client, options.flowId]);

  // Get or create manager from context when component mounts
  // biome-ignore lint/correctness/useExhaustiveDependencies: we don't want to recreate the manager on every render
  useEffect(() => {
    const flowId = options.flowId;

    // Create stable callback wrappers that call the latest callbacks via refs
    const stableCallbacks = {
      onStateChange: (newState: FlowUploadState) => {
        setState(newState);
      },
      onProgress: (
        _uploadId: string,
        bytesUploaded: number,
        totalBytes: number | null,
      ) => {
        if (callbacksRef.current.onProgress) {
          const progress = totalBytes
            ? Math.round((bytesUploaded / totalBytes) * 100)
            : 0;
          callbacksRef.current.onProgress(progress, bytesUploaded, totalBytes);
        }
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
        callbacksRef.current.onSuccess?.(outputs);
      },
      onError: (error: Error) => {
        callbacksRef.current.onError?.(error);
      },
      onAbort: () => {
        // onAbort not exposed in public API
      },
    };

    // Get manager from context (creates if doesn't exist, increments ref count)
    managerRef.current = getManager(flowId, stableCallbacks, {
      flowConfig: {
        flowId: options.flowId,
        storageId: options.storageId,
        outputNodeId: options.outputNodeId,
        metadata: options.metadata as Record<string, string> | undefined,
      },
      onChunkComplete: options.onChunkComplete,
      onSuccess: options.onSuccess,
      onError: options.onError,
    });

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
    options.flowId,
    options.storageId,
    options.outputNodeId,
    getManager,
    releaseManager,
  ]);

  // Set an input value
  const setInput = useCallback(
    (nodeId: string, value: FilePickResult | string | unknown) => {
      setInputs((prev) => ({ ...prev, [nodeId]: value }));
    },
    [],
  );

  // Helper to convert FilePickResult to Blob
  const filePickToBlob = useCallback(
    async (file: FilePickResult): Promise<Blob | null> => {
      if (file.status === "cancelled") {
        return null;
      }
      if (file.status === "error") {
        throw file.error;
      }

      const fileContent = await fileSystemProvider.readFile(file.data.uri);
      return createBlobFromBuffer(fileContent, {
        type: file.data.mimeType || "application/octet-stream",
      });
    },
    [fileSystemProvider],
  );

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

    // Store inputs for retry
    lastInputsRef.current = { ...inputs };

    // Convert FilePickResults to Blobs
    const processedInputs: Record<string, unknown> = {};

    for (const [nodeId, value] of Object.entries(inputs)) {
      // Check if value is a FilePickResult
      if (
        value &&
        typeof value === "object" &&
        "status" in value &&
        (value.status === "success" ||
          value.status === "cancelled" ||
          value.status === "error")
      ) {
        const blob = await filePickToBlob(value as FilePickResult);
        if (blob) {
          processedInputs[nodeId] = blob;
        }
        // If blob is null (cancelled), skip this input
      } else {
        // Pass through strings (URLs) and other values as-is
        processedInputs[nodeId] = value;
      }
    }

    if (Object.keys(processedInputs).length === 0) {
      throw new Error(
        "No valid inputs after processing. All files may have been cancelled.",
      );
    }

    await managerRef.current.executeFlow(processedInputs);
  }, [inputs, filePickToBlob]);

  // Convenience method for single file upload
  const upload = useCallback(
    async (file: FilePickResult) => {
      // Handle cancelled picker
      if (file.status === "cancelled") {
        return;
      }

      // Handle picker error
      if (file.status === "error") {
        options.onError?.(file.error);
        return;
      }

      if (!managerRef.current) {
        throw new Error("FlowManager not initialized");
      }

      // Store for retry
      if (inputMetadata && inputMetadata.length > 0) {
        const firstInputNode = inputMetadata[0];
        if (firstInputNode) {
          lastInputsRef.current = { [firstInputNode.nodeId]: file };
        }
      }

      try {
        const fileContent = await fileSystemProvider.readFile(file.data.uri);
        const blob = createBlobFromBuffer(fileContent, {
          type: file.data.mimeType || "application/octet-stream",
        });

        // If we have input metadata, use the first input node
        if (inputMetadata && inputMetadata.length > 0) {
          const firstInputNode = inputMetadata[0];
          if (!firstInputNode) {
            throw new Error("No input nodes found");
          }
          setInputs({ [firstInputNode.nodeId]: file });
          await managerRef.current.executeFlow({
            [firstInputNode.nodeId]: blob,
          });
        } else {
          // Fall back to direct upload (manager will handle discovery)
          await managerRef.current.upload(blob);
        }
      } catch (error) {
        options.onError?.(error as Error);
      }
    },
    [inputMetadata, fileSystemProvider, options],
  );

  const abort = useCallback(() => {
    managerRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    managerRef.current?.reset();
    setInputs({});
    setInputStates(new Map());
    lastInputsRef.current = null;
  }, []);

  const retry = useCallback(() => {
    if (
      lastInputsRef.current &&
      (state.status === "error" || state.status === "aborted")
    ) {
      // Restore inputs and re-execute
      setInputs(lastInputsRef.current);
      execute();
    }
  }, [execute, state.status]);

  // Derive computed values from state (reactive to state changes)
  const isActive =
    state.status === "uploading" || state.status === "processing";
  const isUploadingFile = state.status === "uploading";
  const isProcessing = state.status === "processing";
  const canRetry =
    (state.status === "error" || state.status === "aborted") &&
    lastInputsRef.current !== null;

  return {
    state,
    inputMetadata,
    inputStates,
    inputs,
    setInput,
    execute,
    upload,
    abort,
    reset,
    retry,
    isActive,
    isUploadingFile,
    isProcessing,
    isDiscoveringInputs,
    canRetry,
  };
}
