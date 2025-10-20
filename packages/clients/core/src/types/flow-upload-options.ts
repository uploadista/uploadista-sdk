import type { UploadFile } from "@uploadista/core/types";
import type { FlowUploadConfig } from "./flow-upload-config";

export interface FlowUploadOptions<TOutput = UploadFile> {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Called when upload progress updates
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
   * Called when the flow completes successfully (receives full flow outputs)
   * This is the recommended callback for multi-output flows
   * Format: { [outputNodeId]: result, ... }
   */
  onFlowComplete?: (outputs: Record<string, unknown>) => void;

  /**
   * Called when upload succeeds (legacy, single-output flows)
   * For single-output flows, receives the value from the specified outputNodeId
   * or the first output node if outputNodeId is not specified
   */
  onSuccess?: (result: TOutput) => void;

  /**
   * Called when upload fails
   */
  onError?: (error: Error) => void;

  /**
   * Called when upload is aborted
   */
  onAbort?: () => void;

  /**
   * Custom retry logic
   */
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}
