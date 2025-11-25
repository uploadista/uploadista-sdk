/**
 * Generic React hook for flexible flow execution with arbitrary input types.
 *
 * This hook provides a flexible interface for executing flows with different input types:
 * - File/Blob: Traditional chunked file upload
 * - string (URL): Direct file fetch from external URL
 * - object: Structured data for custom input nodes
 *
 * The hook uses an inputBuilder pattern to transform trigger data into flow inputs,
 * enabling dynamic input preparation and validation before flow execution.
 *
 * @module hooks/use-flow-execution
 *
 * @example
 * ```tsx
 * // URL-based flow execution
 * function UrlImageProcessor() {
 *   const execution = useFlowExecution<string>({
 *     flowConfig: {
 *       flowId: "image-optimize",
 *       storageId: "s3"
 *     },
 *     inputBuilder: async (url) => {
 *       // Find the input node
 *       const { inputNodes, single } = await client.findInputNode("image-optimize");
 *       if (!single) throw new Error("Expected single input node");
 *
 *       return {
 *         [inputNodes[0].id]: {
 *           operation: "url",
 *           url,
 *           metadata: { source: "external" }
 *         }
 *       };
 *     },
 *     onSuccess: (outputs) => console.log("Done:", outputs)
 *   });
 *
 *   return (
 *     <button onClick={() => execution.execute("https://example.com/image.jpg")}>
 *       Process URL
 *     </button>
 *   );
 * }
 * ```
 */

import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowInputs,
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";
import { useFlowManagerContext } from "../contexts/flow-manager-context";

// Re-export types for convenience
export type { FlowUploadState, FlowUploadStatus };

/**
 * Input builder function that transforms trigger data into flow inputs.
 *
 * The builder receives the trigger data passed to execute() and returns
 * a FlowInputs object mapping node IDs to their input data.
 *
 * @template TTrigger - The type of data passed to execute()
 * @param trigger - The trigger data (e.g., File, URL string, structured data)
 * @returns Promise resolving to FlowInputs mapping or the mapping directly
 *
 * @example
 * ```typescript
 * // File upload builder
 * const fileBuilder: InputBuilder<File> = async (file) => ({
 *   "input-node": {
 *     operation: "init",
 *     storageId: "s3",
 *     metadata: { originalName: file.name, size: file.size }
 *   }
 * });
 *
 * // URL fetch builder
 * const urlBuilder: InputBuilder<string> = (url) => ({
 *   "input-node": {
 *     operation: "url",
 *     url,
 *     metadata: { source: "external" }
 *   }
 * });
 * ```
 */
export type InputBuilder<TTrigger = unknown> = (
  trigger: TTrigger,
) => Promise<FlowInputs> | FlowInputs;

/**
 * Options for the useFlowExecution hook.
 *
 * @template TTrigger - The type of trigger data passed to execute()
 * @template TOutput - The expected output type from the flow
 *
 * @property flowConfig - Flow configuration (flowId, storageId, etc.)
 * @property inputBuilder - Function to build flow inputs from trigger data
 * @property onJobStart - Called when flow job is created
 * @property onProgress - Called during upload progress (if applicable)
 * @property onChunkComplete - Called when upload chunk completes (if applicable)
 * @property onSuccess - Called with typed outputs when flow succeeds
 * @property onFlowComplete - Called with all outputs when flow completes
 * @property onError - Called when execution fails
 * @property onAbort - Called when execution is aborted
 * @property onShouldRetry - Custom retry logic (if applicable)
 */
export interface UseFlowExecutionOptions<
  TTrigger = unknown,
  TOutput = TypedOutput[],
> {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadOptions["flowConfig"];

  /**
   * Function to build flow inputs from trigger data.
   * Can be async to perform validation, API calls, etc.
   */
  inputBuilder: InputBuilder<TTrigger>;

  /**
   * Called when the flow job starts
   */
  onJobStart?: (jobId: string) => void;

  /**
   * Called during upload progress (for file uploads)
   */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when an upload chunk completes (for file uploads)
   */
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;

  /**
   * Called when flow execution succeeds with final outputs
   */
  onSuccess?: (outputs: TOutput) => void;

  /**
   * Called when flow completes (alternative to onSuccess)
   */
  onFlowComplete?: (outputs: TypedOutput[]) => void;

  /**
   * Called when execution fails
   */
  onError?: (error: Error) => void;

  /**
   * Called when execution is aborted
   */
  onAbort?: () => void;

  /**
   * Custom retry logic (for file uploads)
   */
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}

