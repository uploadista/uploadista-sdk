/**
 * Assessment of current network conditions based on upload performance.
 *
 * Used by smart chunking algorithms to adapt chunk sizes based on network quality.
 */
export interface NetworkCondition {
  /**
   * Classification of network speed and stability:
   * - "slow": Average speed below slowThreshold (default 50 KB/s)
   * - "fast": Average speed above fastThreshold (default 5 MB/s)
   * - "unstable": High variance in upload speeds
   * - "unknown": Insufficient data to determine condition
   */
  type: "slow" | "fast" | "unstable" | "unknown";

  /**
   * Confidence level in the assessment (0-1).
   * Higher values indicate more samples and more reliable assessment.
   */
  confidence: number;
}

/**
 * Aggregated network performance metrics.
 *
 * Provides a comprehensive view of upload performance over time,
 * useful for debugging connectivity issues and optimizing upload strategies.
 */
export interface NetworkMetrics {
  /** Average upload speed in bytes per second */
  averageSpeed: number;

  /** Average network latency in milliseconds */
  latency: number;

  /** Ratio of successful uploads (0-1) */
  successRate: number;

  /** Ratio of failed uploads (0-1) */
  errorRate: number;

  /** Total number of upload requests made */
  totalRequests: number;

  /** Total bytes uploaded successfully */
  totalBytes: number;

  /** Total time spent uploading in milliseconds */
  totalTime: number;
}

/**
 * Individual upload sample for network analysis.
 *
 * Each successful or failed upload is recorded as a sample,
 * which is used to calculate network metrics and conditions.
 */
export interface UploadSample {
  /** Size of the uploaded chunk in bytes */
  size: number;

  /** Time taken to upload in milliseconds */
  duration: number;

  /** Whether the upload succeeded */
  success: boolean;

  /** Unix timestamp when the upload occurred */
  timestamp: number;

  /** Optional network latency measurement in milliseconds */
  latency?: number;
}

/**
 * Configuration options for NetworkMonitor.
 *
 * Controls how network conditions are assessed and how upload samples
 * are analyzed to determine optimal chunking strategies.
 */
export interface NetworkMonitorConfig {
  /** Maximum number of samples to keep in memory. Defaults to 100. */
  maxSamples?: number;

  /** Smoothing factor for exponential moving average (0-1). Defaults to 0.1. */
  smoothingFactor?: number;

  /** Minimum samples required before assessing network condition. Defaults to 5. */
  minSamplesForCondition?: number;

  /** Upload speed threshold for "slow" classification in bytes/second. Defaults to 50 KB/s. */
  slowThreshold?: number;

  /** Upload speed threshold for "fast" classification in bytes/second. Defaults to 5 MB/s. */
  fastThreshold?: number;

  /** Coefficient of variation threshold for "unstable" classification. Defaults to 0.5. */
  unstableThreshold?: number;
}

/**
 * Monitors network performance during uploads to enable adaptive chunking.
 *
 * Tracks upload samples over time and analyzes them to determine network conditions
 * (slow, fast, unstable). This information is used by smart chunking algorithms to
 * dynamically adjust chunk sizes for optimal upload performance.
 *
 * The monitor maintains a rolling window of recent samples and calculates various
 * metrics including average speed, latency, success rate, and throughput stability.
 *
 * @example Basic usage with smart chunking
 * ```typescript
 * const monitor = new NetworkMonitor({
 *   maxSamples: 100,
 *   slowThreshold: 50 * 1024, // 50 KB/s
 *   fastThreshold: 5 * 1024 * 1024, // 5 MB/s
 * });
 *
 * // Record each upload
 * monitor.recordUpload(
 *   chunkSize,    // bytes
 *   duration,     // milliseconds
 *   true,         // success
 *   latency       // optional latency
 * );
 *
 * // Get current network condition
 * const condition = monitor.getNetworkCondition();
 * if (condition.type === 'slow') {
 *   // Use smaller chunks
 *   chunkSize = 256 * 1024;
 * } else if (condition.type === 'fast') {
 *   // Use larger chunks
 *   chunkSize = 5 * 1024 * 1024;
 * }
 * ```
 *
 * @example Monitoring network metrics
 * ```typescript
 * const monitor = new NetworkMonitor();
 *
 * // After some uploads
 * const metrics = monitor.getCurrentMetrics();
 * console.log(`Average speed: ${metrics.averageSpeed / 1024} KB/s`);
 * console.log(`Success rate: ${metrics.successRate * 100}%`);
 * console.log(`Average latency: ${metrics.latency}ms`);
 * ```
 */
