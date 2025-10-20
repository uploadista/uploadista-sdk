import { Metric, MetricBoundaries } from "effect";

// ============================================================================
// Core Storage Metrics (reusable across all storage types)
// ============================================================================

// Counter metrics
export const createUploadMetrics = (storageType: string) => ({
  uploadRequestsTotal: Metric.counter(`${storageType}_upload_requests_total`, {
    description: `Total number of upload requests for ${storageType}`,
  }),

  uploadPartsTotal: Metric.counter(`${storageType}_upload_parts_total`, {
    description: `Total number of individual parts uploaded for ${storageType}`,
  }),

  uploadSuccessTotal: Metric.counter(`${storageType}_upload_success_total`, {
    description: `Total number of successful uploads for ${storageType}`,
  }),

  uploadErrorsTotal: Metric.counter(`${storageType}_upload_errors_total`, {
    description: `Total number of upload errors for ${storageType}`,
  }),

  apiCallsTotal: Metric.counter(`${storageType}_api_calls_total`, {
    description: `Total number of API calls for ${storageType}`,
  }),
});

// Histogram metrics for timing and sizes (reusable)
export const createUploadHistograms = (storageType: string) => ({
  uploadDurationHistogram: Metric.histogram(
    `${storageType}_upload_duration_seconds`,
    MetricBoundaries.exponential({
      start: 0.01, // 10ms
      factor: 2,
      count: 20, // Up to ~10 seconds
    }),
    `Duration of upload operations in seconds for ${storageType}`,
  ),

  partUploadDurationHistogram: Metric.histogram(
    `${storageType}_part_upload_duration_seconds`,
    MetricBoundaries.exponential({
      start: 0.001, // 1ms
      factor: 2,
      count: 15, // Up to ~32 seconds
    }),
    `Duration of individual part uploads in seconds for ${storageType}`,
  ),

  fileSizeHistogram: Metric.histogram(
    `${storageType}_file_size_bytes`,
    MetricBoundaries.exponential({
      start: 1024, // 1KB
      factor: 2,
      count: 25, // Up to ~33GB
    }),
    `Size of uploaded files in bytes for ${storageType}`,
  ),

  partSizeHistogram: Metric.histogram(
    `${storageType}_part_size_bytes`,
    MetricBoundaries.linear({
      start: 5_242_880, // 5MB (minimum part size)
      width: 1_048_576, // 1MB increments
      count: 20, // Up to ~25MB
    }),
    `Size of upload parts in bytes for ${storageType}`,
  ),
});

// Gauge metrics for current state (reusable)
export const createUploadGauges = (storageType: string) => ({
  activeUploadsGauge: Metric.gauge(`${storageType}_active_uploads`, {
    description: `Number of currently active uploads for ${storageType}`,
  }),

  uploadThroughputGauge: Metric.gauge(
    `${storageType}_upload_throughput_bytes_per_second`,
    {
      description: `Current upload throughput in bytes per second for ${storageType}`,
    },
  ),
});

// Summary metrics for percentiles (reusable)
export const createUploadSummaries = (storageType: string) => ({
  uploadLatencySummary: Metric.summary({
    name: `${storageType}_upload_latency_seconds`,
    maxAge: "10 minutes",
    maxSize: 1000,
    error: 0.01,
    quantiles: [0.5, 0.9, 0.95, 0.99],
    description: `Upload latency percentiles for ${storageType}`,
  }),
});

// Combined metrics factory
export const createStorageMetrics = (storageType: string) => ({
  ...createUploadMetrics(storageType),
  ...createUploadHistograms(storageType),
  ...createUploadGauges(storageType),
  ...createUploadSummaries(storageType),
});

// Type for storage metrics
export type StorageMetrics = ReturnType<typeof createStorageMetrics>;
