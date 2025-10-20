import { beforeEach, describe, expect, it } from "vitest";
import { SmartChunker } from "../../../core/src/smart-chunker";
import { ChunkBuffer } from "../chunk-buffer";
import { NetworkMonitor } from "../network-monitor";
import { UploadMetrics } from "../upload/upload-metrics";

describe("NetworkMonitor", () => {
  let monitor: NetworkMonitor;

  beforeEach(() => {
    monitor = new NetworkMonitor();
  });

  it("should initialize with empty metrics", () => {
    const metrics = monitor.getCurrentMetrics();
    expect(metrics.totalRequests).toBe(0);
    expect(metrics.averageSpeed).toBe(0);
    expect(metrics.successRate).toBe(0);
  });

  it("should record successful uploads", () => {
    monitor.recordUpload(1024, 1000, true); // 1KB in 1 second

    const metrics = monitor.getCurrentMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.successRate).toBe(1);
    expect(metrics.averageSpeed).toBe(1024); // 1KB/s
  });

  it("should detect network conditions", () => {
    // Record slow uploads
    for (let i = 0; i < 5; i++) {
      monitor.recordUpload(1024, 2000, true); // 1KB in 2 seconds = 512 B/s
    }

    const condition = monitor.getNetworkCondition();
    expect(condition.type).toBe("slow");
    expect(condition.confidence).toBeGreaterThan(0);
  });

  it("should detect fast network conditions", () => {
    // Record fast uploads
    for (let i = 0; i < 5; i++) {
      monitor.recordUpload(10 * 1024 * 1024, 1000, true); // 10MB in 1 second = 10MB/s
    }

    const condition = monitor.getNetworkCondition();
    expect(condition.type).toBe("fast");
    expect(condition.confidence).toBeGreaterThan(0);
  });

  it("should detect unstable network", () => {
    // Record variable upload speeds
    monitor.recordUpload(1024, 1000, true); // 1KB/s
    monitor.recordUpload(10 * 1024 * 1024, 1000, true); // 10MB/s
    monitor.recordUpload(1024, 1000, true); // 1KB/s
    monitor.recordUpload(10 * 1024 * 1024, 1000, true); // 10MB/s
    monitor.recordUpload(1024, 1000, true); // 1KB/s

    const condition = monitor.getNetworkCondition();
    expect(condition.type).toBe("unstable");
  });
});

