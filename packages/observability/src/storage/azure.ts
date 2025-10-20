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
// Azure Blob Storage-Specific Observability
// ============================================================================

const STORAGE_TYPE = "azure";

// Azure-specific metrics
export const azureMetrics = createStorageMetrics(STORAGE_TYPE);

// Azure-specific tracing layer
export const AzureTracingLayer = createStorageTracingLayer(STORAGE_TYPE);

// Azure-specific error classification
const classifyAzureError = (error: unknown): StorageErrorCategory | null => {
  if (!error || typeof error !== "object") return null;

  const errorCode =
    "code" in error
      ? error.code
      : "statusCode" in error
        ? error.statusCode
        : undefined;
  if (!errorCode) return null;

  // Azure-specific error codes
  switch (errorCode) {
    case "BlobNotFound":
    case "ContainerNotFound":
    case "InvalidBlobOrBlock":
      return "client_error";
    case "ContainerAlreadyExists":
    case "BlobAlreadyExists":
      return "client_error";
    case "InvalidBlockId":
    case "InvalidBlockList":
    case "InvalidBlobType":
      return "client_error";
    case "RequestBodyTooLarge":
    case "InvalidHeaderValue":
      return "client_error";
    case "AuthenticationFailed":
    case "InvalidAuthenticationInfo":
      return "authentication_error";
    case "AccountIsDisabled":
      return "authorization_error";
    case "InsufficientAccountPermissions":
      return "authorization_error";
    case "OperationTimedOut":
    case "ServerBusy":
    case "InternalError":
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

// Azure-specific error tracker
export const trackAzureError = createStorageErrorTracker(
  STORAGE_TYPE,
  azureMetrics,
  classifyAzureError,
);

// Azure-specific observability layer
export const AzureObservabilityLayer = Layer.mergeAll(
  AzureTracingLayer,
  // Metrics are automatically available through Effect
);

// ============================================================================
// Azure Utility Functions
// ============================================================================

export const withAzureUploadMetrics = <A, E, R>(
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
) => withUploadMetrics(azureMetrics, uploadId, effect);

export const withAzureApiMetrics = <A, E, R>(
  operation: string,
  effect: Effect.Effect<A, E, R>,
) => withApiMetrics(azureMetrics, operation, effect);

export const withAzureTimingMetrics = withTimingMetrics;

export const withAzureOperationMetrics = <A, E, R>(
  operation: string,
  uploadId: string,
  effect: Effect.Effect<A, E, R>,
  fileSize?: number,
) =>
  withStorageOperationMetrics(
    azureMetrics,
    operation,
    uploadId,
    effect,
    fileSize,
  );

// Azure-specific span wrapper
export const withAzureSpan =
  <A, E, R>(operation: string, attributes?: Record<string, unknown>) =>
  (effect: Effect.Effect<A, E, R>) =>
    withStorageSpan(operation, STORAGE_TYPE, attributes)(effect);

// Azure-specific logging functions
export const logAzureOperation = logStorageOperation.bind(null, STORAGE_TYPE);
export const logAzureUploadProgress = logUploadProgress.bind(
  null,
  STORAGE_TYPE,
);
export const logAzureUploadCompletion = logUploadCompletion.bind(
  null,
  STORAGE_TYPE,
);
export const logAzureContext = logWithContext;

// Export metrics for external access
export const {
  uploadRequestsTotal: azureUploadRequestsTotal,
  uploadPartsTotal: azureUploadPartsTotal,
  uploadSuccessTotal: azureUploadSuccessTotal,
  uploadErrorsTotal: azureUploadErrorsTotal,
  apiCallsTotal: azureApiCallsTotal,
  uploadDurationHistogram: azureUploadDurationHistogram,
  partUploadDurationHistogram: azurePartUploadDurationHistogram,
  fileSizeHistogram: azureFileSizeHistogram,
  partSizeHistogram: azurePartSizeHistogram,
  activeUploadsGauge: azureActiveUploadsGauge,
  uploadThroughputGauge: azureUploadThroughputGauge,
  uploadLatencySummary: azureUploadLatencySummary,
} = azureMetrics;

// Type exports
export type AzureMetrics = StorageMetrics;
