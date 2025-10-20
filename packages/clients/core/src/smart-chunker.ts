import type { NetworkCondition, NetworkMonitor } from "./network-monitor";
import type { ConnectionMetrics } from "./services/http-client";

export interface ChunkingStrategy {
  name: string;
  minChunkSize: number;
  maxChunkSize: number;
  initialChunkSize: number;
  adaptationRate: number; // how quickly to adapt (0-1)
}

export interface DatastoreConstraints {
  minChunkSize: number;
  maxChunkSize: number;
  optimalChunkSize: number;
  requiresOrderedChunks?: boolean;
}

export interface SmartChunkerConfig {
  enabled?: boolean;
  fallbackChunkSize?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  initialChunkSize?: number;
  targetUtilization?: number; // target bandwidth utilization (0-1)
  adaptationRate?: number;
  conservativeMode?: boolean;
  connectionPoolingAware?: boolean; // enable connection pooling optimizations
  datastoreConstraints?: DatastoreConstraints;
}

export interface ChunkSizeDecision {
  size: number;
  strategy: string;
  reason: string;
  networkCondition: NetworkCondition;
}

const DEFAULT_STRATEGIES: Record<string, ChunkingStrategy> = {
  conservative: {
    name: "conservative",
    minChunkSize: 64 * 1024, // 64 KB
    maxChunkSize: 2 * 1024 * 1024, // 2 MB
    initialChunkSize: 256 * 1024, // 256 KB
    adaptationRate: 0.1,
  },
  balanced: {
    name: "balanced",
    minChunkSize: 128 * 1024, // 128 KB
    maxChunkSize: 8 * 1024 * 1024, // 8 MB
    initialChunkSize: 512 * 1024, // 512 KB
    adaptationRate: 0.2,
  },
  aggressive: {
    name: "aggressive",
    minChunkSize: 256 * 1024, // 256 KB
    maxChunkSize: 32 * 1024 * 1024, // 32 MB
    initialChunkSize: 1024 * 1024, // 1 MB
    adaptationRate: 0.3,
  },
};

const S3_OPTIMIZED_STRATEGIES: Record<string, ChunkingStrategy> = {
  conservative: {
    name: "s3-conservative",
    minChunkSize: 5 * 1024 * 1024, // 5MB - S3 minimum
    maxChunkSize: 64 * 1024 * 1024, // 64MB
    initialChunkSize: 8 * 1024 * 1024, // 8MB
    adaptationRate: 0.1,
  },
  balanced: {
    name: "s3-balanced",
    minChunkSize: 5 * 1024 * 1024, // 5MB - S3 minimum
    maxChunkSize: 128 * 1024 * 1024, // 128MB
    initialChunkSize: 16 * 1024 * 1024, // 16MB
    adaptationRate: 0.2,
  },
  aggressive: {
    name: "s3-aggressive",
    minChunkSize: 5 * 1024 * 1024, // 5MB - S3 minimum
    maxChunkSize: 256 * 1024 * 1024, // 256MB
    initialChunkSize: 32 * 1024 * 1024, // 32MB
    adaptationRate: 0.3,
  },
};

export class SmartChunker {
  private config: Required<Omit<SmartChunkerConfig, "datastoreConstraints">> & {
    datastoreConstraints?: DatastoreConstraints;
  };
  private networkMonitor: NetworkMonitor;
  private currentChunkSize: number;
  private lastDecision: ChunkSizeDecision | null = null;
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private connectionMetrics: ConnectionMetrics | null = null;

  constructor(networkMonitor: NetworkMonitor, config: SmartChunkerConfig = {}) {
    this.networkMonitor = networkMonitor;
    this.config = {
      enabled: config.enabled ?? true,
      fallbackChunkSize: config.fallbackChunkSize ?? 1024 * 1024, // 1 MB
      minChunkSize: config.minChunkSize ?? 64 * 1024, // 64 KB
      maxChunkSize: config.maxChunkSize ?? 32 * 1024 * 1024, // 32 MB
      initialChunkSize: config.initialChunkSize ?? 512 * 1024, // 512 KB
      targetUtilization: config.targetUtilization ?? 0.85, // 85%
      adaptationRate: config.adaptationRate ?? 0.2,
      conservativeMode: config.conservativeMode ?? false,
      connectionPoolingAware: config.connectionPoolingAware ?? true, // Enable by default
      datastoreConstraints: config.datastoreConstraints,
    };

    this.currentChunkSize = this.getEffectiveInitialChunkSize();
  }

  private getEffectiveInitialChunkSize(): number {
    if (this.config.datastoreConstraints) {
      return Math.max(
        this.config.initialChunkSize,
        this.config.datastoreConstraints.optimalChunkSize,
      );
    }
    return this.config.initialChunkSize;
  }

  private applyDatastoreConstraints(size: number): number {
    if (this.config.datastoreConstraints) {
      return Math.max(
        this.config.datastoreConstraints.minChunkSize,
        Math.min(this.config.datastoreConstraints.maxChunkSize, size),
      );
    }
    return size;
  }

