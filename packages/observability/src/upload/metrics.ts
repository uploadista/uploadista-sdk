import { Metric, MetricBoundaries } from "effect";

// ============================================================================
// Upload Server Metrics
// ============================================================================

/**
 * Upload server metrics for tracking upload operations
 */
export const createUploadEngineMetrics = () => ({
  // Counter metrics
  uploadCreatedTotal: Metric.counter("upload_created_total", {
    description: "Total number of uploads created",
  }),

  uploadCompletedTotal: Metric.counter("upload_completed_total", {
    description: "Total number of uploads completed successfully",
  }),

  uploadFailedTotal: Metric.counter("upload_failed_total", {
    description: "Total number of uploads that failed",
  }),

  chunkUploadedTotal: Metric.counter("chunk_uploaded_total", {
    description: "Total number of chunks uploaded",
  }),

  uploadFromUrlTotal: Metric.counter("upload_from_url_total", {
    description: "Total number of URL-based uploads",
  }),

  uploadFromUrlSuccessTotal: Metric.counter("upload_from_url_success_total", {
    description: "Total number of successful URL-based uploads",
  }),

  uploadFromUrlFailedTotal: Metric.counter("upload_from_url_failed_total", {
    description: "Total number of failed URL-based uploads",
  }),

  // Histogram metrics
  uploadDurationHistogram: Metric.histogram(
    "upload_duration_seconds",
    MetricBoundaries.exponential({
      start: 0.01, // 10ms
      factor: 2,
      count: 20, // Up to ~10 seconds
    }),
    "Duration of complete upload operations in seconds",
  ),

  chunkUploadDurationHistogram: Metric.histogram(
    "chunk_upload_duration_seconds",
    MetricBoundaries.exponential({
      start: 0.001, // 1ms
      factor: 2,
      count: 15, // Up to ~32 seconds
    }),
    "Duration of individual chunk uploads in seconds",
  ),

  uploadFileSizeHistogram: Metric.histogram(
    "upload_file_size_bytes",
    MetricBoundaries.exponential({
      start: 1024, // 1KB
      factor: 2,
      count: 25, // Up to ~33GB
    }),
    "Size of uploaded files in bytes",
  ),

  chunkSizeHistogram: Metric.histogram(
    "chunk_size_bytes",
    MetricBoundaries.linear({
      start: 262_144, // 256KB
      width: 262_144, // 256KB increments
      count: 20, // Up to ~5MB
    }),
    "Size of uploaded chunks in bytes",
  ),

  // Gauge metrics
  activeUploadsGauge: Metric.gauge("active_uploads", {
    description: "Number of currently active uploads",
  }),

  uploadThroughputGauge: Metric.gauge("upload_throughput_bytes_per_second", {
    description: "Current upload throughput in bytes per second",
  }),

  // Summary metrics for latency percentiles
  uploadLatencySummary: Metric.summary({
    name: "upload_latency_seconds",
    maxAge: "10 minutes",
    maxSize: 1000,
    error: 0.01,
    quantiles: [0.5, 0.9, 0.95, 0.99],
    description: "Upload operation latency percentiles",
  }),

  chunkLatencySummary: Metric.summary({
    name: "chunk_latency_seconds",
    maxAge: "10 minutes",
    maxSize: 1000,
    error: 0.01,
    quantiles: [0.5, 0.9, 0.95, 0.99],
    description: "Chunk upload latency percentiles",
  }),
});

/**
 * Type for upload server metrics
 */
export type UploadEngineMetrics = ReturnType<typeof createUploadEngineMetrics>;

/**
 * Default upload server metrics instance
 */
export const uploadEngineMetrics = createUploadEngineMetrics();
