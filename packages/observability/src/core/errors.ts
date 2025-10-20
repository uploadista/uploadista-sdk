import { Effect, Metric } from "effect";
import type { StorageMetrics } from "./metrics.js";

// ============================================================================
// Generic Storage Error Classification and Tracking
// ============================================================================

export type StorageErrorCategory =
  | "network_error"
  | "authentication_error"
  | "authorization_error"
  | "throttling_error"
  | "server_error"
  | "client_error"
  | "unknown_error";

// Generic error classifier - can be extended per storage type
export const classifyStorageError = (error: unknown): StorageErrorCategory => {
  if (!error || typeof error !== "object") return "unknown_error";

  const errorCode = "code" in error ? error.code : undefined;
  const errorName = "name" in error ? error.name : undefined;
  const errorMessage =
    error instanceof Error ? error.message.toLowerCase() : "";

  // Network errors (common across all storage types)
  if (
    errorCode === "NetworkError" ||
    errorCode === "ECONNRESET" ||
    errorCode === "ENOTFOUND" ||
    errorCode === "ETIMEDOUT" ||
    errorMessage.indexOf("network") >= 0 ||
    errorMessage.indexOf("timeout") >= 0
  ) {
    return "network_error";
  }

  // Authentication errors (common patterns)
  if (
    errorCode === "InvalidAccessKeyId" ||
    errorCode === "SignatureDoesNotMatch" ||
    errorCode === "TokenRefreshRequired" ||
    errorCode === "AuthenticationFailed" ||
    errorName === "AuthenticationError" ||
    errorMessage.indexOf("authentication") >= 0 ||
    errorMessage.indexOf("unauthorized") >= 0
  ) {
    return "authentication_error";
  }

  // Authorization errors
  if (
    errorCode === "AccessDenied" ||
    errorCode === "AccountProblem" ||
    errorCode === "Forbidden" ||
    errorName === "AuthorizationError" ||
    errorMessage.indexOf("forbidden") >= 0 ||
    errorMessage.indexOf("permission") >= 0
  ) {
    return "authorization_error";
  }

  // Throttling errors
  if (
    errorCode === "SlowDown" ||
    errorCode === "RequestTimeTooSkewed" ||
    errorCode === "TooManyRequests" ||
    errorName === "ThrottlingError" ||
    errorMessage.indexOf("throttl") >= 0 ||
    errorMessage.indexOf("rate limit") >= 0
  ) {
    return "throttling_error";
  }

  // Server errors
  if (
    errorCode === "InternalError" ||
    errorCode === "ServiceUnavailable" ||
    errorCode === "InternalServerError" ||
    errorName === "ServerError" ||
    errorMessage.indexOf("server error") >= 0 ||
    errorMessage.indexOf("service unavailable") >= 0
  ) {
    return "server_error";
  }

  // Client errors
  if (
    errorCode === "InvalidRequest" ||
    errorCode === "MalformedXML" ||
    errorCode === "RequestEntityTooLarge" ||
    errorCode === "BadRequest" ||
    errorName === "ClientError" ||
    errorMessage.indexOf("bad request") >= 0 ||
    errorMessage.indexOf("invalid") >= 0
  ) {
    return "client_error";
  }

  return "unknown_error";
};

// Storage-specific error classifier factory
export const createStorageErrorClassifier = (
  storageType: string,
  customErrorMapping?: (error: unknown) => StorageErrorCategory | null,
) => {
  return (error: unknown): StorageErrorCategory => {
    // Try custom mapping first
    if (customErrorMapping) {
      const customResult = customErrorMapping(error);
      if (customResult !== null) return customResult;
    }

    // Fall back to generic classification
    return classifyStorageError(error);
  };
};

// Generic error tracking function
export const trackStorageError = (
  storageType: string,
  metrics: StorageMetrics,
  operation: string,
  error: unknown,
  context: Record<string, unknown> = {},
  errorClassifier = classifyStorageError,
) =>
  Effect.gen(function* () {
    const errorCategory = errorClassifier(error);

    // Record error metrics
    const errorMetric = metrics.uploadErrorsTotal.pipe(
      Metric.tagged("operation", operation),
      Metric.tagged("error_category", errorCategory),
    );
    yield* errorMetric(Effect.succeed(1));

    // Create detailed error context
    const errorDetails = {
      storage_type: storageType,
      operation,
      error_category: errorCategory,
      error_type: typeof error,
      error_message: error instanceof Error ? error.message : String(error),
      error_code:
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined,
      error_name:
        error && typeof error === "object" && "name" in error
          ? error.name
          : undefined,
      ...context,
    };

    // Log structured error
    yield* Effect.logError(
      `${storageType.toUpperCase()} ${operation} failed`,
    ).pipe(Effect.annotateLogs(errorDetails));
  });

// Factory for storage-specific error tracking
export const createStorageErrorTracker = (
  storageType: string,
  metrics: StorageMetrics,
  customErrorClassifier?: (error: unknown) => StorageErrorCategory | null,
) => {
  const errorClassifier = createStorageErrorClassifier(
    storageType,
    customErrorClassifier,
  );

  return (
    operation: string,
    error: unknown,
    context: Record<string, unknown> = {},
  ) =>
    trackStorageError(
      storageType,
      metrics,
      operation,
      error,
      context,
      errorClassifier,
    );
};