export class NetworkMonitor {
  private samples: UploadSample[] = [];
  private config: Required<NetworkMonitorConfig>;
  private _currentMetrics: NetworkMetrics;

  /**
   * Creates a new NetworkMonitor instance.
   *
   * @param config - Optional configuration for thresholds and sample management
   */
  constructor(config: NetworkMonitorConfig = {}) {
    this.config = {
      maxSamples: config.maxSamples ?? 100,
      smoothingFactor: config.smoothingFactor ?? 0.1,
      minSamplesForCondition: config.minSamplesForCondition ?? 5,
      slowThreshold: config.slowThreshold ?? 50 * 1024, // 50 KB/s
      fastThreshold: config.fastThreshold ?? 5 * 1024 * 1024, // 5 MB/s
      unstableThreshold: config.unstableThreshold ?? 0.5, // 50% coefficient of variation
    };

    this._currentMetrics = this.createEmptyMetrics();
  }

  /**
   * Adds a raw upload sample to the monitor.
   *
   * This is called internally by recordUpload but can also be used
   * to add pre-constructed samples for testing or custom tracking.
   *
   * @param sample - The upload sample to add
   */
  addSample(sample: UploadSample): void {
    this.samples.push(sample);

    // Keep only the most recent samples
    if (this.samples.length > this.config.maxSamples) {
      this.samples = this.samples.slice(-this.config.maxSamples);
    }

    this.updateMetrics();
  }

  /**
   * Records an upload operation for network analysis.
   *
   * This is the primary method for tracking upload performance. Each chunk upload
   * should be recorded to build an accurate picture of network conditions.
   *
   * @param size - Size of the uploaded chunk in bytes
   * @param duration - Time taken to upload in milliseconds
   * @param success - Whether the upload succeeded
   * @param latency - Optional network latency measurement in milliseconds
   *
   * @example Recording successful upload
   * ```typescript
   * const startTime = Date.now();
   * await uploadChunk(data);
   * const duration = Date.now() - startTime;
   * monitor.recordUpload(data.length, duration, true);
   * ```
   *
   * @example Recording failed upload
   * ```typescript
   * try {
   *   const startTime = Date.now();
   *   await uploadChunk(data);
   *   monitor.recordUpload(data.length, Date.now() - startTime, true);
   * } catch (error) {
   *   monitor.recordUpload(data.length, Date.now() - startTime, false);
   * }
   * ```
   */
  recordUpload(
    size: number,
    duration: number,
    success: boolean,
    latency?: number,
  ): void {
    this.addSample({
      size,
      duration,
      success,
      timestamp: Date.now(),
      latency,
    });
  }

  /**
   * Returns the current network metrics.
   *
   * Provides aggregated statistics about all recorded uploads including
   * average speed, latency, success rate, and totals.
   *
   * @returns A snapshot of current network performance metrics
   *
   * @example
   * ```typescript
   * const metrics = monitor.getCurrentMetrics();
   * console.log(`Speed: ${(metrics.averageSpeed / 1024).toFixed(2)} KB/s`);
   * console.log(`Success: ${(metrics.successRate * 100).toFixed(1)}%`);
   * console.log(`Latency: ${metrics.latency.toFixed(0)}ms`);
   * ```
   */
  getCurrentMetrics(): NetworkMetrics {
    return { ...this._currentMetrics };
  }

