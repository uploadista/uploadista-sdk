export interface NetworkCondition {
  type: "slow" | "fast" | "unstable" | "unknown";
  confidence: number; // 0-1, how confident we are in this assessment
}

export interface NetworkMetrics {
  averageSpeed: number; // bytes per second
  latency: number; // milliseconds
  successRate: number; // 0-1
  errorRate: number; // 0-1
  totalRequests: number;
  totalBytes: number;
  totalTime: number; // milliseconds
}

export interface UploadSample {
  size: number; // bytes
  duration: number; // milliseconds
  success: boolean;
  timestamp: number;
  latency?: number;
}

export interface NetworkMonitorConfig {
  maxSamples?: number;
  smoothingFactor?: number; // for exponential moving average
  minSamplesForCondition?: number;
  slowThreshold?: number; // bytes per second
  fastThreshold?: number; // bytes per second
  unstableThreshold?: number; // coefficient of variation threshold
}

export class NetworkMonitor {
  private samples: UploadSample[] = [];
  private config: Required<NetworkMonitorConfig>;
  private _currentMetrics: NetworkMetrics;

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

  addSample(sample: UploadSample): void {
    this.samples.push(sample);

    // Keep only the most recent samples
    if (this.samples.length > this.config.maxSamples) {
      this.samples = this.samples.slice(-this.config.maxSamples);
    }

    this.updateMetrics();
  }

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

  getCurrentMetrics(): NetworkMetrics {
    return { ...this._currentMetrics };
  }

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
