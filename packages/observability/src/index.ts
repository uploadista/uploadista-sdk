// Main observability package exports
export * from "./core/index.js";
export * from "./flow/index.js";
export * from "./service/metrics.js";
export * from "./storage/index.js";
// Convenience re-exports for common use cases
export {
  logS3Context,
  logS3Operation,
  logS3UploadCompletion,
  logS3UploadProgress,
  S3ObservabilityLayer,
  S3TracingLayer,
  s3ActiveUploadsGauge,
  s3ApiCallsTotal,
  s3FileSizeHistogram,
  // S3 specific
  s3Metrics,
  s3UploadDurationHistogram,
  // Individual S3 metrics
  s3UploadRequestsTotal,
  trackS3Error,
  withS3ApiMetrics,
  withS3OperationMetrics,
  withS3Span,
  withS3TimingMetrics,
  withS3UploadMetrics,
} from "./storage/s3.js";
export * from "./upload/index.js";
