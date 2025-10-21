/**
 * Specific error types that can occur during upload and flow operations.
 *
 * These error names provide fine-grained categorization of failures,
 * allowing applications to implement targeted error handling and recovery strategies.
 *
 * @example Error handling by type
 * ```typescript
 * try {
 *   await client.upload(file);
 * } catch (error) {
 *   if (error instanceof UploadistaError) {
 *     if (error.isNetworkError()) {
 *       // Retry network-related failures
 *       console.log('Network issue, retrying...');
 *     } else if (error.name === 'UPLOAD_NOT_FOUND') {
 *       // Handle missing upload
 *       console.log('Upload not found, starting fresh');
 *     }
 *   }
 * }
 * ```
 */
export type UploadistaErrorName =
  | "UPLOAD_SIZE_NOT_SPECIFIED"
  | "NETWORK_ERROR"
  | "NETWORK_UNEXPECTED_RESPONSE"
  | "UPLOAD_CHUNK_FAILED"
  | "WRONG_UPLOAD_SIZE"
  | "UPLOAD_LOCKED"
  | "UPLOAD_NOT_FOUND"
  | "CREATE_UPLOAD_FAILED"
  | "DELETE_UPLOAD_FAILED"
  | "PARALLEL_SEGMENT_CREATION_FAILED"
  | "PARALLEL_SEGMENT_UPLOAD_FAILED"
  | "FLOW_NOT_FOUND"
  | "FLOW_INIT_FAILED"
  | "FLOW_RUN_FAILED"
  | "FLOW_CONTINUE_FAILED"
  | "FLOW_UNEXPECTED_STATE"
  | "FLOW_INCOMPATIBLE"
  | "FLOW_NO_UPLOAD_ID"
  | "FLOW_TIMEOUT"
  | "FLOW_FINALIZE_FAILED"
  | "JOB_NOT_FOUND"
  | "WEBSOCKET_AUTH_FAILED";

/**
 * Custom error class for all Uploadista client operations.
 *
 * Extends the standard Error class with additional context including
 * typed error names, HTTP status codes, and underlying error causes.
 * This allows for precise error handling and debugging.
 *
 * @example Basic error handling
 * ```typescript
 * try {
 *   await client.upload(file);
 * } catch (error) {
 *   if (error instanceof UploadistaError) {
 *     console.log(`Error: ${error.name} - ${error.message}`);
 *     console.log(`HTTP Status: ${error.status}`);
 *   }
 * }
 * ```
 *
 * @example Network error detection
 * ```typescript
 * try {
 *   await client.upload(file);
 * } catch (error) {
 *   if (error instanceof UploadistaError && error.isNetworkError()) {
 *     // Implement retry logic for network failures
 *     await retryWithBackoff(() => client.upload(file));
 *   }
 * }
 * ```
 */
export class UploadistaError extends Error {
  /**
   * Typed error name indicating the specific type of failure
   */
  name: UploadistaErrorName;

  /**
   * Human-readable error message describing what went wrong
   */
  message: string;

  /**
   * The underlying error that caused this failure, if any
   */
  cause: Error | undefined;

  /**
   * HTTP status code from the server response, if applicable
   */
  status: number | undefined;

  /**
   * Creates a new UploadistaError instance.
   *
   * @param options - Error configuration
   * @param options.name - Typed error name for categorization
   * @param options.message - Descriptive error message
   * @param options.cause - Optional underlying error that caused this failure
   * @param options.status - Optional HTTP status code from server response
   */
  constructor({
    name,
    message,
    cause,
    status,
  }: {
    name: UploadistaErrorName;
    message: string;
    cause?: Error;
    status?: number;
  }) {
    super();
    this.name = name;
    this.cause = cause;
    this.message = message;
    this.status = status;
  }

  /**
   * Checks if this error is related to network connectivity issues.
   *
   * Network errors are typically transient and may succeed on retry,
   * making them good candidates for automatic retry logic.
   *
   * @returns True if this is a network-related error
   *
   * @example
   * ```typescript
   * if (error.isNetworkError()) {
   *   // Safe to retry
   *   await retry(() => uploadChunk());
   * }
   * ```
   */
  isNetworkError(): boolean {
    return (
      this.name === "NETWORK_ERROR" ||
      this.name === "NETWORK_UNEXPECTED_RESPONSE"
    );
  }
}
