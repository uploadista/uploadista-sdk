import type { FlowEvent, TypedOutput } from "@uploadista/core/flow";
import { EventType } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import type { FlowUploadOptions } from "../types/flow-upload-options";

/**
 * Flow upload status representing the current state of a flow upload lifecycle.
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
 */
export interface FlowUploadState {
  /** Current upload status */
  status: FlowUploadStatus;
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Number of bytes uploaded */
  bytesUploaded: number;
  /** Total bytes to upload, null if unknown */
  totalBytes: number | null;
  /** Error if upload or processing failed */
  error: Error | null;
  /** Unique identifier for the flow execution job */
  jobId: string | null;
  /** Whether the flow processing has started */
  flowStarted: boolean;
  /** Name of the currently executing flow node */
  currentNodeName: string | null;
  /** Type of the currently executing flow node */
  currentNodeType: string | null;
  /**
   * Complete typed outputs from all output nodes in the flow.
   * Each output includes nodeId, optional nodeType, data, and timestamp.
   * Available when status is "success".
   */
  flowOutputs: TypedOutput[] | null;
}

/**
 * Callbacks that FlowManager invokes during the flow upload lifecycle
 */
export interface FlowManagerCallbacks {
  /**
   * Called when the flow upload state changes
   */
  onStateChange: (state: FlowUploadState) => void;

  /**
   * Called when upload progress updates
   * @param progress - Progress percentage (0-100)
   * @param bytesUploaded - Number of bytes uploaded
   * @param totalBytes - Total bytes to upload, null if unknown
   */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when a chunk completes
   * @param chunkSize - Size of the completed chunk
   * @param bytesAccepted - Total bytes accepted so far
   * @param bytesTotal - Total bytes to upload, null if unknown
   */
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;

  /**
   * Called when the flow completes successfully (receives full flow outputs)
   * Each output includes nodeId, optional nodeType (e.g., "storage-output-v1"), data, and timestamp.
   *
   * @param outputs - Array of typed outputs from all output nodes
   *
   * @example
   * ```typescript
   * onFlowComplete: (outputs) => {
   *   for (const output of outputs) {
   *     console.log(`${output.nodeId} (${output.nodeType}):`, output.data);
   *   }
   * }
   * ```
   */
  onFlowComplete?: (outputs: TypedOutput[]) => void;

  /**
   * Called when upload succeeds (receives typed outputs from all output nodes)
   * Each output includes nodeId, optional nodeType (e.g., "storage-output-v1"), data, and timestamp.
   *
   * @param outputs - Array of typed outputs from all output nodes
   *
   * @example
   * ```typescript
   * onSuccess: (outputs) => {
   *   for (const output of outputs) {
   *     console.log(`${output.nodeId} completed:`, output.data);
   *   }
   * }
   * ```
   */
  onSuccess?: (outputs: TypedOutput[]) => void;

  /**
   * Called when upload or flow processing fails with an error
   * @param error - The error that occurred
   */
  onError?: (error: Error) => void;

  /**
   * Called when upload or flow is aborted
   */
  onAbort?: () => void;
}

/**
 * Generic flow upload input type - can be any value that the upload client accepts
 */
export type FlowUploadInput = unknown;

/**
 * Flow configuration for upload
 */
export interface FlowConfig {
  flowId: string;
  storageId: string;
  outputNodeId?: string;
  metadata?: Record<string, string>;
}

/**
 * Abort and pause controller interface for canceling/pausing flow uploads
 */
export interface FlowUploadAbortController {
  abort: () => void | Promise<void>;
  pause: () => void | Promise<void>;
}

/**
 * Internal upload options used by the flow upload function.
 * The upload phase always returns UploadFile, regardless of the final TOutput type.
 */
export interface InternalFlowUploadOptions {
  onJobStart?: (jobId: string) => void;
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;
  onSuccess?: (result: UploadFile) => void;
  onError?: (error: Error) => void;
  onAbort?: () => void;
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}

/**
 * Flow upload function that performs the actual upload with flow processing.
 * Returns a promise that resolves to an abort controller with pause capability.
 *
 * Note: The upload phase onSuccess always receives UploadFile. The final TOutput
 * result comes from the flow execution and is handled via FlowEnd events.
 */
export type FlowUploadFunction<TInput = FlowUploadInput> = (
  input: TInput,
  flowConfig: FlowConfig,
  options: InternalFlowUploadOptions,
) => Promise<FlowUploadAbortController>;

