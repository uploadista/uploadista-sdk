import type { UploadFile } from "@uploadista/core";

/**
 * Discriminated union representing the result of an upload operation.
 *
 * Provides a type-safe way to handle the three possible outcomes of an upload:
 * success, error, or cancellation. This pattern enables exhaustive checking
 * of all cases at compile time.
 *
 * @template TOutput - The type of the successful result value. Defaults to UploadFile
 *
 * @example Handling upload results
 * ```typescript
 * function handleUploadResult(result: UploadResult) {
 *   switch (result.type) {
 *     case 'success':
 *       console.log('Upload complete:', result.value.id);
 *       break;
 *     case 'error':
 *       console.error('Upload failed:', result.error.message);
 *       break;
 *     case 'cancelled':
 *       console.log('Upload was cancelled by user');
 *       break;
 *   }
 * }
 * ```
 *
 * @example With custom output type
 * ```typescript
 * interface ProcessedImage {
 *   url: string;
 *   width: number;
 *   height: number;
 * }
 *
 * const result: UploadResult<ProcessedImage> = await uploadAndProcess(file);
 *
 * if (result.type === 'success') {
 *   console.log(`Image processed: ${result.value.width}x${result.value.height}`);
 * }
 * ```
 */
export type UploadResult<TOutput = UploadFile> =
  | {
      /** Indicates the upload completed successfully */
      type: "success";
      /** The successful result value (e.g., upload metadata or processed output) */
      value: TOutput;
    }
  | {
      /** Indicates the upload failed with an error */
      type: "error";
      /** The error that caused the upload to fail */
      error: Error;
    }
  | {
      /** Indicates the upload was cancelled by the user or application */
      type: "cancelled";
    };
