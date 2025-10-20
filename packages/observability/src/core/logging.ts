import { Effect } from "effect";

// ============================================================================
// Enhanced Logging Helpers (Storage-agnostic)
// ============================================================================

export const logWithContext = (
  message: string,
  context: Record<string, unknown>,
) => Effect.log(message).pipe(Effect.annotateLogs(context));

export const logUploadProgress = (
  storageType: string,
  uploadId: string,
  progress: {
    uploadedBytes: number;
    totalBytes: number;
    partNumber?: number;
    speed?: number;
  },
) =>
  logWithContext("Upload progress", {
    storage_type: storageType,
    upload_id: uploadId,
    uploaded_bytes: progress.uploadedBytes,
    total_bytes: progress.totalBytes,
    progress_percentage: Math.round(
      (progress.uploadedBytes / progress.totalBytes) * 100,
    ),
    ...(progress.partNumber && { part_number: progress.partNumber }),
    ...(progress.speed && { upload_speed_bps: progress.speed }),
  });

export const logStorageOperation = (
  storageType: string,
  operation: string,
  uploadId: string,
  metadata?: Record<string, unknown>,
) =>
  logWithContext(`${storageType.toUpperCase()} ${operation}`, {
    storage_type: storageType,
    operation,
    upload_id: uploadId,
    ...metadata,
  });

export const logUploadCompletion = (
  storageType: string,
  uploadId: string,
  metrics: {
    fileSize: number;
    totalDurationMs: number;
    partsCount?: number;
    averagePartSize?: number;
    throughputBps?: number;
    retryCount?: number;
  },
) => {
  const throughputMBps = metrics.throughputBps
    ? metrics.throughputBps / (1024 * 1024)
    : 0;

  return logWithContext(`${storageType.toUpperCase()} upload completed`, {
    storage_type: storageType,
    upload_id: uploadId,
    file_size_bytes: metrics.fileSize,
    file_size_mb: Math.round((metrics.fileSize / (1024 * 1024)) * 100) / 100,
    total_duration_ms: metrics.totalDurationMs,
    total_duration_seconds:
      Math.round((metrics.totalDurationMs / 1000) * 100) / 100,
    throughput_bps: metrics.throughputBps,
    throughput_mbps: Math.round(throughputMBps * 100) / 100,
    ...(metrics.partsCount && { parts_count: metrics.partsCount }),
    ...(metrics.averagePartSize && {
      average_part_size_bytes: metrics.averagePartSize,
      average_part_size_mb:
        Math.round((metrics.averagePartSize / (1024 * 1024)) * 100) / 100,
    }),
    ...(metrics.retryCount && { retry_count: metrics.retryCount }),
  });
};