  /**
   * Analyzes recent upload samples to determine current network condition.
   *
   * Uses statistical analysis (coefficient of variation, average speed) to classify
   * the network as slow, fast, unstable, or unknown. The confidence level indicates
   * how reliable the assessment is based on the number of samples collected.
   *
   * @returns Current network condition with confidence level
   *
   * @example Adaptive chunking based on network condition
   * ```typescript
   * const condition = monitor.getNetworkCondition();
   *
   * if (condition.confidence > 0.7) {
   *   switch (condition.type) {
   *     case 'fast':
   *       chunkSize = 10 * 1024 * 1024; // 10MB
   *       break;
   *     case 'slow':
   *       chunkSize = 256 * 1024; // 256KB
   *       break;
   *     case 'unstable':
   *       chunkSize = 1 * 1024 * 1024; // 1MB, conservative
   *       break;
   *   }
   * }
   * ```
   */
  getNetworkCondition(): NetworkCondition {
    if (this.samples.length < this.config.minSamplesForCondition) {
      return { type: "unknown", confidence: 0 };
    }

    const recentSamples = this.getRecentSuccessfulSamples();
    if (recentSamples.length < this.config.minSamplesForCondition) {
      return { type: "unknown", confidence: 0.3 };
    }

    const speeds = recentSamples.map(
      (sample) => sample.size / (sample.duration / 1000),
    );
    const avgSpeed =
      speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;

    // Calculate coefficient of variation for stability assessment
    const variance =
      speeds.reduce((sum, speed) => sum + (speed - avgSpeed) ** 2, 0) /
      speeds.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgSpeed;

    // Determine network condition
    const confidence = Math.min(
      1,
      this.samples.length / (this.config.minSamplesForCondition * 2),
    );

    if (coefficientOfVariation > this.config.unstableThreshold) {
      return { type: "unstable", confidence };
    }

    if (avgSpeed < this.config.slowThreshold) {
      return { type: "slow", confidence };
    }

    if (avgSpeed > this.config.fastThreshold) {
      return { type: "fast", confidence };
    }

    // Default to slow for conservative chunking
    return { type: "slow", confidence: confidence * 0.7 };
  }

  /**
   * Calculates the optimal upload throughput based on recent successful uploads.
   *
   * Uses a weighted average that gives more weight to recent samples,
   * providing a responsive measure of current network capacity.
   *
   * @returns Optimal throughput in bytes per second, or 0 if no successful samples
   *
   * @example Using for chunk size calculation
   * ```typescript
   * const throughput = monitor.getOptimalThroughput();
   * // Target 1 second per chunk
   * const optimalChunkSize = Math.min(throughput, MAX_CHUNK_SIZE);
   * ```
   */
  getOptimalThroughput(): number {
    const recentSamples = this.getRecentSuccessfulSamples(10);
    if (recentSamples.length === 0) return 0;

    // Calculate weighted average with recent samples having higher weight
    let totalWeight = 0;
    let weightedSum = 0;

    recentSamples.forEach((sample, index) => {
      const weight = index + 1; // More recent samples get higher weight
      const throughput = sample.size / (sample.duration / 1000);
      weightedSum += throughput * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Resets all samples and metrics to initial state.
   *
   * Useful when network conditions change significantly or when
   * starting a new upload session.
   *
   * @example Resetting between uploads
   * ```typescript
   * // Complete first upload
   * await uploadFile1();
   *
   * // Reset metrics before starting a new upload
   * monitor.reset();
   * await uploadFile2();
   * ```
   */
  reset(): void {
    this.samples = [];
    this._currentMetrics = this.createEmptyMetrics();
  }

  private getRecentSuccessfulSamples(count?: number): UploadSample[] {
    const successful = this.samples.filter((sample) => sample.success);
    return count ? successful.slice(-count) : successful;
  }

  private updateMetrics(): void {
    const successfulSamples = this.samples.filter((sample) => sample.success);
    const totalRequests = this.samples.length;
    const totalSuccessful = successfulSamples.length;

    if (totalRequests === 0) {
      this._currentMetrics = this.createEmptyMetrics();
      return;
    }

    const totalBytes = successfulSamples.reduce(
      (sum, sample) => sum + sample.size,
      0,
    );
    const totalTime = successfulSamples.reduce(
      (sum, sample) => sum + sample.duration,
      0,
    );

    const averageSpeed = totalTime > 0 ? totalBytes / (totalTime / 1000) : 0;
    const successRate = totalSuccessful / totalRequests;
    const errorRate = 1 - successRate;

    // Calculate average latency from samples that have latency data
    const samplesWithLatency = this.samples.filter(
      (sample) => sample.latency !== undefined,
    );
    const averageLatency =
      samplesWithLatency.length > 0
        ? samplesWithLatency.reduce(
            (sum, sample) => sum + (sample.latency || 0),
            0,
          ) / samplesWithLatency.length
        : 0;

    this._currentMetrics = {
      averageSpeed,
      latency: averageLatency,
      successRate,
      errorRate,
      totalRequests,
      totalBytes,
      totalTime,
    };
  }

  private createEmptyMetrics(): NetworkMetrics {
    return {
      averageSpeed: 0,
      latency: 0,
      successRate: 0,
      errorRate: 0,
      totalRequests: 0,
      totalBytes: 0,
      totalTime: 0,
    };
  }
}
