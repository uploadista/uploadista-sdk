import type {
  FlowUploadOptions,
  UploadistaEvent,
} from "@uploadista/client-browser";
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

/**
 * Possible states for a flow upload lifecycle.
 * Flow uploads progress through: idle → uploading → processing → success/error/aborted
 */
export type FlowUploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "success"
  | "error"
  | "aborted";

/**
 * Complete state information for a flow upload operation.
 * Tracks both the upload phase (file transfer) and processing phase (flow execution).
 *
 * @template TOutput - Type of the final output from the flow (defaults to UploadFile)
 *
 * @property status - Current upload status (idle, uploading, processing, success, error, aborted)
 * @property progress - Upload progress percentage (0-100)
 * @property bytesUploaded - Number of bytes successfully uploaded
 * @property totalBytes - Total file size in bytes (null if unknown)
 * @property error - Error object if upload or processing failed
 * @property result - Final output from the flow (available when status is "success")
 * @property jobId - Unique identifier for the flow execution job
 * @property flowStarted - Whether the flow processing has started
 * @property currentNodeName - Name of the currently executing flow node
 * @property currentNodeType - Type of the currently executing flow node
 * @property flowOutputs - Complete outputs from all output nodes in the flow
 */
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

/**
 * Return value from the useFlowUpload hook with upload control methods and state.
 *
 * @template TOutput - Type of the final output from the flow (defaults to UploadFile)
 *
 * @property state - Complete flow upload state with progress and outputs
 * @property upload - Function to initiate file upload through the flow
 * @property abort - Cancel the current upload and flow execution
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
  // Get client and event subscription from context
  const client = useUploadistaContext();
  const [state, setState] = useState<FlowUploadState<TOutput>>(
    initialState as FlowUploadState<TOutput>,
  );
  const abortRef = useRef<(() => void) | null>(null);
  const onSuccessRef = useRef(options.onSuccess);
  const onErrorRef = useRef(options.onError);
  const onFlowCompleteRef = useRef(options.onFlowComplete);
  const outputNodeIdRef = useRef(options.flowConfig.outputNodeId);

  // Update refs when callbacks change
  useEffect(() => {
    onSuccessRef.current = options.onSuccess;
    onErrorRef.current = options.onError;
    onFlowCompleteRef.current = options.onFlowComplete;
    outputNodeIdRef.current = options.flowConfig.outputNodeId;
  }, [
    options.onSuccess,
    options.onError,
    options.onFlowComplete,
    options.flowConfig.outputNodeId,
  ]);

  // Store jobId in ref for event handling
  const jobIdRef = useRef<string | null>(null);

  useEffect(() => {
    jobIdRef.current = state.jobId;
  }, [state.jobId]);

  // Create stable event handler
  const handleFlowEvent = useCallback((event: FlowEvent) => {
    console.log(
      "[useFlowUpload] Received event:",
      event,
      "Current jobId:",
      jobIdRef.current,
    );

    // Only handle events for the current job
    if (!jobIdRef.current || event.jobId !== jobIdRef.current) {
      console.log("[useFlowUpload] Ignoring event - jobId mismatch");
      return;
    }

    console.log("[useFlowUpload] Processing event type:", event.eventType);

    switch (event.eventType) {
      case EventType.FlowStart:
        console.log("[useFlowUpload] Flow started");
        setState((prev) => ({
          ...prev,
          flowStarted: true,
          status: "processing",
        }));
        break;

      case EventType.NodeStart:
        console.log("[useFlowUpload] Node started:", event.nodeName);
        setState((prev) => ({
          ...prev,
          status: "processing",
          currentNodeName: event.nodeName,
          currentNodeType: event.nodeType,
        }));
        break;

      case EventType.NodePause:
        console.log(
          "[useFlowUpload] Node paused (waiting for upload):",
          event.nodeName,
        );
        // When input node pauses, it's waiting for upload - switch to uploading state
        setState((prev) => ({
          ...prev,
          status: "uploading",
          currentNodeName: event.nodeName,
          // NodePause doesn't have nodeType, keep previous value
        }));
        break;

      case EventType.NodeResume:
        console.log(
          "[useFlowUpload] Node resumed (upload complete):",
          event.nodeName,
        );
        // When node resumes, upload is complete - switch to processing state
        setState((prev) => ({
          ...prev,
          status: "processing",
          currentNodeName: event.nodeName,
          currentNodeType: event.nodeType,
        }));
        break;

      case EventType.NodeEnd:
        console.log("[useFlowUpload] Node ended:", event.nodeName);
        setState((prev) => ({
          ...prev,
          status: prev.status === "uploading" ? "processing" : prev.status,
          currentNodeName: null,
          currentNodeType: null,
        }));
        break;

      case EventType.FlowEnd:
        console.log("[useFlowUpload] Flow ended, processing outputs");
        setState((prev) => {
          // Get flow outputs from the event result
          const flowOutputs = (event.result as Record<string, unknown>) || null;

          console.log("[useFlowUpload] Flow outputs:", flowOutputs);

          // Call onFlowComplete with full outputs
          if (flowOutputs && onFlowCompleteRef.current) {
            console.log(
              "[useFlowUpload] Calling onFlowComplete with outputs:",
              flowOutputs,
            );
            onFlowCompleteRef.current(flowOutputs);
          }

          // Extract single output for onSuccess callback
          let extractedOutput: TOutput | null = null;
          if (flowOutputs) {
            if (
              outputNodeIdRef.current &&
              outputNodeIdRef.current in flowOutputs
            ) {
              // Use specified output node
              extractedOutput = flowOutputs[outputNodeIdRef.current] as TOutput;
              console.log(
                "[useFlowUpload] Extracted output from specified node:",
                outputNodeIdRef.current,
              );
            } else {
              // Use first output node
              const firstOutputValue = Object.values(flowOutputs)[0];
              extractedOutput = firstOutputValue as TOutput;
              console.log("[useFlowUpload] Extracted output from first node");
            }
          }

          // Call onSuccess with extracted output
          if (extractedOutput && onSuccessRef.current) {
            console.log(
              "[useFlowUpload] Calling onSuccess with result:",
              extractedOutput,
            );
            onSuccessRef.current(extractedOutput);
          } else if (!extractedOutput && onSuccessRef.current) {
            console.warn("[useFlowUpload] No result available for onSuccess");
          }

          return {
            ...prev,
            status: "success",
            currentNodeName: null,
            currentNodeType: null,
            result: extractedOutput,
            flowOutputs,
          };
        });
        break;

      case EventType.FlowError:
        console.log("[useFlowUpload] Flow error:", event.error);
        setState((prev) => ({
          ...prev,
          status: "error",
          error: new Error(event.error),
        }));
        onErrorRef.current?.(new Error(event.error));
        break;

      case EventType.NodeError:
        console.log("[useFlowUpload] Node error:", event.error);
        setState((prev) => ({
          ...prev,
          status: "error",
          error: new Error(event.error),
        }));
        onErrorRef.current?.(new Error(event.error));
        break;
    }
  }, []);

  // Automatically subscribe to flow events and upload events from context
  useEffect(() => {
    console.log("[useFlowUpload] Subscribing to events from context");
    const unsubscribe = client.subscribeToEvents((event: UploadistaEvent) => {
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
        uploadEvent.flow?.jobId === jobIdRef.current &&
        uploadEvent.data
      ) {
        const { progress: bytesUploaded, total: totalBytes } = uploadEvent.data;
        const progress = totalBytes
          ? Math.round((bytesUploaded / totalBytes) * 100)
          : 0;

        console.log("[useFlowUpload] Upload progress event:", {
          progress,
          bytesUploaded,
          totalBytes,
          jobId: uploadEvent.flow.jobId,
        });

        setState((prev) => ({
          ...prev,
          progress,
          bytesUploaded,
          totalBytes,
        }));
      }
    });

    return unsubscribe;
  }, [client, handleFlowEvent]);

  const abort = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;

      setState((prev) => ({
        ...prev,
        status: "aborted",
      }));

      options.onAbort?.();
    }
  }, [options]);

  const upload = useCallback(
    async (file: File | Blob) => {
      jobIdRef.current = null;

      setState({
        ...initialState,
        status: "uploading",
        totalBytes: file.size,
      } as FlowUploadState<TOutput>);

      try {
        const { abort: _abortFn } = await client.client.uploadWithFlow(
          file,
          options.flowConfig,
          {
            onJobStart: (jobId: string) => {
              jobIdRef.current = jobId;
              setState((prev) => ({ ...prev, jobId }));
            },
            onProgress: (
              _uploadId: string,
              bytesUploaded: number,
              totalBytes: number | null,
            ) => {
              const progress = totalBytes
                ? Math.round((bytesUploaded / totalBytes) * 100)
                : 0;

              setState((prev) => ({
                ...prev,
                progress,
                bytesUploaded,
                totalBytes,
              }));

              options.onProgress?.(progress, bytesUploaded, totalBytes);
            },
            onChunkComplete: options.onChunkComplete,
            onSuccess: (_result: UploadFile) => {
              // Upload phase is complete, now waiting for flow execution
              // Note: we don't store the upload result as our final result
              // The final result will come from the FlowEnd event
              // Status transition from "uploading" to "processing" is handled by NodeResume event
              setState((prev) => ({
                ...prev,
                progress: 100,
              }));
              // Don't call onSuccess here - wait for FlowEnd event
            },
            onError: (error: Error) => {
              setState((prev) => ({
                ...prev,
                status: "error",
                error,
              }));

              options.onError?.(error);
            },
            onShouldRetry: options.onShouldRetry,
          },
        );

        abortRef.current = _abortFn;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: error as Error,
        }));

        options.onError?.(error as Error);
      }
    },
    [client, options],
  );

  const reset = useCallback(() => {
    setState(initialState as FlowUploadState<TOutput>);
    abortRef.current = null;
    jobIdRef.current = null;
  }, []);

  return {
    state,
    upload,
    abort,
    reset,
    isUploading: state.status === "uploading" || state.status === "processing",
    isUploadingFile: state.status === "uploading",
    isProcessing: state.status === "processing",
  };
}
