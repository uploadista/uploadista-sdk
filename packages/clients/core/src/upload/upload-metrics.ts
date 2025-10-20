import type { ChunkMetrics } from "../types/chunk-metrics";
import type { PerformanceInsights } from "../types/performance-insights";
import type { UploadSessionMetrics } from "../types/upload-session-metrics";

export interface UploadMetricsConfig {
  maxChunkHistory?: number;
  enableDetailedMetrics?: boolean;
  performanceThresholds?: {
    slowSpeed: number; // bytes per second
    fastSpeed: number; // bytes per second
    highRetryRate: number; // ratio
  };
}

export class UploadMetrics {
  private config: Required<UploadMetricsConfig>;
  private chunkHistory: ChunkMetrics[] = [];
  private currentSession: Partial<UploadSessionMetrics> = {};
  private sessionStartTime = 0;

  constructor(config: UploadMetricsConfig = {}) {
    this.config = {
      maxChunkHistory: config.maxChunkHistory ?? 1000,
      enableDetailedMetrics: config.enableDetailedMetrics ?? true,
      performanceThresholds: {
        slowSpeed: 100 * 1024, // 100 KB/s
        fastSpeed: 5 * 1024 * 1024, // 5 MB/s
        highRetryRate: 0.2, // 20%
        ...config.performanceThresholds,
      },
    };
  }

  startSession(
    uploadId: string,
    totalSize: number,
    adaptiveChunkingEnabled: boolean,
  ): void {
    this.sessionStartTime = Date.now();
    this.currentSession = {
      uploadId,
      totalSize,
      chunksCompleted: 0,
      chunksTotal: Math.ceil(totalSize / (1024 * 1024)), // rough estimate
      totalDuration: 0,
      totalRetries: 0,
      adaptiveChunkingEnabled,
      startTime: this.sessionStartTime,
    };
    this.chunkHistory = [];
  }

  recordChunk(metrics: Omit<ChunkMetrics, "timestamp">): void {
    const chunkMetrics: ChunkMetrics = {
      ...metrics,
      timestamp: Date.now(),
    };

    this.chunkHistory.push(chunkMetrics);

    // Keep history within limits
    if (this.chunkHistory.length > this.config.maxChunkHistory) {
      this.chunkHistory = this.chunkHistory.slice(-this.config.maxChunkHistory);
    }

    // Update session metrics
    if (this.currentSession && chunkMetrics.success) {
      this.currentSession.chunksCompleted =
        (this.currentSession.chunksCompleted || 0) + 1;
      this.currentSession.totalDuration =
        (this.currentSession.totalDuration || 0) + chunkMetrics.duration;
      this.currentSession.totalRetries =
        (this.currentSession.totalRetries || 0) + chunkMetrics.retryCount;
    }
  }

  endSession(): UploadSessionMetrics | null {
    if (!this.currentSession.uploadId) {
      return null;
    }

    const endTime = Date.now();
    const totalDuration = endTime - this.sessionStartTime;
    const successfulChunks = this.chunkHistory.filter((chunk) => chunk.success);

    if (successfulChunks.length === 0) {
      return null;
    }

    const speeds = successfulChunks.map((chunk) => chunk.speed);
    const averageSpeed =
      speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
    const peakSpeed = Math.max(...speeds);
    const minSpeed = Math.min(...speeds);
    const successRate = successfulChunks.length / this.chunkHistory.length;

    const sessionMetrics: UploadSessionMetrics = {
      uploadId: this.currentSession.uploadId || "",
      totalSize: this.currentSession.totalSize || 0,
      totalDuration,
      chunksCompleted: successfulChunks.length,
      chunksTotal: this.chunkHistory.length,
      averageSpeed,
      peakSpeed,
      minSpeed,
      totalRetries: this.currentSession.totalRetries || 0,
      successRate,
      adaptiveChunkingEnabled:
        this.currentSession.adaptiveChunkingEnabled || false,
      startTime: this.currentSession.startTime || 0,
      endTime,
    };

    // Reset current session
    this.currentSession = {};

    return sessionMetrics;
  }

  getCurrentSessionMetrics(): Partial<UploadSessionMetrics> {
    return { ...this.currentSession };
  }

  getChunkHistory(count?: number): ChunkMetrics[] {
    const history = this.chunkHistory.slice();
    return count ? history.slice(-count) : history;
  }

  getPerformanceInsights(): PerformanceInsights {
    if (this.chunkHistory.length < 5) {
      return {
        overallEfficiency: 0,
        chunkingEffectiveness: 0,
        networkStability: 0,
        recommendations: ["Insufficient data for analysis"],
        optimalChunkSizeRange: { min: 256 * 1024, max: 2 * 1024 * 1024 },
      };
    }

    const successfulChunks = this.chunkHistory.filter((chunk) => chunk.success);
    const speeds = successfulChunks.map((chunk) => chunk.speed);

    // Calculate metrics
    const averageSpeed =
      speeds.length > 0
        ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length
        : 0;
    const speedVariance = this.calculateVariance(speeds);
    const speedStdDev = Math.sqrt(speedVariance);
    const coefficientOfVariation = speedStdDev / averageSpeed;

    // Overall efficiency based on speed and retry rate
    const successRate = successfulChunks.length / this.chunkHistory.length;
    const speedScore = Math.min(
      1,
      averageSpeed / this.config.performanceThresholds.fastSpeed,
    );
    const overallEfficiency = speedScore * 0.7 + successRate * 0.3;

    // Network stability (lower coefficient of variation = higher stability)
    const networkStability = Math.max(
      0,
      1 - Math.min(1, coefficientOfVariation),
    );

    // Chunking effectiveness based on how well chunk sizes correlate with performance
    const chunkingEffectiveness =
      this.calculateChunkingEffectiveness(successfulChunks);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      averageSpeed,
      successRate,
      coefficientOfVariation,
    );

