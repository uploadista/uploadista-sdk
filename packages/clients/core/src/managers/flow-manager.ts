import type { FlowEvent, TypedOutput } from "@uploadista/core/flow";
import { EventType } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import type { FlowUploadOptions } from "../types/flow-upload-options";
import { detectInputType } from "../utils/input-detection";

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
 * State for a single input in a multi-input flow.
 */
export interface InputExecutionState {
  /** Input node ID */
  nodeId: string;
  /** Input type (file, url, data) */
  type: "file" | "url" | "data";
  /** Current status of this input */
  status: "pending" | "uploading" | "complete" | "error";
  /** Progress percentage for file uploads (0-100) */
  progress: number;
  /** Bytes uploaded for file uploads */
  bytesUploaded: number;
  /** Total bytes for file uploads */
  totalBytes: number | null;
  /** Error if this input failed */
  error: Error | null;
  /** Abort controller for this specific input */
  abortController: FlowUploadAbortController | null;
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
 * Generic flow execution input type - can be any value that the flow execution client accepts.
 * Common types include File, Blob, string (for URLs), or structured data objects.
 *
 * @remarks
 * The flexibility of this type enables different flow execution patterns:
 * - File/Blob: Traditional chunked file upload with init/finalize operations
 * - string (URL): Direct file fetch from external URL
 * - object: Structured data for non-file input nodes (future)
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
 * Callbacks for tracking individual input progress in multi-input flows
 */
export interface MultiInputCallbacks {
  /**
   * Called when an input's progress updates
   * @param nodeId - The input node ID
   * @param progress - Progress percentage (0-100)
   * @param bytesUploaded - Bytes uploaded for this input
   * @param totalBytes - Total bytes for this input
   */
  onInputProgress?: (
    nodeId: string,
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when an input completes successfully
   * @param nodeId - The input node ID
   */
  onInputComplete?: (nodeId: string) => void;

  /**
   * Called when an input fails
   * @param nodeId - The input node ID
   * @param error - The error that occurred
   */
  onInputError?: (nodeId: string, error: Error) => void;
}

/**
 * Multi-input flow upload function that coordinates multiple inputs in a single flow.
 * Platform packages should implement this to enable parallel multi-input upload support.
 *
 * @param inputs - Record of nodeId to input data (File, URL string, or structured data)
 * @param flowConfig - Flow configuration
 * @param options - Upload callbacks and configuration
 * @param multiInputCallbacks - Per-input progress tracking callbacks
 * @returns Promise resolving to abort controller for the entire flow execution
 *
 * @example
 * ```typescript
 * const uploadFn: MultiInputFlowUploadFunction = async (inputs, flowConfig, options, callbacks) => {
 *   // 1. Start flow and create job
 *   const jobId = await startFlow(flowConfig.flowId, flowConfig.storageId);
 *
 *   // 2. Initialize all inputs in parallel using orchestrator functions
 *   const initPromises = Object.entries(inputs).map(([nodeId, data]) =>
 *     initializeFlowInput({ nodeId, jobId, source: data, ... })
 *   );
 *
 *   // 3. Upload files in parallel
 *   // 4. Finalize all inputs
 *   // 5. Return abort controller
 * };
 * ```
 */
export type MultiInputFlowUploadFunction = (
  inputs: Record<string, unknown>,
  flowConfig: FlowConfig,
  options: InternalFlowUploadOptions,
  multiInputCallbacks?: MultiInputCallbacks,
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
 * Platform-agnostic flow execution manager that handles flow state machine,
 * progress tracking, flow event handling, error handling, abort, pause, reset, and retry logic.
 *
 * Supports multiple input types through generic TInput parameter:
 * - File/Blob: Chunked file upload with progress tracking
 * - string (URL): Direct file fetch from external source
 * - object: Structured data for custom input nodes
 *
 * Framework packages (React, Vue, React Native) should wrap this manager
 * with framework-specific hooks/composables.
 *
 * @template TInput - The type of input data accepted by the flow (File, Blob, string, object, etc.)
 *
 * @example
 * ```typescript
 * // File upload flow
 * const fileFlowManager = new FlowManager<File>(...);
 * await fileFlowManager.upload(myFile);
 *
 * // URL fetch flow
 * const urlFlowManager = new FlowManager<string>(...);
 * await urlFlowManager.upload("https://example.com/image.jpg");
 *
 * // Structured data flow
 * const dataFlowManager = new FlowManager<{ text: string }>(...);
 * await dataFlowManager.upload({ text: "Process this" });
 * ```
 */
export class FlowManager<TInput = FlowUploadInput> {
  private state: FlowUploadState;
  private abortController: FlowUploadAbortController | null = null;
  private inputStates: Map<string, InputExecutionState> = new Map();

  /**
   * Create a new FlowManager
   *
   * @param flowUploadFn - Flow upload function to use for uploads
   * @param callbacks - Callbacks to invoke during flow upload lifecycle
   * @param options - Flow upload configuration options
   * @param multiInputUploadFn - Optional multi-input upload function for executeFlow()
   */
  constructor(
    private readonly flowUploadFn: FlowUploadFunction<TInput>,
    private readonly callbacks: FlowManagerCallbacks,
    private readonly options: FlowUploadOptions,
    private readonly multiInputUploadFn?: MultiInputFlowUploadFunction,
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
   * Execute a flow with the provided input data.
   *
   * The input type and execution behavior depends on the generic TInput type:
   * - File/Blob: Initiates chunked upload with progress tracking
   * - string (URL): Directly passes URL to flow for fetching
   * - object: Passes structured data to flow input nodes
   *
   * @param input - Input data for the flow execution (type determined by TInput generic)
   *
   * @example
   * ```typescript
   * // File upload
   * await manager.upload(fileObject);
   *
   * // URL fetch
   * await manager.upload("https://example.com/image.jpg");
   * ```
   */
  async upload(input: TInput): Promise<void> {
    // Determine totalBytes from input if possible (File/Blob on browser platforms)
    // For non-file inputs (URLs, structured data), totalBytes remains null
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

    // Abort all input-specific controllers
    for (const inputState of this.inputStates.values()) {
      if (inputState.abortController) {
        inputState.abortController.abort();
      }
    }
    this.inputStates.clear();

    this.state = { ...initialState };
    this.callbacks.onStateChange(this.state);
  }

  /**
   * Aggregate progress across multiple inputs.
   * Uses simple average for Phase 1 (size-weighted can be added in Phase 2).
   */
  private aggregateProgress(): void {
    if (this.inputStates.size === 0) {
      return;
    }

    const states = Array.from(this.inputStates.values());

    // Calculate average progress across all inputs
    const totalProgress = states.reduce(
      (sum, state) => sum + state.progress,
      0,
    );
    const avgProgress = Math.round(totalProgress / states.length);

    // Calculate total bytes (sum of all inputs)
    const totalBytes = states.reduce(
      (sum, state) => sum + (state.totalBytes || 0),
      0,
    );
    const bytesUploaded = states.reduce(
      (sum, state) => sum + state.bytesUploaded,
      0,
    );

    this.updateState({
      progress: avgProgress,
      bytesUploaded,
      totalBytes: totalBytes > 0 ? totalBytes : null,
    });
  }

  /**
   * Execute a flow with multiple inputs (generic execution path).
   *
   * This method:
   * 1. Builds FlowInputs with auto-detection
   * 2. Validates inputs (optional, to be added in integration)
   * 3. Executes flow with the inputs
   * 4. Tracks multi-input state
   *
   * @param inputs - Map of nodeId to raw input data
   *
   * @example
   * ```typescript
   * await manager.executeFlow({
   *   "file-input": myFile,
   *   "url-input": "https://example.com/image.jpg"
   * });
   * ```
   */
  async executeFlow(inputs: Record<string, unknown>): Promise<void> {
    const inputEntries = Object.entries(inputs);

    if (inputEntries.length === 0) {
      throw new Error("No inputs provided to executeFlow");
    }

    // Initialize input states for tracking
    this.inputStates.clear();
    for (const [nodeId, data] of Object.entries(inputs)) {
      const inputType = detectInputType(data);
      this.inputStates.set(nodeId, {
        nodeId,
        type: inputType,
        status: "pending",
        progress: 0,
        bytesUploaded: 0,
        totalBytes:
          inputType === "file" &&
          data &&
          typeof data === "object" &&
          "size" in data &&
          typeof data.size === "number"
            ? data.size
            : null,
        error: null,
        abortController: null,
      });
    }

    // For single input, use the standard upload path
    if (inputEntries.length === 1) {
      const firstEntry = inputEntries[0];
      if (!firstEntry) {
        throw new Error("No inputs provided to executeFlow");
      }
      const [, firstData] = firstEntry;
      await this.upload(firstData as TInput);
      return;
    }

    // For multiple inputs, use the multi-input upload function
    if (!this.multiInputUploadFn) {
      throw new Error(
        "Multi-input flows require multiInputUploadFn to be provided in FlowManager constructor. " +
          "Platform packages should implement MultiInputFlowUploadFunction.",
      );
    }

    // Reset state for multi-input flow
    this.updateState({
      status: "uploading",
      progress: 0,
      bytesUploaded: 0,
      totalBytes: null,
      error: null,
      jobId: null,
      flowStarted: false,
      currentNodeName: null,
      currentNodeType: null,
      flowOutputs: null,
    });

    try {
      // Build internal options with callbacks
      const internalOptions: InternalFlowUploadOptions = {
        onJobStart: (jobId: string) => {
          this.updateState({ jobId });
          this.options?.onJobStart?.(jobId);
        },
        onProgress: (
          uploadId: string,
          bytesUploaded: number,
          totalBytes: number | null,
        ) => {
          // Global progress tracking (will be overridden by aggregateProgress)
          this.options?.onProgress?.(uploadId, bytesUploaded, totalBytes);
        },
        onSuccess: (_result: UploadFile) => {
          // Flow completion is handled by FlowEnd event
          this.updateState({ progress: 100 });
        },
        onError: (error: Error) => {
          this.updateState({ status: "error", error });
          this.callbacks.onError?.(error);
          this.options?.onError?.(error);
          this.abortController = null;
        },
        onAbort: () => {
          this.updateState({ status: "aborted" });
          this.callbacks.onAbort?.();
          this.options?.onAbort?.();
          this.abortController = null;
        },
        onShouldRetry: this.options?.onShouldRetry,
      };

      // Multi-input callbacks for per-input tracking
      const multiInputCallbacks: MultiInputCallbacks = {
        onInputProgress: (nodeId, progress, bytesUploaded, totalBytes) => {
          // Update input state
          const inputState = this.inputStates.get(nodeId);
          if (inputState) {
            inputState.status = "uploading";
            inputState.progress = progress;
            inputState.bytesUploaded = bytesUploaded;
            inputState.totalBytes = totalBytes;
          }

          // Aggregate progress across all inputs
          this.aggregateProgress();
        },
        onInputComplete: (nodeId) => {
          const inputState = this.inputStates.get(nodeId);
          if (inputState) {
            inputState.status = "complete";
            inputState.progress = 100;
          }
          this.aggregateProgress();
        },
        onInputError: (nodeId, error) => {
          const inputState = this.inputStates.get(nodeId);
          if (inputState) {
            inputState.status = "error";
            inputState.error = error;
          }
        },
      };

      // Execute multi-input flow
      this.abortController = await this.multiInputUploadFn(
        inputs,
        this.options.flowConfig,
        internalOptions,
        multiInputCallbacks,
      );
    } catch (error) {
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
   * Get the input execution states (for multi-input flows).
   * @returns Map of nodeId to input state
   */
  getInputStates(): ReadonlyMap<string, InputExecutionState> {
    return this.inputStates;
  }

  /**
   * Clean up resources (call when disposing the manager)
   */
  cleanup(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Cleanup input-specific controllers
    for (const inputState of this.inputStates.values()) {
      if (inputState.abortController) {
        inputState.abortController.abort();
      }
    }
    this.inputStates.clear();
  }
}
