import type { UploadFile } from "@uploadista/core/types";
import type { UploadOptions } from "../types/upload-options";

/**
 * Upload status representing the current state of an upload
 */
export type UploadStatus =
  | "idle"
  | "uploading"
  | "success"
  | "error"
  | "aborted";

/**
 * Complete upload state
 */
export interface UploadState {
  /** Current status of the upload */
  status: UploadStatus;
  /** Upload progress percentage (0-100) */
  progress: number;
  /** Number of bytes uploaded */
  bytesUploaded: number;
  /** Total bytes to upload, null if unknown/deferred */
  totalBytes: number | null;
  /** Error if upload failed */
  error: Error | null;
  /** Result if upload succeeded */
  result: UploadFile | null;
}

/**
 * Callbacks that UploadManager invokes during the upload lifecycle
 */
export interface UploadManagerCallbacks {
  /**
   * Called when the upload state changes
   */
  onStateChange: (state: UploadState) => void;

  /**
   * Called when upload progress updates
   * @param progress - Progress percentage (0-100)
   * @param bytesUploaded - Number of bytes uploaded
   * @param totalBytes - Total bytes to upload, null if unknown
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
   * Called when upload completes successfully
   */
  onSuccess?: (result: UploadFile) => void;

  /**
   * Called when upload fails with an error
   */
  onError?: (error: Error) => void;

  /**
   * Called when upload is aborted
   */
  onAbort?: () => void;
}

/**
 * Generic upload input type - can be any value that the upload client accepts
 */
export type UploadInput = unknown;

/**
 * Abort controller interface for canceling uploads
 */
export interface UploadAbortController {
  abort: () => void;
}

/**
 * Upload function that performs the actual upload.
 * Returns a promise that resolves to an abort controller.
 */
export type UploadFunction<TInput = UploadInput> = (
  input: TInput,
  options: UploadOptions,
) => Promise<UploadAbortController>;

/**
 * Initial state for a new upload
 */
const initialState: UploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  error: null,
  result: null,
};

/**
 * Platform-agnostic upload manager that handles upload state machine,
 * progress tracking, error handling, abort, reset, and retry logic.
 *
 * Framework packages (React, Vue, React Native) should wrap this manager
 * with framework-specific hooks/composables.
 *
 * @example
 * ```typescript
 * const uploadFn = (input, options) => client.upload(input, options);
 * const manager = new UploadManager(uploadFn, {
 *   onStateChange: (state) => setState(state),
 *   onProgress: (progress) => console.log(`${progress}%`),
 *   onSuccess: (result) => console.log('Upload complete:', result),
 *   onError: (error) => console.error('Upload failed:', error),
 * });
 *
 * await manager.upload(file);
 * ```
 */
export class UploadManager {
  private state: UploadState;
  private abortController: UploadAbortController | null = null;
  private lastInput: UploadInput | null = null;

  /**
   * Create a new UploadManager
   *
   * @param uploadFn - Upload function to use for uploads
   * @param callbacks - Callbacks to invoke during upload lifecycle
   * @param options - Upload configuration options
   */
  constructor(
    private readonly uploadFn: UploadFunction,
    private readonly callbacks: UploadManagerCallbacks,
    private readonly options?: UploadOptions,
  ) {
    this.state = { ...initialState };
  }

  /**
   * Get the current upload state
   */
  getState(): UploadState {
    return { ...this.state };
  }

  /**
   * Check if an upload is currently active
   */
  isUploading(): boolean {
    return this.state.status === "uploading";
  }

  /**
   * Check if the upload can be retried
   */
  canRetry(): boolean {
    return (
      (this.state.status === "error" || this.state.status === "aborted") &&
      this.lastInput !== null
    );
  }

  /**
   * Update the internal state and notify callbacks
   */
  private updateState(update: Partial<UploadState>): void {
    this.state = { ...this.state, ...update };
    this.callbacks.onStateChange(this.state);
  }

  /**
   * Start uploading a file or input
   *
   * @param input - File or input to upload (type depends on platform)
   */
  async upload(input: UploadInput): Promise<void> {
    // Determine totalBytes from input if possible (File/Blob on browser platforms)
    let totalBytes: number | null = null;
    if (input && typeof input === "object") {
      if ("size" in input && typeof input.size === "number") {
        totalBytes = input.size;
      }
    }

    // Reset state but keep reference for retries
    this.updateState({
      status: "uploading",
      progress: 0,
      bytesUploaded: 0,
      totalBytes,
      error: null,
      result: null,
    });

    this.lastInput = input;

    try {
      // Build complete options with our callbacks
      const uploadOptions: UploadOptions = {
        ...this.options,
        onProgress: (
          progress: number,
          bytesUploaded: number,
          bytes: number | null,
        ) => {
          const progressPercent = bytes
            ? Math.round((bytesUploaded / bytes) * 100)
            : 0;

          this.updateState({
            progress: progressPercent,
            bytesUploaded,
            totalBytes: bytes,
          });

          this.callbacks.onProgress?.(progressPercent, bytesUploaded, bytes);
          this.options?.onProgress?.(progress, bytesUploaded, bytes);
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
        onSuccess: (result: UploadFile) => {
          this.updateState({
            status: "success",
            result,
            progress: 100,
            bytesUploaded: result.size || 0,
            totalBytes: result.size || null,
          });

          this.callbacks.onSuccess?.(result);
          this.options?.onSuccess?.(result);
          this.abortController = null;
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

      // Start the upload
      this.abortController = await this.uploadFn(input, uploadOptions);
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
   * Abort the current upload
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      // Note: State update happens in onAbort callback
    }
  }

  /**
   * Reset the upload state to idle
   */
  reset(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.state = { ...initialState };
    this.lastInput = null;
    this.callbacks.onStateChange(this.state);
  }

  /**
   * Retry the last failed or aborted upload
   */
  retry(): void {
    if (this.canRetry() && this.lastInput !== null) {
      this.upload(this.lastInput);
    }
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