describe("SmartChunker", () => {
  let monitor: NetworkMonitor;
  let chunker: SmartChunker;

  beforeEach(() => {
    monitor = new NetworkMonitor();
    chunker = new SmartChunker(monitor);
  });

  it("should start with initial chunk size", () => {
    const decision = chunker.getNextChunkSize();
    expect(decision.size).toBe(512 * 1024); // Default initial size
    expect(decision.strategy).toBe("initial");
  });

  it("should adapt chunk size based on performance", () => {
    // Simulate successful uploads
    chunker.recordChunkResult(512 * 1024, 1000, true);
    chunker.recordChunkResult(512 * 1024, 1000, true);
    chunker.recordChunkResult(512 * 1024, 1000, true);

    const decision = chunker.getNextChunkSize();
    expect(decision.size).toBeGreaterThan(0);
  });

  it("should reduce chunk size on failures", () => {
    // First, establish some baseline by recording network data
    monitor.recordUpload(512 * 1024, 1000, true);
    monitor.recordUpload(512 * 1024, 1000, true);
    monitor.recordUpload(512 * 1024, 1000, true);
    monitor.recordUpload(512 * 1024, 1000, true);
    monitor.recordUpload(512 * 1024, 1000, true);

    const initialDecision = chunker.getNextChunkSize();
    const initialSize = initialDecision.size;

    // Record failures
    chunker.recordChunkResult(initialSize, 5000, false);
    chunker.recordChunkResult(initialSize, 5000, false);

    const newDecision = chunker.getNextChunkSize();
    expect(newDecision.size).toBeLessThan(initialSize);
  });

  it("should respect minimum and maximum bounds", () => {
    const config = {
      minChunkSize: 64 * 1024,
      maxChunkSize: 2 * 1024 * 1024,
    };

    const boundedChunker = new SmartChunker(monitor, config);

    // Force very small size
    for (let i = 0; i < 10; i++) {
      boundedChunker.recordChunkResult(1024, 10000, false);
    }

    const smallDecision = boundedChunker.getNextChunkSize();
    expect(smallDecision.size).toBeGreaterThanOrEqual(config.minChunkSize);

    // Reset and force very large size
    boundedChunker.reset();
    for (let i = 0; i < 10; i++) {
      boundedChunker.recordChunkResult(10 * 1024 * 1024, 100, true);
    }

    const largeDecision = boundedChunker.getNextChunkSize();
    expect(largeDecision.size).toBeLessThanOrEqual(config.maxChunkSize);
  });

  it("should limit chunk size by remaining bytes", () => {
    const remainingBytes = 100 * 1024; // 100KB remaining
    const decision = chunker.getNextChunkSize(remainingBytes);
    expect(decision.size).toBeLessThanOrEqual(remainingBytes);
  });

  it("should respect datastore constraints (S3-like)", () => {
    const s3Constraints = {
      minChunkSize: 5 * 1024 * 1024, // 5MB - S3 minimum
      maxChunkSize: 5 * 1024 * 1024 * 1024, // 5GB - S3 maximum
      optimalChunkSize: 16 * 1024 * 1024, // 16MB optimal
    };

    const s3AwareChunker = new SmartChunker(monitor, {
      datastoreConstraints: s3Constraints,
    });

    const decision = s3AwareChunker.getNextChunkSize();

    // Should use optimal chunk size as initial, which is >= 5MB minimum
    expect(decision.size).toBeGreaterThanOrEqual(s3Constraints.minChunkSize);
    expect(decision.size).toBeLessThanOrEqual(s3Constraints.maxChunkSize);
  });

  it("should use S3-optimized strategies when S3 constraints are present", () => {
    const s3Constraints = {
      minChunkSize: 5 * 1024 * 1024, // 5MB - S3 minimum (this triggers S3 mode)
      maxChunkSize: 5 * 1024 * 1024 * 1024, // 5GB
      optimalChunkSize: 16 * 1024 * 1024, // 16MB
    };

    const s3AwareChunker = new SmartChunker(monitor, {
      datastoreConstraints: s3Constraints,
    });

    // Simulate fast network conditions
    for (let i = 0; i < 5; i++) {
      monitor.recordUpload(10 * 1024 * 1024, 1000, true); // 10MB/s
    }

    const decision = s3AwareChunker.getNextChunkSize();
    expect(decision.strategy).toContain("s3-"); // Should use S3-optimized strategy
    expect(decision.size).toBeGreaterThanOrEqual(5 * 1024 * 1024); // Never below 5MB
  });

  it("should enforce minimum chunk size even with failures", () => {
    const s3Constraints = {
      minChunkSize: 5 * 1024 * 1024, // 5MB
      maxChunkSize: 5 * 1024 * 1024 * 1024, // 5GB
      optimalChunkSize: 16 * 1024 * 1024, // 16MB
    };

    const s3AwareChunker = new SmartChunker(monitor, {
      datastoreConstraints: s3Constraints,
    });

    // Record many failures to try to force smaller chunks
    for (let i = 0; i < 10; i++) {
      s3AwareChunker.recordChunkResult(16 * 1024 * 1024, 10000, false);
    }

    const decision = s3AwareChunker.getNextChunkSize();
    // Even with failures, should never go below datastore minimum
    expect(decision.size).toBeGreaterThanOrEqual(s3Constraints.minChunkSize);
  });
});

describe("UploadMetrics", () => {
  let metrics: UploadMetrics;

  beforeEach(() => {
    metrics = new UploadMetrics();
  });

  it("should track upload session", () => {
    const uploadId = "test-upload";
    const totalSize = 1024 * 1024; // 1MB

    metrics.startSession(uploadId, totalSize, true);

    // Record some chunks
    metrics.recordChunk({
      chunkIndex: 0,
      size: 512 * 1024,
      duration: 1000,
      speed: 512 * 1024, // 512 KB/s
      success: true,
      retryCount: 0,
    });

    metrics.recordChunk({
      chunkIndex: 1,
      size: 512 * 1024,
      duration: 1000,
      speed: 512 * 1024, // 512 KB/s
      success: true,
      retryCount: 0,
    });

    const sessionMetrics = metrics.endSession();
    expect(sessionMetrics).toBeDefined();
    expect(sessionMetrics?.uploadId).toBe(uploadId);
    expect(sessionMetrics?.totalSize).toBe(totalSize);
    expect(sessionMetrics?.chunksCompleted).toBe(2);
  });

  it("should generate performance insights", () => {
    // Record multiple chunks with varying performance and sizes
    for (let i = 0; i < 10; i++) {
      const chunkSize = (128 + i * 128) * 1024; // Varying chunk sizes from 128KB to 1.25MB
      metrics.recordChunk({
        chunkIndex: i,
        size: chunkSize,
        duration: 1000 + Math.random() * 500, // 1-1.5 seconds
        speed: chunkSize / (1 + Math.random() * 0.5),
        success: true,
        retryCount: 0,
      });
    }

    const insights = metrics.getPerformanceInsights();
    expect(insights.overallEfficiency).toBeGreaterThan(0);
    expect(insights.networkStability).toBeGreaterThan(0);
    expect(insights.recommendations).toBeInstanceOf(Array);
    expect(insights.optimalChunkSizeRange.min).toBeGreaterThan(0);
    expect(insights.optimalChunkSizeRange.max).toBeGreaterThanOrEqual(
      insights.optimalChunkSizeRange.min,
    );
  });

  it("should export all metrics data", () => {
    metrics.startSession("test", 1024, true);
    metrics.recordChunk({
      chunkIndex: 0,
      size: 1024,
      duration: 1000,
      speed: 1024,
      success: true,
      retryCount: 0,
    });

    const exported = metrics.exportMetrics();
    expect(exported.session).toBeDefined();
    expect(exported.chunks).toBeInstanceOf(Array);
    expect(exported.chunks).toHaveLength(1);
    expect(exported.insights).toBeDefined();
  });
});

