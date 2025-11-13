import type { TypedOutput } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";
import type { FlowUploadConfig } from "./flow-upload-config";

export interface FlowUploadOptions<TOutput = UploadFile> {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Called when the flow job starts
   * @param jobId - The unique identifier for the flow job
   */
  onJobStart?: (jobId: string) => void;

  /**
   * Called when upload progress updates
   *
   * @param uploadId - The unique identifier for this upload
   * @param bytesUploaded - Number of bytes uploaded so far
   * @param totalBytes - Total bytes to upload, null if unknown/deferred
   */
  onProgress?: (
    uploadId: string,
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
   * This is the recommended callback for multi-output flows.
   * Each output includes nodeId, optional nodeType, data, and timestamp.
   *
   * @param outputs - Array of typed outputs from all output nodes
   *
   * @example
   * ```typescript
   * onFlowComplete: (outputs) => {
   *   // Access all outputs with type information
   *   for (const output of outputs) {
   *     if (output.nodeType === 'storage-output-v1') {
   *       console.log('Storage output:', output.data);
   *     }
   *   }
   * }
   * ```
   */
  onFlowComplete?: (outputs: TypedOutput[]) => void;

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