    // Calculate optimal chunk size range
    const optimalChunkSizeRange =
      this.calculateOptimalChunkSizeRange(successfulChunks);

    return {
      overallEfficiency,
      chunkingEffectiveness,
      networkStability,
      recommendations,
      optimalChunkSizeRange,
    };
  }

  exportMetrics(): {
    session: Partial<UploadSessionMetrics>;
    chunks: ChunkMetrics[];
    insights: PerformanceInsights;
  } {
    return {
      session: this.getCurrentSessionMetrics(),
      chunks: this.getChunkHistory(),
      insights: this.getPerformanceInsights(),
    };
  }

  reset(): void {
    this.chunkHistory = [];
    this.currentSession = {};
    this.sessionStartTime = 0;
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const squaredDifferences = values.map((value) => (value - mean) ** 2);
    return (
      squaredDifferences.reduce((sum, diff) => sum + diff, 0) / values.length
    );
  }

  private calculateChunkingEffectiveness(chunks: ChunkMetrics[]): number {
    if (chunks.length < 3) return 0.5;

    // Look for correlation between chunk size and upload speed
    // Better chunking should show consistent performance across different sizes
    const sizeGroups = this.groupChunksBySize(chunks);

    if (Object.keys(sizeGroups).length < 2) return 0.5;

    // Calculate coefficient of variation for each size group
    const groupVariations = Object.values(sizeGroups).map((group) => {
      const speeds = group.map((chunk) => chunk.speed);
      const mean =
        speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
      const variance = this.calculateVariance(speeds);
      return Math.sqrt(variance) / mean;
    });

    // Lower average variation indicates better chunking effectiveness
    const averageVariation =
      groupVariations.reduce((sum, cv) => sum + cv, 0) / groupVariations.length;
    return Math.max(0, 1 - Math.min(1, averageVariation));
  }

  private groupChunksBySize(
    chunks: ChunkMetrics[],
  ): Record<string, ChunkMetrics[]> {
    const groups: Record<string, ChunkMetrics[]> = {};

    chunks.forEach((chunk) => {
      // Group by size ranges (64KB, 128KB, 256KB, 512KB, 1MB, 2MB, 4MB, 8MB+)
      let sizeGroup: string;
      if (chunk.size < 128 * 1024) sizeGroup = "64KB";
      else if (chunk.size < 256 * 1024) sizeGroup = "128KB";
      else if (chunk.size < 512 * 1024) sizeGroup = "256KB";
      else if (chunk.size < 1024 * 1024) sizeGroup = "512KB";
      else if (chunk.size < 2 * 1024 * 1024) sizeGroup = "1MB";
      else if (chunk.size < 4 * 1024 * 1024) sizeGroup = "2MB";
      else if (chunk.size < 8 * 1024 * 1024) sizeGroup = "4MB";
      else sizeGroup = "8MB+";

      if (!groups[sizeGroup]) groups[sizeGroup] = [];
      const group = groups[sizeGroup];
      if (group) group.push(chunk);
    });

    return groups;
  }

  private generateRecommendations(
    averageSpeed: number,
    successRate: number,
    coefficientOfVariation: number,
  ): string[] {
    const recommendations: string[] = [];

    if (averageSpeed < this.config.performanceThresholds.slowSpeed) {
      recommendations.push(
        "Consider using smaller chunk sizes for better performance on slow connections",
      );
    }

    if (averageSpeed > this.config.performanceThresholds.fastSpeed) {
      recommendations.push(
        "Network is fast - larger chunk sizes may improve efficiency",
      );
    }

    if (successRate < 0.9) {
      recommendations.push(
        "High failure rate detected - consider more conservative chunking strategy",
      );
    }

    if (coefficientOfVariation > 0.5) {
      recommendations.push(
        "Network appears unstable - smaller, more frequent chunks may be more reliable",
      );
    }

    if (
      coefficientOfVariation < 0.2 &&
      averageSpeed > this.config.performanceThresholds.slowSpeed
    ) {
      recommendations.push(
        "Stable network detected - larger chunks may improve efficiency",
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        "Performance appears optimal with current configuration",
      );
    }

    return recommendations;
  }

  private calculateOptimalChunkSizeRange(chunks: ChunkMetrics[]): {
    min: number;
    max: number;
  } {
    if (chunks.length < 5) {
      return { min: 256 * 1024, max: 2 * 1024 * 1024 };
    }

    // Find chunks with best performance (top 30% by speed)
    const sortedBySpeed = chunks.slice().sort((a, b) => b.speed - a.speed);
    const topPerformers = sortedBySpeed.slice(
      0,
      Math.ceil(chunks.length * 0.3),
    );

    const topSizes = topPerformers.map((chunk) => chunk.size);
    const minOptimal = Math.min(...topSizes);
    const maxOptimal = Math.max(...topSizes);

    return {
      min: Math.max(64 * 1024, minOptimal), // At least 64KB
      max: Math.min(32 * 1024 * 1024, maxOptimal), // At most 32MB
    };
  }
}