/**
 * Initial state for a new flow upload
 */
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
 * Platform-agnostic flow upload manager that handles flow upload state machine,
 * progress tracking, flow event handling, error handling, abort, pause, reset, and retry logic.
 *
 * Framework packages (React, Vue, React Native) should wrap this manager
 * with framework-specific hooks/composables.
 *
 * @example
 * ```typescript
 * const flowUploadFn = (input, options) => client.uploadWithFlow(input, options.flowConfig, options);
 * const manager = new FlowManager(flowUploadFn, {
 *   onStateChange: (state) => setState(state),
 *   onProgress: (progress, bytes, total) => console.log(`${progress}%`),
 *   onSuccess: (result) => console.log('Flow complete:', result),
 *   onError: (error) => console.error('Flow failed:', error),
 * }, {
 *   flowConfig: { flowId: 'my-flow', storageId: 'storage1' }
 * });
 *
 * // Subscribe to events and forward them to the manager
 * const unsubscribe = client.subscribeToEvents((event) => {
 *   if (isFlowEvent(event)) {
 *     manager.handleFlowEvent(event);
 *   } else if (isUploadProgress(event)) {
 *     manager.handleUploadProgress(event);
 *   }
 * });
 *
 * await manager.upload(file);
 * ```
 */
export class FlowManager<TInput = FlowUploadInput> {
  private state: FlowUploadState;
  private abortController: FlowUploadAbortController | null = null;

  /**
   * Create a new FlowManager
   *
   * @param flowUploadFn - Flow upload function to use for uploads
   * @param callbacks - Callbacks to invoke during flow upload lifecycle
   * @param options - Flow upload configuration options
   */
  constructor(
    private readonly flowUploadFn: FlowUploadFunction<TInput>,
    private readonly callbacks: FlowManagerCallbacks,
    private readonly options: FlowUploadOptions,
  ) {
    this.state = { ...initialState };
  }

  /**
   * Get the current flow upload state
   */
  getState(): FlowUploadState {
    return { ...this.state };
  }

  /**
   * Check if an upload or flow is currently active
   */
  isUploading(): boolean {
    return (
      this.state.status === "uploading" || this.state.status === "processing"
    );
  }

  /**
   * Check if file upload is in progress
   */
  isUploadingFile(): boolean {
    return this.state.status === "uploading";
  }

  /**
   * Check if flow processing is in progress
   */
  isProcessing(): boolean {
    return this.state.status === "processing";
  }

  /**
   * Get the current job ID
   */
  getJobId(): string | null {
    return this.state.jobId;
  }

  /**
   * Update the internal state and notify callbacks
   */
  private updateState(update: Partial<FlowUploadState>): void {
    this.state = { ...this.state, ...update };
    this.callbacks.onStateChange(this.state);
  }

  /**
   * Handle flow events from the event subscription
   * This method should be called by the framework wrapper when it receives flow events
   *
   * @param event - Flow event to process
   */
  handleFlowEvent(event: FlowEvent): void {
    // For FlowStart, accept if we don't have a jobId yet (first event)
    // This handles the race condition where flow events arrive before onJobStart callback
    if (event.eventType === EventType.FlowStart && !this.state.jobId) {
      this.updateState({
        jobId: event.jobId,
        flowStarted: true,
        status: "processing",
      });
      return;
    }

    // Only handle events for the current job
    if (!this.state.jobId || event.jobId !== this.state.jobId) {
      // console.warn("[FlowManager] IGNORING event - jobId mismatch");
      return;
    }

    switch (event.eventType) {
      case EventType.FlowStart:
        this.updateState({
          flowStarted: true,
          status: "processing",
        });
        break;

      case EventType.NodeStart:
        this.updateState({
          status: "processing",
          currentNodeName: event.nodeName,
          currentNodeType: event.nodeType,
        });
        break;

      case EventType.NodePause:
        // When input node pauses, it's waiting for upload - switch to uploading state
        this.updateState({
          status: "uploading",
          currentNodeName: event.nodeName,
          // NodePause doesn't have nodeType, keep previous value
        });
        break;

      case EventType.NodeResume:
        // When node resumes, upload is complete - switch to processing state
        this.updateState({
          status: "processing",
          currentNodeName: event.nodeName,
          currentNodeType: event.nodeType,
        });
        break;

      case EventType.NodeEnd:
        this.updateState({
          status:
            this.state.status === "uploading"
              ? "processing"
              : this.state.status,
          currentNodeName: null,
          currentNodeType: null,
        });
        break;

      case EventType.FlowEnd: {
        // Get typed outputs from the event
        const flowOutputs = event.outputs || null;

        // Call onFlowComplete with full typed outputs
        if (flowOutputs && this.callbacks.onFlowComplete) {
          this.callbacks.onFlowComplete(flowOutputs);
        }

        // Call onSuccess with full typed outputs
        if (flowOutputs && flowOutputs.length > 0 && this.callbacks.onSuccess) {
          this.callbacks.onSuccess(flowOutputs);
        }

        this.updateState({
          status: "success",
          currentNodeName: null,
          currentNodeType: null,
          flowOutputs,
        });

        this.abortController = null;
        break;
      }

      case EventType.FlowError: {
        const error = new Error(event.error);
        this.updateState({
          status: "error",
          error,
        });
        this.callbacks.onError?.(error);
        this.abortController = null;
        break;
      }

      case EventType.NodeError: {
        const error = new Error(event.error);
        this.updateState({
          status: "error",
          error,
        });
        this.callbacks.onError?.(error);
        this.abortController = null;
        break;
      }

      case EventType.FlowCancel:
        this.updateState({
          status: "aborted",
        });
        this.callbacks.onAbort?.();
        this.abortController = null;
        break;
    }
  }

