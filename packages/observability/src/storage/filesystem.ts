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
// Filesystem Storage-Specific Observability
// ============================================================================

const STORAGE_TYPE = "filesystem";

// Filesystem-specific metrics
export const filesystemMetrics = createStorageMetrics(STORAGE_TYPE);

// Filesystem-specific tracing layer
export const FilesystemTracingLayer = createStorageTracingLayer(STORAGE_TYPE);

// Filesystem-specific error classification
const classifyFilesystemError = (
  error: unknown,
): StorageErrorCategory | null => {
  if (!error || typeof error !== "object") return null;

  const errorCode = "code" in error ? error.code : undefined;
  if (!errorCode) return null;

  // Node.js filesystem error codes
  switch (errorCode) {
    case "ENOENT": // File/directory not found
    case "ENOTDIR": // Not a directory
      return "client_error";
    case "EEXIST": // File/directory already exists
      return "client_error";
    case "EISDIR": // Is a directory
      return "client_error";
    case "EINVAL": // Invalid argument
    case "ENAMETOOLONG": // Filename too long
      return "client_error";
    case "EACCES": // Permission denied
    case "EPERM": // Operation not permitted
      return "authorization_error";
    case "ENOSPC": // No space left on device
    case "EDQUOT": // Disk quota exceeded
      return "server_error";
    case "EIO": // I/O error
    case "EROFS": // Read-only filesystem
    case "EMFILE": // Too many open files
    case "ENFILE": // File table overflow
      return "server_error";
    case "EBUSY": // Device or resource busy
      return "throttling_error";
    default:
      return null; // Fall back to generic classification
  }
};

// Filesystem-specific error tracker
export const trackFilesystemError = createStorageErrorTracker(
  STORAGE_TYPE,
  filesystemMetrics,
  classifyFilesystemError,
);

// Filesystem-specific observability layer
export const FilesystemObservabilityLayer = Layer.mergeAll(
  FilesystemTracingLayer,
  // Metrics are automatically available through Effect
);

// ============================================================================
// Filesystem Utility Functions
// ============================================================================

export const withFilesystemUploadMetrics = <A, E, R>(
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
) => withUploadMetrics(filesystemMetrics, uploadId, effect);

export const withFilesystemApiMetrics = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) => withApiMetrics(filesystemMetrics, operation, effect);

export const withFilesystemTimingMetrics = withTimingMetrics;

export const withFilesystemOperationMetrics = <A, E, R>(
  operation: string,
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
  fileSize?: number,
) =>
  withStorageOperationMetrics(
    filesystemMetrics,
    operation,
    uploadId,
    effect,
    fileSize,
  );

// Filesystem-specific span wrapper
export const withFilesystemSpan =
  <A, E, R>(operation: string, attributes?: Record<string, unknown>) =>
  (effect: Effect.Effect<A, E, R>) =>
    withStorageSpan(operation, STORAGE_TYPE, attributes)(effect);

// Filesystem-specific logging functions
export const logFilesystemOperation = logStorageOperation.bind(
  null,
  STORAGE_TYPE,
);
export const logFilesystemUploadProgress = logUploadProgress.bind(
  null,
  STORAGE_TYPE,
);
export const logFilesystemUploadCompletion = logUploadCompletion.bind(
  null,
  STORAGE_TYPE,
);
export const logFilesystemContext = logWithContext;

// Export metrics for external access
export const {
  uploadRequestsTotal: filesystemUploadRequestsTotal,
  uploadPartsTotal: filesystemUploadPartsTotal,
  uploadSuccessTotal: filesystemUploadSuccessTotal,
  uploadErrorsTotal: filesystemUploadErrorsTotal,
  apiCallsTotal: filesystemApiCallsTotal,
  uploadDurationHistogram: filesystemUploadDurationHistogram,
  partUploadDurationHistogram: filesystemPartUploadDurationHistogram,
  fileSizeHistogram: filesystemFileSizeHistogram,
  partSizeHistogram: filesystemPartSizeHistogram,
  activeUploadsGauge: filesystemActiveUploadsGauge,
  uploadThroughputGauge: filesystemUploadThroughputGauge,
  uploadLatencySummary: filesystemUploadLatencySummary,
} = filesystemMetrics;

// Type exports
export type FilesystemMetrics = StorageMetrics;
