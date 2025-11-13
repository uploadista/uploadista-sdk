import type { NetworkCondition, NetworkMetrics } from "../network-monitor";
import type { ChunkMetrics } from "./chunk-metrics";
import type { PerformanceInsights } from "./performance-insights";
import type { UploadSessionMetrics } from "./upload-session-metrics";

/**
 * Comprehensive upload metrics interface
 *
 * Provides access to all performance metrics, insights, and network
 * statistics for upload monitoring and optimization.
 *
 * This interface is implemented by all framework packages (React, Vue, React Native)
 * to ensure consistent metrics API across platforms.
 *
 * @example React usage
 * ```tsx
 * const upload = useUpload();
 * const insights = upload.metrics.getInsights();
 * const metrics = upload.metrics.exportMetrics();
 * ```
 *
 * @example Vue usage
 * ```vue
 * <script setup>
 * const upload = useUpload();
 * const insights = upload.metrics.getInsights();
 * </script>
 * ```
 *
 * @example React Native usage
 * ```tsx
 * const upload = useUpload();
 * const networkMetrics = upload.metrics.getNetworkMetrics();
 * ```
 */
export interface UploadMetrics {
  /**
   * Get performance insights from the upload client
   *
   * Provides high-level analysis with recommendations for
   * optimizing upload performance.
   *
   * @returns Performance insights including efficiency scores and recommendations
   *
   * @example
   * ```typescript
   * const insights = metrics.getInsights();
   * console.log(`Efficiency: ${insights.overallEfficiency}%`);
   * console.log(`Recommendations:`, insights.recommendations);
   * ```
   */
  getInsights: () => PerformanceInsights;

  /**
   * Export detailed metrics from the upload client
   *
   * Returns comprehensive metrics including session data,
   * per-chunk statistics, and performance insights.
   *
   * Useful for analytics, debugging, and performance monitoring.
   *
   * @returns Object containing session metrics, chunk metrics, and insights
   *
   * @example
   * ```typescript
   * const metrics = metrics.exportMetrics();
   * console.log(`Uploaded ${metrics.session.totalBytesUploaded} bytes`);
   * console.log(`Average speed: ${metrics.session.averageSpeed} B/s`);
   * console.log(`Chunks: ${metrics.chunks.length}`);
   * ```
   */
  exportMetrics: () => {
    /** Session-level aggregated metrics */
    session: Partial<UploadSessionMetrics>;
    /** Per-chunk detailed metrics */
    chunks: ChunkMetrics[];
    /** Performance insights and recommendations */
    insights: PerformanceInsights;
  };

  /**
   * Get current network metrics
   *
   * Provides real-time network statistics including speed,
   * errors, and network condition assessment.
   *
   * @returns Current network performance metrics
   *
   * @example
   * ```typescript
   * const network = metrics.getNetworkMetrics();
   * console.log(`Speed: ${network.currentSpeed} B/s`);
   * console.log(`Quality: ${network.condition.quality}`);
   * ```
   */
  getNetworkMetrics: () => NetworkMetrics;

  /**
   * Get current network condition
   *
   * Provides assessment of current network quality with
   * recommendations for adaptive upload strategies.
   *
   * @returns Network condition assessment
   *
   * @example
   * ```typescript
   * const condition = metrics.getNetworkCondition();
   * if (condition.quality === 'poor') {
   *   console.log('Consider reducing chunk size');
   * }
   * ```
   */
  getNetworkCondition: () => NetworkCondition;

  /**
   * Reset all metrics
   *
   * Clears all accumulated metrics and resets counters.
   * Useful when starting a new upload session.
   *
   * @example
   * ```typescript
   * // Reset metrics before starting new upload
   * metrics.resetMetrics();
   * upload(newFile);
   * ```
   */
  resetMetrics: () => void;
}
