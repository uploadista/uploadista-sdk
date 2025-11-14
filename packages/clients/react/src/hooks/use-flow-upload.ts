import type { FlowUploadOptions } from "@uploadista/client-browser";
import type {
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFlowManagerContext } from "../contexts/flow-manager-context";

// Re-export types from core for convenience
export type { FlowUploadState, FlowUploadStatus };

/**
 * Return value from the useFlowUpload hook with upload control methods and state.
 *
 * @property state - Complete flow upload state with progress and outputs
 * @property upload - Function to initiate file upload through the flow
 * @property abort - Cancel the current upload and flow execution
 * @property pause - Pause the current upload
 * @property reset - Reset state to idle (clears all data)
 * @property isUploading - True when upload or processing is active
 * @property isUploadingFile - True only during file upload phase
 * @property isProcessing - True only during flow processing phase
 */
export interface UseFlowUploadReturn {
  /**
   * Current upload state
   */
  state: FlowUploadState;

  /**
   * Upload a file through the flow
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
   * Reset the upload state
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
 * React hook for uploading files through a flow with automatic flow execution.
 * Handles both the file upload phase and the flow processing phase, providing
 * real-time progress updates and flow node execution tracking.
 *
 * The flow engine processes the uploaded file through a DAG of nodes, which can
 * perform operations like image optimization, storage saving, webhooks, etc.
 *
 * Must be used within FlowManagerProvider (which must be within UploadistaProvider).
 * Flow events are automatically routed by the provider to the appropriate manager.
 *
 * @param options - Flow upload configuration including flow ID and event handlers
 * @returns Flow upload state and control methods
 *
 * @example
 * ```tsx
 * // Basic flow upload with progress tracking
 * function ImageUploader() {
 *   const flowUpload = useFlowUpload({
 *     flowConfig: {
 *       flowId: "image-optimization-flow",
 *       storageId: "s3-images",
 *     },
 *     onSuccess: (outputs) => {
 *       console.log("Flow outputs:", outputs);
 *       // Access all outputs from the flow
 *       for (const output of outputs) {
 *         console.log(`${output.nodeId}:`, output.data);
 *       }
 *     },
 *     onFlowComplete: (outputs) => {
 *       console.log("All flow outputs:", outputs);
 *     },
 *     onError: (error) => {
 *       console.error("Upload or processing failed:", error);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         accept="image/*"
 *         onChange={(e) => {
 *           const file = e.target.files?.[0];
 *           if (file) flowUpload.upload(file);
 *         }}
 *       />
 *
 *       {flowUpload.isUploadingFile && (
 *         <div>Uploading... {flowUpload.state.progress}%</div>
 *       )}
 *
 *       {flowUpload.isProcessing && (
 *         <div>
 *           Processing...
 *           {flowUpload.state.currentNodeName && (
 *             <span>Current step: {flowUpload.state.currentNodeName}</span>
 *           )}
 *         </div>
 *       )}
 *
 *       {flowUpload.state.status === "success" && (
 *         <div>
 *           <p>Upload complete!</p>
 *           {flowUpload.state.flowOutputs && (
 *             <div>
 *               {flowUpload.state.flowOutputs.map((output) => (
 *                 <div key={output.nodeId}>{output.nodeId}: {JSON.stringify(output.data)}</div>
 *               ))}
 *             </div>
 *           )}
 *         </div>
 *       )}
 *
 *       {flowUpload.state.status === "error" && (
 *         <div>
 *           <p>Error: {flowUpload.state.error?.message}</p>
 *           <button onClick={flowUpload.reset}>Try Again</button>
 *         </div>
 *       )}
 *
 *       {flowUpload.isUploading && (
 *         <button onClick={flowUpload.abort}>Cancel</button>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link useMultiFlowUpload} for uploading multiple files through a flow
 * @see {@link useUpload} for simple uploads without flow processing
 */
export function useFlowUpload(options: FlowUploadOptions): UseFlowUploadReturn {
  const { getManager, releaseManager } = useFlowManagerContext();
  const [state, setState] = useState<FlowUploadState>(initialState);
  const managerRef = useRef<FlowManager<unknown> | null>(null);

  // Store callbacks in refs so they can be updated without recreating the manager
  const callbacksRef = useRef(options);

  // Update refs on every render to capture latest callbacks
  useEffect(() => {
    callbacksRef.current = options;
  });

  // Get or create manager from context when component mounts
  // Manager lifecycle is now handled by FlowManagerProvider
  useEffect(() => {
    const flowId = options.flowConfig.flowId;

    // Create stable callback wrappers that call the latest callbacks via refs
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
        callbacksRef.current.onSuccess?.(outputs);
      },
      onError: (error: Error) => {
        callbacksRef.current.onError?.(error);
      },
      onAbort: () => {
        callbacksRef.current.onAbort?.();
      },
    };

    // Get manager from context (creates if doesn't exist, increments ref count)
    managerRef.current = getManager(flowId, stableCallbacks, options);

    // Release manager when component unmounts or flowId changes
    return () => {
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

  // Wrap manager methods with useCallback
  const upload = useCallback(async (file: File | Blob) => {
    await managerRef.current?.upload(file);
  }, []);

  const abort = useCallback(() => {
    managerRef.current?.abort();
  }, []);

  const pause = useCallback(() => {
    managerRef.current?.pause();
  }, []);

  const reset = useCallback(() => {
    managerRef.current?.reset();
  }, []);

  // Derive computed values from state (reactive to state changes)
  const isUploading =
    state.status === "uploading" || state.status === "processing";
  const isUploadingFile = state.status === "uploading";
  const isProcessing = state.status === "processing";

  return {
    state,
    upload,
    abort,
    pause,
    reset,
    isUploading,
    isUploadingFile,
    isProcessing,
  };
}