  /**
   * Handle upload progress events from the event subscription
   * This method should be called by the framework wrapper when it receives upload progress events
   *
   * @param uploadId - The unique identifier for this upload
   * @param bytesUploaded - Number of bytes uploaded
   * @param totalBytes - Total bytes to upload, null if unknown
   */
  handleUploadProgress(
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ): void {
    // Calculate progress percentage
    const progress =
      totalBytes && totalBytes > 0
        ? Math.round((bytesUploaded / totalBytes) * 100)
        : 0;

    this.updateState({
      bytesUploaded,
      totalBytes,
      progress,
    });

    this.callbacks.onProgress?.(uploadId, bytesUploaded, totalBytes);
  }

  /**
   * Start uploading a file through the flow
   *
   * @param input - File or input to upload (type depends on platform)
   */
  async upload(input: TInput): Promise<void> {
    // Determine totalBytes from input if possible (File/Blob on browser platforms)
    let totalBytes: number | null = null;
    if (input && typeof input === "object") {
      if ("size" in input && typeof input.size === "number") {
        totalBytes = input.size;
      }
    }

    // Reset state but keep reference for potential retries
    this.updateState({
      status: "uploading",
      progress: 0,
      bytesUploaded: 0,
      totalBytes,
      error: null,
      jobId: null,
      flowStarted: false,
      currentNodeName: null,
      currentNodeType: null,
      flowOutputs: null,
    });

    try {
      // Build internal upload options with our callbacks
      const internalOptions: InternalFlowUploadOptions = {
        onJobStart: (jobId: string) => {
          this.updateState({
            jobId,
          });
          this.options?.onJobStart?.(jobId);
        },
        onProgress: (
          uploadId: string,
          bytesUploaded: number,
          totalBytes: number | null,
        ) => {
          this.handleUploadProgress(uploadId, bytesUploaded, totalBytes);
          this.options?.onProgress?.(uploadId, bytesUploaded, totalBytes);
        },
        onChunkComplete: (
          chunkSize: number,
          bytesAccepted: number,
          bytesTotal: number | null,
        ) => {
          this.callbacks.onChunkComplete?.(
            chunkSize,
            bytesAccepted,
            bytesTotal,
          );
          this.options?.onChunkComplete?.(chunkSize, bytesAccepted, bytesTotal);
        },
        onSuccess: (_result: UploadFile) => {
          // Note: This gets called when upload phase completes, not flow completion
          // Flow completion is handled by FlowEnd event
          this.updateState({
            progress: 100,
          });
          // Don't call callbacks.onSuccess here - wait for FlowEnd event with TOutput
        },
        onError: (error: Error) => {
          this.updateState({
            status: "error",
            error,
          });
          this.callbacks.onError?.(error);
          this.options?.onError?.(error);
          this.abortController = null;
        },
        onAbort: () => {
          this.updateState({
            status: "aborted",
          });
          this.callbacks.onAbort?.();
          this.options?.onAbort?.();
          this.abortController = null;
        },
        onShouldRetry: this.options?.onShouldRetry,
      };

      // Start the flow upload
      this.abortController = await this.flowUploadFn(
        input,
        this.options.flowConfig,
        internalOptions,
      );
    } catch (error) {
      // Handle errors from upload initiation
      const uploadError =
        error instanceof Error ? error : new Error(String(error));
      this.updateState({
        status: "error",
        error: uploadError,
      });

      this.callbacks.onError?.(uploadError);
      this.options?.onError?.(uploadError);
      this.abortController = null;
    }
  }

  /**
   * Abort the current flow upload
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      // Note: State update happens in onAbort callback or FlowCancel event
    }
  }

  /**
   * Pause the current flow upload
   */
  pause(): void {
    if (this.abortController) {
      this.abortController.pause();
    }
  }

  /**
   * Reset the flow upload state to idle
   */
  reset(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state = { ...initialState };
    this.callbacks.onStateChange(this.state);
  }

  /**
   * Clean up resources (call when disposing the manager)
   */
  cleanup(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