  getNextChunkSize(remainingBytes?: number): ChunkSizeDecision {
    if (!this.config.enabled) {
      return {
        size: this.config.fallbackChunkSize,
        strategy: "fixed",
        reason: "Smart chunking disabled",
        networkCondition: { type: "unknown", confidence: 0 },
      };
    }

    const networkCondition = this.networkMonitor.getNetworkCondition();

    let newSize = this.currentChunkSize;
    let strategy = "adaptive";
    let reason = "";

    // If we don't have enough data, use initial strategy
    if (networkCondition.type === "unknown") {
      newSize = this.config.initialChunkSize;
      strategy = "initial";
      reason = "Insufficient network data";
    } else {
      const chunkingStrategy = this.selectStrategy(networkCondition);
      newSize = this.calculateOptimalChunkSize(
        networkCondition,
        chunkingStrategy,
      );
      strategy = chunkingStrategy.name;
      reason = `Network condition: ${networkCondition.type} (confidence: ${Math.round(networkCondition.confidence * 100)}%)`;
    }

    // Apply remaining bytes limit
    if (remainingBytes && remainingBytes < newSize) {
      newSize = remainingBytes;
      reason += `, limited by remaining bytes (${remainingBytes})`;
    }

    // Apply datastore constraints first
    newSize = this.applyDatastoreConstraints(newSize);

    // Ensure bounds
    newSize = Math.max(
      this.config.minChunkSize,
      Math.min(this.config.maxChunkSize, newSize),
    );

    this.currentChunkSize = newSize;
    this.lastDecision = {
      size: newSize,
      strategy,
      reason,
      networkCondition,
    };

    return this.lastDecision;
  }

  recordChunkResult(size: number, duration: number, success: boolean): void {
    // Record the result in network monitor
    this.networkMonitor.recordUpload(size, duration, success);

    // Update our internal state
    if (success) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
    }

