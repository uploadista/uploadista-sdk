import { type Effect, Layer } from "effect";
import {
  createStorageErrorTracker,
  type StorageErrorCategory,
} from "../core/errors.js";
import {
  logStorageOperation,
  logUploadCompletion,
  logUploadProgress,
  logWithContext,
} from "../core/logging.js";
import { createStorageMetrics, type StorageMetrics } from "../core/metrics.js";
import { createStorageTracingLayer, withStorageSpan } from "../core/tracing.js";
import {
  withApiMetrics,
  withStorageOperationMetrics,
  withTimingMetrics,
  withUploadMetrics,
} from "../core/utilities.js";

// ============================================================================
// Google Cloud Storage-Specific Observability
// ============================================================================

const STORAGE_TYPE = "gcs";

// GCS-specific metrics
export const gcsMetrics = createStorageMetrics(STORAGE_TYPE);

// GCS-specific tracing layer
export const GCSTracingLayer = createStorageTracingLayer(STORAGE_TYPE);

// GCS-specific error classification
const classifyGCSError = (error: unknown): StorageErrorCategory | null => {
  if (!error || typeof error !== "object") return null;

  const errorCode =
    "code" in error ? error.code : "status" in error ? error.status : undefined;
  if (!errorCode) return null;

  // GCS-specific error codes
  switch (errorCode) {
    case "NoSuchBucket":
    case "NoSuchKey":
    case "NoSuchUpload":
      return "client_error";
    case "BucketAlreadyOwnedByYou":
    case "BucketNotEmpty":
      return "client_error";
    case "InvalidBucketName":
    case "InvalidArgument":
    case "InvalidPart":
    case "InvalidPartOrder":
      return "client_error";
    case "EntityTooSmall":
    case "EntityTooLarge":
      return "client_error";
    case "MalformedPolicy":
      return "client_error";
    case "Unauthorized":
    case "AuthenticationRequired":
      return "authentication_error";
    case "Forbidden":
    case "AccessDenied":
      return "authorization_error";
    case "TooManyRequests":
    case "RateLimitExceeded":
      return "throttling_error";
    case "InternalError":
    case "ServiceUnavailable":
    case "BackendError":
      return "server_error";
    default:
      // Check for HTTP status codes
      if (typeof errorCode === "number") {
        if (errorCode >= 500) return "server_error";
        if (errorCode === 429) return "throttling_error";
        if (errorCode === 403) return "authorization_error";
        if (errorCode === 401) return "authentication_error";
        if (errorCode >= 400) return "client_error";
      }
      return null; // Fall back to generic classification
  }
};

// GCS-specific error tracker
export const trackGCSError = createStorageErrorTracker(
  STORAGE_TYPE,
  gcsMetrics,
  classifyGCSError,
);

// GCS-specific observability layer
export const GCSObservabilityLayer = Layer.mergeAll(
  GCSTracingLayer,
  // Metrics are automatically available through Effect
);

// ============================================================================
// GCS Utility Functions
// ============================================================================

export const withGCSUploadMetrics = <A, E, R>(
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
) => withUploadMetrics(gcsMetrics, uploadId, effect);

export const withGCSApiMetrics = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) => withApiMetrics(gcsMetrics, operation, effect);

export const withGCSTimingMetrics = withTimingMetrics;

export const withGCSOperationMetrics = <A, E, R>(
  operation: string,
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
  fileSize?: number,
) =>
  withStorageOperationMetrics(
    gcsMetrics,
    operation,
    uploadId,
    effect,
    fileSize,
  );

// GCS-specific span wrapper
export const withGCSSpan =
  <A, E, R>(operation: string, attributes?: Record<string, unknown>) =>
  (effect: Effect.Effect<A, E, R>) =>
    withStorageSpan(operation, STORAGE_TYPE, attributes)(effect);

// GCS-specific logging functions
export const logGCSOperation = logStorageOperation.bind(null, STORAGE_TYPE);
export const logGCSUploadProgress = logUploadProgress.bind(null, STORAGE_TYPE);
export const logGCSUploadCompletion = logUploadCompletion.bind(
  null,
  STORAGE_TYPE,
);
export const logGCSContext = logWithContext;

// Export metrics for external access
export const {
  uploadRequestsTotal: gcsUploadRequestsTotal,
  uploadPartsTotal: gcsUploadPartsTotal,
  uploadSuccessTotal: gcsUploadSuccessTotal,
  uploadErrorsTotal: gcsUploadErrorsTotal,
  apiCallsTotal: gcsApiCallsTotal,
  uploadDurationHistogram: gcsUploadDurationHistogram,
  partUploadDurationHistogram: gcsPartUploadDurationHistogram,
  fileSizeHistogram: gcsFileSizeHistogram,
  partSizeHistogram: gcsPartSizeHistogram,
  activeUploadsGauge: gcsActiveUploadsGauge,
  uploadThroughputGauge: gcsUploadThroughputGauge,
  uploadLatencySummary: gcsUploadLatencySummary,
} = gcsMetrics;

// Type exports
export type GCSMetrics = StorageMetrics;