/**
 * Return value from useFlowExecution hook.
 *
 * @template TTrigger - The type of trigger data passed to execute()
 *
 * @property state - Current execution state with progress and outputs
 * @property execute - Function to trigger flow execution
 * @property abort - Cancel the current execution
 * @property pause - Pause the current execution (for file uploads)
 * @property reset - Reset state to idle
 * @property isExecuting - True when execution is active
 * @property isUploadingFile - True during file upload phase
 * @property isProcessing - True during flow processing phase
 */
export interface UseFlowExecutionReturn<TTrigger = unknown> {
  /**
   * Current execution state
   */
  state: FlowUploadState;

  /**
   * Execute the flow with trigger data
   */
  execute: (trigger: TTrigger) => Promise<void>;

  /**
   * Abort the current execution
   */
  abort: () => void;

  /**
   * Pause the current execution (if supported by input type)
   */
  pause: () => void;

  /**
   * Reset the execution state
   */
  reset: () => void;

  /**
   * Whether execution is active (uploading OR processing)
   */
  isExecuting: boolean;

  /**
   * Whether file upload is in progress
   */
  isUploadingFile: boolean;

  /**
   * Whether flow processing is in progress
   */
  isProcessing: boolean;
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
 * Generic React hook for flexible flow execution.
 *
 * Provides a flexible interface for executing flows with arbitrary input types
 * through an inputBuilder pattern. The builder transforms trigger data into
 * flow inputs, enabling support for files, URLs, structured data, and more.
 *
 * Must be used within FlowManagerProvider (which must be within UploadistaProvider).
 *
 * @template TTrigger - The type of trigger data passed to execute()
 * @template TOutput - The expected output type from the flow
 *
 * @param options - Flow execution configuration with inputBuilder
 * @returns Execution state and control methods
 *
 * @example
 * ```tsx
 * // URL-based image processing
 * const urlExecution = useFlowExecution<string>({
 *   flowConfig: { flowId: "optimize", storageId: "s3" },
 *   inputBuilder: async (url) => {
 *     const { inputNodes } = await client.findInputNode("optimize");
 *     return {
 *       [inputNodes[0].id]: {
 *         operation: "url",
 *         url,
 *         metadata: { source: "external" }
 *       }
 *     };
 *   },
 *   onSuccess: (outputs) => console.log("Processed:", outputs)
 * });
 *
 * // Execute with URL
 * await urlExecution.execute("https://example.com/image.jpg");
 *
 * // File upload (traditional pattern)
 * const fileExecution = useFlowExecution<File>({
 *   flowConfig: { flowId: "optimize", storageId: "s3" },
 *   inputBuilder: async (file) => {
 *     const { inputNodes } = await client.findInputNode("optimize");
 *     return {
 *       [inputNodes[0].id]: {
 *         operation: "init",
 *         storageId: "s3",
 *         metadata: {
 *           originalName: file.name,
 *           mimeType: file.type,
 *           size: file.size
 *         }
 *       }
 *     };
 *   }
 * });
 *
 * // Execute with file
 * await fileExecution.execute(myFile);
 * ```
 */
export function useFlowExecution<TTrigger = unknown, TOutput = TypedOutput[]>(
  options: UseFlowExecutionOptions<TTrigger, TOutput>,
): UseFlowExecutionReturn<TTrigger> {
  const { client } = useUploadistaContext();
  const { getManager, releaseManager } = useFlowManagerContext();
  const [state, setState] = useState<FlowUploadState>(initialState);
  const managerRef = useRef<FlowManager<unknown> | null>(null);

  // Store callbacks and inputBuilder in refs for stable access
  const callbacksRef = useRef(options);
  const inputBuilderRef = useRef(options.inputBuilder);

  // Update refs when options change
  useEffect(() => {
    callbacksRef.current = options;
    inputBuilderRef.current = options.inputBuilder;
  });

  // Get or create manager from context
  useEffect(() => {
    const flowId = options.flowConfig.flowId;

    // Create stable callback wrappers
    const stableCallbacks = {
      onStateChange: setState,
      onProgress: (
        uploadId: string,
        bytesUploaded: number,
        totalBytes: number | null,
      ) => {
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
        callbacksRef.current.onSuccess?.(outputs as TOutput);
      },
      onError: (error: Error) => {
        callbacksRef.current.onError?.(error);
      },
      onAbort: () => {
        callbacksRef.current.onAbort?.();
      },
    };

    // Get or create manager for this flow
    const manager = getManager(flowId, stableCallbacks, {
      flowConfig: options.flowConfig,
    });
    managerRef.current = manager;

    return () => {
      if (managerRef.current) {
        releaseManager(flowId);
        managerRef.current = null;
      }
    };
  }, [options.flowConfig.flowId, getManager, releaseManager, options]);

  /**
   * Execute the flow with trigger data.
   * Calls inputBuilder to transform trigger into flow inputs.
   */
  const execute = useCallback(async (trigger: TTrigger) => {
    try {
      // Build flow inputs from trigger data
      const flowInputs = await inputBuilderRef.current(trigger);

      // For now, we need to determine if this is a file upload or URL operation
      // by inspecting the flowInputs structure
      const firstInputNodeId = Object.keys(flowInputs)[0];
      if (!firstInputNodeId) {
        throw new Error("flowInputs must contain at least one input node");
      }
      const firstInput = flowInputs[firstInputNodeId];

      // Type guard: check if this is an init operation (file upload)
      const isFileUpload =
        typeof firstInput === "object" &&
        firstInput !== null &&
        "operation" in firstInput &&
        firstInput.operation === "init";

      if (isFileUpload) {
        // File upload path: use the standard upload mechanism
        // This requires the trigger to be a File/Blob
        if (managerRef.current) {
          await managerRef.current.upload(trigger as unknown);
        }
      } else {
        // Non-file path (URL, structured data, etc.)
        // Skip chunked upload and execute flow directly with provided inputs
        setState((prev) => ({
          ...prev,
          status: "processing",
          flowStarted: true,
        }));

        // Execute flow with the built inputs
        const result = await client.executeFlowWithInputs(
          options.flowConfig.flowId,
          flowInputs,
          {
            storageId: options.flowConfig.storageId,
            onJobStart: (jobId: string) => {
              setState((prev) => ({
                ...prev,
                jobId,
              }));
              callbacksRef.current.onJobStart?.(jobId);
            },
          },
        );

        // If job was created successfully, the FlowManager will handle
        // flow events via WebSocket and update state accordingly
        if (result.job?.id) {
          // State updates will come from flow events
          // Manager will receive FlowEnd event and update state to "success"
        } else {
          // No job created - treat as immediate completion
          setState((prev) => ({
            ...prev,
            status: "success",
            progress: 100,
            flowStarted: true,
          }));
        }
      }
    } catch (error) {
      // Handle inputBuilder errors
      const err = error instanceof Error ? error : new Error(String(error));
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err,
      }));
      callbacksRef.current.onError?.(err);
    }
  }, []);

  /**
   * Abort the current execution
   */
  const abort = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.abort();
    }
  }, []);

  /**
   * Pause the current execution
   */
  const pause = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.pause();
    }
  }, []);

  /**
   * Reset the execution state
   */
  const reset = useCallback(() => {
    if (managerRef.current) {
      const flowId = options.flowConfig.flowId;
      managerRef.current.reset();
      managerRef.current.cleanup();
      releaseManager(flowId);
      managerRef.current = null;
    }
    setState(initialState);
  }, [options.flowConfig.flowId, releaseManager]);

  return {
    state,
    execute,
    abort,
    pause,
    reset,
    isExecuting: state.status === "uploading" || state.status === "processing",
    isUploadingFile: state.status === "uploading",
    isProcessing: state.status === "processing",
  };
}