    // Adjust chunk size based on recent performance
    this.adaptChunkSize(success, duration, size);
  }

  getCurrentChunkSize(): number {
    return this.currentChunkSize;
  }

  getLastDecision(): ChunkSizeDecision | null {
    return this.lastDecision;
  }

  reset(): void {
    this.currentChunkSize = this.config.initialChunkSize;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastDecision = null;
    this.connectionMetrics = null;
  }

  /**
   * Update connection metrics for connection pooling aware optimizations
   */
  updateConnectionMetrics(metrics: ConnectionMetrics): void {
    this.connectionMetrics = metrics;
  }

  /**
   * Get insights about connection pooling impact on chunking
   */
  getConnectionPoolingInsights(): {
    isOptimized: boolean;
    reuseRate: number;
    recommendedMinChunkSize: number;
    connectionOverhead: number;
  } {
    if (!this.connectionMetrics || !this.config.connectionPoolingAware) {
      return {
        isOptimized: false,
        reuseRate: 0,
        recommendedMinChunkSize: this.config.minChunkSize,
        connectionOverhead: 0,
      };
    }

    const reuseRate = this.connectionMetrics.reuseRate;
    const avgConnectionTime = this.connectionMetrics.averageConnectionTime;

    // With good connection reuse, we can afford smaller chunks
    const connectionOverhead = (1 - reuseRate) * avgConnectionTime;
    const recommendedMinChunkSize = Math.max(
      this.config.minChunkSize,
      Math.floor(connectionOverhead * 10000), // 10KB per ms of overhead
    );

    return {
      isOptimized: reuseRate > 0.7,
      reuseRate,
      recommendedMinChunkSize,
      connectionOverhead,
    };
  }

  private selectStrategy(networkCondition: NetworkCondition): ChunkingStrategy {
    const fallbackStrategy: ChunkingStrategy = {
      name: "fallback",
      minChunkSize: 128 * 1024,
      maxChunkSize: 4 * 1024 * 1024,
      initialChunkSize: 512 * 1024,
      adaptationRate: 0.2,
    };

    // Use S3-optimized strategies if datastore constraints indicate S3 (5MB minimum)
    const isS3Like =
      this.config.datastoreConstraints?.minChunkSize === 5 * 1024 * 1024;
    const strategiesSource = isS3Like
      ? S3_OPTIMIZED_STRATEGIES
      : DEFAULT_STRATEGIES;

    if (this.config.conservativeMode) {
      return strategiesSource.conservative ?? fallbackStrategy;
    }

    // Enhanced strategy selection with connection pooling awareness
    let baseStrategy: ChunkingStrategy;

    switch (networkCondition.type) {
      case "fast":
        baseStrategy =
          networkCondition.confidence > 0.7
            ? (strategiesSource.aggressive ?? fallbackStrategy)
            : (strategiesSource.balanced ?? fallbackStrategy);
        break;
      case "slow":
        baseStrategy = strategiesSource.conservative ?? fallbackStrategy;
        break;
      case "unstable":
        baseStrategy = strategiesSource.conservative ?? fallbackStrategy;
        break;
      default:
        baseStrategy = strategiesSource.balanced ?? fallbackStrategy;
    }

    // Apply connection pooling optimizations
    if (this.config.connectionPoolingAware && this.connectionMetrics) {
      return this.optimizeStrategyForConnectionPooling(baseStrategy);
    }

    return baseStrategy;
  }

  /**
   * Optimize chunking strategy based on connection pooling performance
   */
  private optimizeStrategyForConnectionPooling(
    strategy: ChunkingStrategy,
  ): ChunkingStrategy {
    if (!this.connectionMetrics) return strategy;

    const insights = this.getConnectionPoolingInsights();
    const reuseRate = insights.reuseRate;

    // High connection reuse allows for more aggressive chunking
    if (reuseRate > 0.8) {
      return {
        ...strategy,
        name: `${strategy.name}-pooled-aggressive`,
        minChunkSize: Math.max(strategy.minChunkSize * 0.5, 32 * 1024), // Smaller min chunks
        adaptationRate: Math.min(strategy.adaptationRate * 1.3, 0.5), // Faster adaptation
      };
    }

    // Good connection reuse allows moderate optimization
    if (reuseRate > 0.5) {
      return {
        ...strategy,
        name: `${strategy.name}-pooled-moderate`,
        minChunkSize: Math.max(strategy.minChunkSize * 0.75, 64 * 1024),
        adaptationRate: Math.min(strategy.adaptationRate * 1.1, 0.4),
      };
    }

    // Poor connection reuse requires conservative approach
    return {
      ...strategy,
      name: `${strategy.name}-pooled-conservative`,
      minChunkSize: Math.max(
        strategy.minChunkSize * 1.5,
        insights.recommendedMinChunkSize,
      ),
      adaptationRate: strategy.adaptationRate * 0.8,
    };
  }

  private calculateOptimalChunkSize(
    networkCondition: NetworkCondition,
    strategy: ChunkingStrategy,
  ): number {
    let targetSize = this.currentChunkSize;

    // Base calculation on current throughput
    const optimalThroughput = this.networkMonitor.getOptimalThroughput();

    if (optimalThroughput > 0) {
      // Calculate target chunk duration (aim for 2-5 seconds per chunk)
      const targetDuration = this.getTargetChunkDuration(networkCondition);
      const theoreticalSize =
        optimalThroughput * targetDuration * this.config.targetUtilization;

      // Blend current size with theoretical optimal size
      const blendFactor = strategy.adaptationRate;
      targetSize =
        this.currentChunkSize * (1 - blendFactor) +
        theoreticalSize * blendFactor;
    }

    // Apply strategy constraints
    targetSize = Math.max(
      strategy.minChunkSize,
      Math.min(strategy.maxChunkSize, targetSize),
    );

    // Apply failure-based adjustments
    if (this.consecutiveFailures > 0) {
      // Reduce size on failures
      const reductionFactor = Math.min(0.5, this.consecutiveFailures * 0.2);
      targetSize *= 1 - reductionFactor;
    } else if (this.consecutiveSuccesses > 2) {
      // Gradually increase size on consistent success
      const increaseFactor = Math.min(0.3, this.consecutiveSuccesses * 0.05);
      targetSize *= 1 + increaseFactor;
    }

    return Math.round(targetSize);
  }

  private getTargetChunkDuration(networkCondition: NetworkCondition): number {
    switch (networkCondition.type) {
      case "fast":
        return 3; // 3 seconds for fast connections
      case "slow":
        return 5; // 5 seconds for slow connections to reduce overhead
      case "unstable":
        return 2; // 2 seconds for unstable connections for quick recovery
      default:
        return 3; // Default to 3 seconds
    }
  }

  private adaptChunkSize(
    success: boolean,
    duration: number,
    size: number,
  ): void {
    if (!success) {
      // On failure, be more conservative
      this.currentChunkSize = Math.max(
        this.config.minChunkSize,
        this.currentChunkSize * 0.8,
      );
      return;
    }

    // On success, check if we should adjust based on performance
    const throughput = size / (duration / 1000); // bytes per second
    const metrics = this.networkMonitor.getCurrentMetrics();

    if (metrics.averageSpeed > 0) {
      const utilizationRatio = throughput / metrics.averageSpeed;

      if (utilizationRatio < this.config.targetUtilization * 0.8) {
        // We're not utilizing bandwidth well, try larger chunks
        this.currentChunkSize = Math.min(
          this.config.maxChunkSize,
          this.currentChunkSize * 1.1,
        );
      } else if (utilizationRatio > this.config.targetUtilization * 1.2) {
        // We might be overloading, try smaller chunks
        this.currentChunkSize = Math.max(
          this.config.minChunkSize,
          this.currentChunkSize * 0.95,
        );
      }
    }
  }
}