describe("Integration", () => {
  it("should work together for adaptive chunking", () => {
    const monitor = new NetworkMonitor();
    const chunker = new SmartChunker(monitor);
    const metrics = new UploadMetrics();

    // Start a session
    metrics.startSession("integration-test", 10 * 1024 * 1024, true);

    // Simulate upload process
    for (let i = 0; i < 10; i++) {
      const decision = chunker.getNextChunkSize();
      const chunkSize = decision.size;

      // Simulate upload (vary performance)
      const duration = 1000 + Math.random() * 2000; // 1-3 seconds
      const success = Math.random() > 0.1; // 90% success rate

      // Record in monitor and chunker
      monitor.recordUpload(chunkSize, duration, success);
      chunker.recordChunkResult(chunkSize, duration, success);

      // Record in metrics
      metrics.recordChunk({
        chunkIndex: i,
        size: chunkSize,
        duration,
        speed: success ? chunkSize / (duration / 1000) : 0,
        success,
        retryCount: success ? 0 : 1,
        networkCondition: monitor.getNetworkCondition().type,
        chunkingStrategy: decision.strategy,
      });
    }

    const sessionMetrics = metrics.endSession();
    const networkCondition = monitor.getNetworkCondition();
    const insights = metrics.getPerformanceInsights();

    expect(sessionMetrics).toBeDefined();
    expect(networkCondition.type).toBeDefined();
    expect(insights.recommendations.length).toBeGreaterThan(0);
  });
});

describe("ChunkBuffer", () => {
  it("should buffer small chunks until threshold is met", () => {
    const buffer = new ChunkBuffer({
      minThreshold: 5 * 1024 * 1024, // 5MB threshold like S3
    });

    // Add several small chunks
    const chunk1 = new Uint8Array(1024 * 1024); // 1MB
    const chunk2 = new Uint8Array(2 * 1024 * 1024); // 2MB
    const chunk3 = new Uint8Array(1024 * 1024); // 1MB - total 4MB so far
    const chunk4 = new Uint8Array(2 * 1024 * 1024); // 2MB - this will make it 6MB, >= 5MB threshold

    expect(buffer.add(chunk1)).toBeNull(); // 1MB - not enough yet
    expect(buffer.add(chunk2)).toBeNull(); // 3MB - still not enough
    expect(buffer.add(chunk3)).toBeNull(); // 4MB - still not enough

    const result = buffer.add(chunk4); // Now 6MB total, should flush
    expect(result).not.toBeNull();
    expect(result?.size).toBe(6 * 1024 * 1024); // 6MB total
    expect(result?.data.length).toBe(6 * 1024 * 1024);
  });

  it("should flush on timeout even if threshold not met", async () => {
    const buffer = new ChunkBuffer({
      minThreshold: 5 * 1024 * 1024, // 5MB
      timeoutMs: 100, // 100ms timeout
    });

    const smallChunk = new Uint8Array(1024 * 1024); // 1MB
    expect(buffer.add(smallChunk)).toBeNull();

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Should flush due to timeout
    expect(buffer.shouldFlush()).toBe(true);
    const result = buffer.flush();
    expect(result).not.toBeNull();
    expect(result?.size).toBe(1024 * 1024); // 1MB
  });

  it("should flush when max buffer size is reached", () => {
    const buffer = new ChunkBuffer({
      minThreshold: 10 * 1024 * 1024, // 10MB threshold
      maxBufferSize: 6 * 1024 * 1024, // 6MB max buffer
    });

    const chunk = new Uint8Array(3 * 1024 * 1024); // 3MB chunks

    expect(buffer.add(chunk)).toBeNull(); // 3MB - not max yet
    const result = buffer.add(chunk); // 6MB - should hit max buffer

    expect(result).not.toBeNull();
    expect(result?.size).toBe(6 * 1024 * 1024);
  });

  it("should provide accurate buffer info", () => {
    const buffer = new ChunkBuffer({
      minThreshold: 5 * 1024 * 1024,
    });

    const chunk = new Uint8Array(2 * 1024 * 1024); // 2MB
    buffer.add(chunk);

    const info = buffer.getBufferInfo();
    expect(info.size).toBe(2 * 1024 * 1024);
    expect(info.chunkCount).toBe(1);
    expect(info.isReadyToFlush).toBe(false);
    expect(info.timeSinceLastAdd).toBeLessThan(100); // Recent
  });
});
