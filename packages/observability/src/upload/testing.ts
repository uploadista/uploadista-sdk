import { Layer } from "effect";
import { UploadObservability } from "../core/layers.js";
import { createUploadServerMetrics } from "./metrics.js";

// ============================================================================
// Upload Observability Testing Utilities
// ============================================================================

/**
 * Create a test upload observability layer that doesn't actually emit metrics
 * but validates that the observability system is wired correctly
 */
export const UploadObservabilityTest = Layer.succeed(UploadObservability, {
  serviceName: "uploadista-upload-server-test",
  enabled: true,
  metrics: {
    uploadCreated: () => Promise.resolve(),
    uploadCompleted: () => Promise.resolve(),
    uploadFailed: () => Promise.resolve(),
    chunkUploaded: () => Promise.resolve(),
  } as any,
});

/**
 * Get metrics for validation (useful for testing metric definitions)
 */
export const getTestMetrics = () => createUploadServerMetrics();

/**
 * Validate that all required metrics exist
 */
export const validateMetricsExist = () => {
  const metrics = getTestMetrics();

  const requiredMetrics = [
    "uploadCreatedTotal",
    "uploadCompletedTotal",
    "uploadFailedTotal",
    "chunkUploadedTotal",
    "uploadFromUrlTotal",
    "uploadFromUrlSuccessTotal",
    "uploadFromUrlFailedTotal",
    "uploadDurationHistogram",
    "chunkUploadDurationHistogram",
    "uploadFileSizeHistogram",
    "chunkSizeHistogram",
    "activeUploadsGauge",
    "uploadThroughputGauge",
    "uploadLatencySummary",
    "chunkLatencySummary",
  ];

  const missingMetrics = requiredMetrics.filter((name) => !(name in metrics));

  if (missingMetrics.length > 0) {
    throw new Error(`Missing required metrics: ${missingMetrics.join(", ")}`);
  }

  return true;
};
