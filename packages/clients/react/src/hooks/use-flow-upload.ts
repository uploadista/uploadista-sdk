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
import { useCallback, useEffect, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

/**
 * Type guard to check if an event is a flow event
 */
function isFlowEvent(event: UploadistaEvent): event is FlowEvent {
  // FlowEvent has eventType, not type
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

/**
 * Return value from the useFlowUpload hook with upload control methods and state.
 *
 * @template TOutput - Type of the final output from the flow (defaults to UploadFile)
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
export interface UseFlowUploadReturn<TOutput = UploadFile> {
  /**
   * Current upload state
   */
  state: FlowUploadState<TOutput>;

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
  result: null,
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
 * Must be used within an UploadistaProvider. Flow events (node start/end, flow complete)
 * are automatically subscribed through the provider context.
 *
 * @template TOutput - Type of the final result from the flow (defaults to UploadFile)
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
 *       outputNodeId: "optimized-output", // Optional: specify which output to use
 *     },
 *     onSuccess: (result) => {
 *       console.log("Image optimized and saved:", result);
 *     },
 *     onFlowComplete: (outputs) => {
 *       console.log("All flow outputs:", outputs);
 *       // outputs might include: { thumbnail: {...}, optimized: {...}, original: {...} }
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
 *           {flowUpload.state.result && (
 *             <img src={flowUpload.state.result.url} alt="Uploaded" />
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
export function useFlowUpload<TOutput = UploadFile>(
  options: FlowUploadOptions<TOutput>,
): UseFlowUploadReturn<TOutput> {
  // Get client from context
  const client = useUploadistaContext();
  const [state, setState] = useState<FlowUploadState<TOutput>>(
    initialState as FlowUploadState<TOutput>,
  );
  const managerRef = useRef<FlowManager<File | Blob, TOutput> | null>(null);

  // Create FlowManager instance
  useEffect(() => {
    managerRef.current = new FlowManager(
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
        onStateChange: setState,
        onProgress: options.onProgress,
        onChunkComplete: options.onChunkComplete,
        onFlowComplete: options.onFlowComplete,
        onSuccess: options.onSuccess,
        onError: options.onError,
        onAbort: options.onAbort,
      },
      options,
    );

    return () => {
      managerRef.current?.cleanup();
    };
  }, [client, options]);

  // Subscribe to events and forward them to the manager
  useEffect(() => {
    const unsubscribe = client.subscribeToEvents((event: UploadistaEvent) => {
      // Handle flow events
      if (isFlowEvent(event)) {
        managerRef.current?.handleFlowEvent(event);
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
        uploadEvent.flow?.jobId === managerRef.current?.getJobId() &&
        uploadEvent.data
      ) {
        const { progress: bytesUploaded, total: totalBytes } = uploadEvent.data;

        managerRef.current?.handleUploadProgress(
          uploadEvent.data.id,
          bytesUploaded,
          totalBytes,
        );
      }
    });

    return unsubscribe;
  }, [client]);

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

  // Derive computed values from state
  const isUploading = managerRef.current?.isUploading() ?? false;
  const isUploadingFile = managerRef.current?.isUploadingFile() ?? false;
  const isProcessing = managerRef.current?.isProcessing() ?? false;

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
