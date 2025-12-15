import { Effect, Metric } from "effect";
import type { UploadEngineMetrics } from "./metrics.js";

// ============================================================================
// Upload Error Classification and Tracking
// ============================================================================

export type UploadErrorCategory =
  | "network_error"
  | "authentication_error"
  | "authorization_error"
  | "validation_error"
  | "size_limit_error"
  | "storage_error"
  | "abort_error"
  | "unknown_error";

/**
 * Classify upload errors into standard categories
 */
export const classifyUploadError = (error: unknown): UploadErrorCategory => {
  if (!error || typeof error !== "object") return "unknown_error";

  const errorCode = "code" in error ? error.code : undefined;
  const errorName = "name" in error ? error.name : undefined;
  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : "";

  // Abort errors
  if (
    errorCode === "ABORTED" ||
    errorName === "AbortError" ||
    errorMessage.includes("abort")
  ) {
    return "abort_error";
  }

  // Size limit errors
  if (
    errorCode === "FILE_TOO_LARGE" ||
    errorCode === "LIMIT_FILE_SIZE" ||
    errorCode === "RequestEntityTooLarge" ||
    errorMessage.includes("too large") ||
    errorMessage.includes("size limit") ||
    errorMessage.includes("max size")
  ) {
    return "size_limit_error";
  }

  // Validation errors
  if (
    errorCode === "INVALID_FILE" ||
    errorCode === "INVALID_METADATA" ||
    errorCode === "VALIDATION_ERROR" ||
    errorMessage.includes("validation") ||
    errorMessage.includes("invalid")
  ) {
    return "validation_error";
  }

  // Network errors
  if (
    errorCode === "NetworkError" ||
    errorCode === "ECONNRESET" ||
    errorCode === "ENOTFOUND" ||
    errorCode === "ETIMEDOUT" ||
    errorMessage.includes("network") ||
    errorMessage.includes("timeout")
  ) {
    return "network_error";
  }

  // Authentication errors
  if (
    errorCode === "UNAUTHORIZED" ||
    errorCode === "AuthenticationFailed" ||
    errorName === "AuthenticationError" ||
    errorMessage.includes("authentication") ||
    errorMessage.includes("unauthorized")
  ) {
    return "authentication_error";
  }

  // Authorization errors
  if (
    errorCode === "FORBIDDEN" ||
    errorCode === "AccessDenied" ||
    errorName === "AuthorizationError" ||
    errorMessage.includes("forbidden") ||
    errorMessage.includes("permission")
  ) {
    return "authorization_error";
  }

  // Storage errors
  if (
    errorCode === "FILE_WRITE_ERROR" ||
    errorCode === "STORAGE_ERROR" ||
    errorMessage.includes("storage") ||
    errorMessage.includes("write error")
  ) {
    return "storage_error";
  }

  return "unknown_error";
};

/**
 * Track upload errors with metrics and structured logging
 */
export const trackUploadError = (
  metrics: UploadEngineMetrics,
  operation: string,
  error: unknown,
  context: Record<string, unknown> = {},
) =>
  Effect.gen(function* () {
    const errorCategory = classifyUploadError(error);

    // Record error metrics
    const errorMetric = metrics.uploadFailedTotal.pipe(
      Metric.tagged("operation", operation),
      Metric.tagged("error_category", errorCategory),
    );
    yield* errorMetric(Effect.succeed(1));

    // Create detailed error context
    const errorDetails = {
      operation,
      error_category: errorCategory,
      error_type: typeof error,
      error_message: error instanceof Error ? error.message : String(error),
      error_code:
        error && typeof error === "object" && "code" in error
          ? String(error.code)
          : undefined,
      error_name:
        error && typeof error === "object" && "name" in error
          ? String(error.name)
          : undefined,
      ...context,
    };

    // Log structured error
    yield* Effect.logError(`Upload ${operation} failed`).pipe(
      Effect.annotateLogs(errorDetails),
    );
  });

/**
 * Create a custom error classifier for upload operations
 */
export const createUploadErrorClassifier = (
  customErrorMapping?: (error: unknown) => UploadErrorCategory | null,
) => {
  return (error: unknown): UploadErrorCategory => {
    // Try custom mapping first
    if (customErrorMapping) {
      const customResult = customErrorMapping(error);
      if (customResult !== null) return customResult;
    }

    // Fall back to generic classification
    return classifyUploadError(error);
  };
};
