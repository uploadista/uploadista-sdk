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
// S3-Specific Observability
// ============================================================================

const STORAGE_TYPE = "s3";

// S3-specific metrics
export const s3Metrics = createStorageMetrics(STORAGE_TYPE);

// S3-specific tracing layer
export const S3TracingLayer = createStorageTracingLayer(STORAGE_TYPE);

// S3-specific error classification
const classifyS3Error = (error: unknown): StorageErrorCategory | null => {
  if (!error || typeof error !== "object") return null;

  const errorCode = "code" in error ? error.code : undefined;
  if (!errorCode) return null;

  // S3-specific error codes
  switch (errorCode) {
    case "NoSuchKey":
    case "NoSuchBucket":
    case "NoSuchUpload":
      return "client_error";
    case "BucketAlreadyExists":
    case "BucketNotEmpty":
      return "client_error";
    case "InvalidBucketName":
    case "InvalidPart":
    case "InvalidPartOrder":
      return "client_error";
    case "EntityTooSmall":
    case "EntityTooLarge":
      return "client_error";
    case "ExpiredToken":
    case "TokenRefreshRequired":
      return "authentication_error";
    case "RequestTimeTooSkewed":
    case "SlowDown":
      return "throttling_error";
    default:
      return null; // Fall back to generic classification
  }
};

// S3-specific error tracker
export const trackS3Error = createStorageErrorTracker(
  STORAGE_TYPE,
  s3Metrics,
  classifyS3Error,
);

// S3-specific observability layer
export const S3ObservabilityLayer = Layer.mergeAll(
  S3TracingLayer,
  // Metrics are automatically available through Effect
);

// ============================================================================
// S3 Utility Functions
// ============================================================================

export const withS3UploadMetrics = <A, E, R>(
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
) => withUploadMetrics(s3Metrics, uploadId, effect);

export const withS3ApiMetrics = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) => withApiMetrics(s3Metrics, operation, effect);

export const withS3TimingMetrics = withTimingMetrics;

export const withS3OperationMetrics = <A, E, R>(
  operation: string,
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
  fileSize?: number,
) =>
  withStorageOperationMetrics(s3Metrics, operation, uploadId, effect, fileSize);

// S3-specific span wrapper
export const withS3Span =
  <A, E, R>(operation: string, attributes?: Record<string, unknown>) =>
  (effect: Effect.Effect<A, E, R>) =>
    withStorageSpan(operation, STORAGE_TYPE, attributes)(effect);

// S3-specific logging functions
export const logS3Operation = logStorageOperation.bind(null, STORAGE_TYPE);
export const logS3UploadProgress = logUploadProgress.bind(null, STORAGE_TYPE);
export const logS3UploadCompletion = logUploadCompletion.bind(
  null,
  STORAGE_TYPE,
);
export const logS3Context = logWithContext;

// Export metrics for external access
export const {
  uploadRequestsTotal: s3UploadRequestsTotal,
  uploadPartsTotal: s3UploadPartsTotal,
  uploadSuccessTotal: s3UploadSuccessTotal,
  uploadErrorsTotal: s3UploadErrorsTotal,
  apiCallsTotal: s3ApiCallsTotal,
  uploadDurationHistogram: s3UploadDurationHistogram,
  partUploadDurationHistogram: s3PartUploadDurationHistogram,
  fileSizeHistogram: s3FileSizeHistogram,
  partSizeHistogram: s3PartSizeHistogram,
  activeUploadsGauge: s3ActiveUploadsGauge,
  uploadThroughputGauge: s3UploadThroughputGauge,
  uploadLatencySummary: s3UploadLatencySummary,
} = s3Metrics;

// Type exports
export type S3Metrics = StorageMetrics;
