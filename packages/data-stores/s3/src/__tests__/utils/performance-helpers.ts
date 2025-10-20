import { Effect } from "effect";

export interface PerformanceMetrics {
  startTime: number;
  endTime: number;
  durationMs: number;
  bytesProcessed: number;
  throughputBps: number; // bytes per second
  throughputMbps: number; // megabits per second
  memoryDelta: number;
}

export interface MemoryMetrics {
  heapUsedBefore: number;
  heapUsedAfter: number;
  heapUsedDelta: number;
  heapTotalBefore: number;
  heapTotalAfter: number;
  external: number;
  arrayBuffers: number;
}

export interface ConcurrentMetrics {
  totalOperations: number;
  totalDuration: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  maxDuration: number;
  minDuration: number;
  concurrencyLevel: number;
}

/**
 * Measure performance of an Effect operation
 */
export const measurePerformance = <A, E>(
  operation: Effect.Effect<A, E>,
  bytesProcessed: number = 0,
): Effect.Effect<{ result: A; metrics: PerformanceMetrics }, E> =>
  Effect.gen(function* () {
    const startTime = performance.now();
    const startMemory = process.memoryUsage();

    const result = yield* operation;

    const endTime = performance.now();
    const endMemory = process.memoryUsage();

    const durationMs = endTime - startTime;
    const throughputBps =
      bytesProcessed > 0 ? (bytesProcessed * 1000) / durationMs : 0;
    const throughputMbps = (throughputBps * 8) / (1024 * 1024);
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

    const metrics: PerformanceMetrics = {
      startTime,
      endTime,
      durationMs,
      bytesProcessed,
      throughputBps,
      throughputMbps,
      memoryDelta,
    };

    return { result, metrics };
  });

/**
 * Measure memory usage of an Effect operation
 */
export const measureMemory = <A, E>(
  operation: Effect.Effect<A, E>,
): Effect.Effect<{ result: A; memory: MemoryMetrics }, E> =>
  Effect.gen(function* () {
    // Force garbage collection if available (for more accurate measurements)
    if (global.gc) {
      global.gc();
    }

    const memoryBefore = process.memoryUsage();

    const result = yield* operation;

    // Force garbage collection again
    if (global.gc) {
      global.gc();
    }

    const memoryAfter = process.memoryUsage();

    const memory: MemoryMetrics = {
      heapUsedBefore: memoryBefore.heapUsed,
      heapUsedAfter: memoryAfter.heapUsed,
      heapUsedDelta: memoryAfter.heapUsed - memoryBefore.heapUsed,
      heapTotalBefore: memoryBefore.heapTotal,
      heapTotalAfter: memoryAfter.heapTotal,
      external: memoryAfter.external,
      arrayBuffers: memoryAfter.arrayBuffers,
    };

    return { result, memory };
  });

/**
 * Measure concurrent operations performance
 */
export const measureConcurrentOps = <A, E>(
  operations: Effect.Effect<A, E>[],
  concurrency: number = operations.length,
): Effect.Effect<{ results: A[]; metrics: ConcurrentMetrics }, E> =>
  Effect.gen(function* () {
    const startTime = performance.now();
    const individualMetrics: PerformanceMetrics[] = [];

    const results = yield* Effect.forEach(
      operations,
      (operation) =>
        measurePerformance(operation).pipe(
          Effect.tap(({ metrics }) =>
            Effect.sync(() => individualMetrics.push(metrics)),
          ),
          Effect.map(({ result }) => result),
        ),
      { concurrency },
    );

    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    const successfulOps = individualMetrics.length;
    const failedOps = operations.length - successfulOps;

    const durations = individualMetrics.map((m) => m.durationMs);
    const averageDuration =
      durations.reduce((sum, dur) => sum + dur, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);

    const metrics: ConcurrentMetrics = {
      totalOperations: operations.length,
      successfulOperations: successfulOps,
      failedOperations: failedOps,
      totalDuration,
      averageDuration,
      maxDuration,
      minDuration,
      concurrencyLevel: concurrency,
    };

    return { results, metrics };
  });

/**
 * Performance benchmark for upload operations
 */
export interface UploadBenchmark {
  fileSize: number;
  partSize?: number;
  concurrency?: number;
  expectedThroughputMbps?: number;
  maxDurationMs?: number;
  maxMemoryUsageMB?: number;
}

export const benchmarkUpload = (
  uploadOperation: Effect.Effect<unknown, unknown>,
  benchmark: UploadBenchmark,
): Effect.Effect<
  {
    success: boolean;
    metrics: PerformanceMetrics;
    memory: MemoryMetrics;
    issues: string[];
  },
  unknown
> =>
  Effect.gen(function* () {
    const issues: string[] = [];

    const { metrics, memory } = yield* measureMemory(
      measurePerformance(uploadOperation, benchmark.fileSize),
    ).pipe(
      Effect.map(({ result: { result, metrics }, memory }) => ({
        result,
        metrics,
        memory,
      })),
    );

    // Check performance benchmarks
    if (
      benchmark.expectedThroughputMbps &&
      metrics.throughputMbps < benchmark.expectedThroughputMbps
    ) {
      issues.push(
        `Throughput ${metrics.throughputMbps.toFixed(2)} Mbps below expected ` +
          `${benchmark.expectedThroughputMbps} Mbps`,
      );
    }

    if (
      benchmark.maxDurationMs &&
      metrics.durationMs > benchmark.maxDurationMs
    ) {
      issues.push(
        `Duration ${metrics.durationMs.toFixed(2)}ms exceeds maximum ` +
          `${benchmark.maxDurationMs}ms`,
      );
    }

    const memoryUsageMB = memory.heapUsedDelta / (1024 * 1024);
    if (
      benchmark.maxMemoryUsageMB &&
      memoryUsageMB > benchmark.maxMemoryUsageMB
    ) {
      issues.push(
        `Memory usage ${memoryUsageMB.toFixed(2)}MB exceeds maximum ` +
          `${benchmark.maxMemoryUsageMB}MB`,
      );
    }

    return {
      success: issues.length === 0,
      metrics,
      memory,
      issues,
    };
  });

/**
 * Utility to format performance metrics for test output
 */
export const formatMetrics = (metrics: PerformanceMetrics): string => {
  const sizeFormatted = (metrics.bytesProcessed / (1024 * 1024)).toFixed(2);
  const throughputFormatted = metrics.throughputMbps.toFixed(2);
  const durationFormatted = metrics.durationMs.toFixed(2);

  return `${sizeFormatted}MB in ${durationFormatted}ms (${throughputFormatted} Mbps)`;
};

/**
 * Utility to format memory metrics for test output
 */
export const formatMemoryMetrics = (memory: MemoryMetrics): string => {
  const heapDeltaMB = (memory.heapUsedDelta / (1024 * 1024)).toFixed(2);
  const heapAfterMB = (memory.heapUsedAfter / (1024 * 1024)).toFixed(2);
  const externalMB = (memory.external / (1024 * 1024)).toFixed(2);

  return `Heap: ${heapAfterMB}MB (+${heapDeltaMB}MB), External: ${externalMB}MB`;
};

/**
 * Utility to format concurrent metrics for test output
 */
export const formatConcurrentMetrics = (metrics: ConcurrentMetrics): string => {
  const successRate = (
    (metrics.successfulOperations / metrics.totalOperations) *
    100
  ).toFixed(1);
  const avgDuration = metrics.averageDuration.toFixed(2);

  return (
    `${metrics.successfulOperations}/${metrics.totalOperations} ops (${successRate}%) ` +
    `avg ${avgDuration}ms (${metrics.minDuration.toFixed(2)}-${metrics.maxDuration.toFixed(2)}ms)`
  );
};

/**
 * Create performance benchmarks for different file sizes
 */
export const createPerformanceBenchmarks = (): Record<
  string,
  UploadBenchmark
> => ({
  tiny: {
    fileSize: 1024, // 1KB
    expectedThroughputMbps: 0.1, // Much more relaxed for test environment
    maxDurationMs: 1000,
    maxMemoryUsageMB: 5, // More realistic for test environment
  },
  small: {
    fileSize: 1024 * 1024, // 1MB
    expectedThroughputMbps: 1, // More relaxed
    maxDurationMs: 5000,
    maxMemoryUsageMB: 10,
  },
  medium: {
    fileSize: 10 * 1024 * 1024, // 10MB
    expectedThroughputMbps: 5, // Much more relaxed
    maxDurationMs: 10000,
    maxMemoryUsageMB: 25,
  },
  large: {
    fileSize: 50 * 1024 * 1024, // 50MB
    expectedThroughputMbps: 10, // Much more relaxed
    maxDurationMs: 30000,
    maxMemoryUsageMB: 50,
  },
});

/**
 * Progress tracker for testing upload progress callbacks
 */
export class ProgressTracker {
  private updates: { offset: number; timestamp: number }[] = [];

  readonly onProgress = (offset: number) => {
    this.updates.push({ offset, timestamp: performance.now() });
  };

  getUpdates() {
    return [...this.updates];
  }

  getProgressRate(): number {
    if (this.updates.length < 2) return 0;

    const first = this.updates[0];
    const last = this.updates[this.updates.length - 1];

    const bytesPerMs =
      (last.offset - first.offset) / (last.timestamp - first.timestamp);
    return bytesPerMs * 1000; // bytes per second
  }

  getTotalBytesTracked(): number {
    return this.updates.length > 0
      ? this.updates[this.updates.length - 1].offset
      : 0;
  }

  getUpdateCount(): number {
    return this.updates.length;
  }

  clear() {
    this.updates = [];
  }
}

/**
 * Stress test configuration
 */
export interface StressTestConfig {
  concurrentUploads: number;
  fileSize: number;
  totalFiles: number;
  maxErrorRate: number; // 0-1, acceptable error rate
  minThroughputMbps: number;
  maxTestDurationMs: number;
}

/**
 * Run a stress test with multiple concurrent uploads
 */
export const runStressTest = <A, E>(
  createUpload: () => Effect.Effect<A, E>,
  config: StressTestConfig,
): Effect.Effect<
  {
    success: boolean;
    metrics: ConcurrentMetrics;
    errorRate: number;
    totalThroughputMbps: number;
    issues: string[];
  },
  E
> =>
  Effect.gen(function* () {
    const issues: string[] = [];
    const startTime = performance.now();

    // Create batches of concurrent uploads
    const batches = Math.ceil(config.totalFiles / config.concurrentUploads);
    let totalResults: A[] = [];
    const allMetrics: ConcurrentMetrics[] = [];

    for (let batch = 0; batch < batches; batch++) {
      const remainingFiles =
        config.totalFiles - batch * config.concurrentUploads;
      const batchSize = Math.min(config.concurrentUploads, remainingFiles);

      const batchOperations = Array.from({ length: batchSize }, () =>
        createUpload(),
      );

      const { results, metrics } = yield* measureConcurrentOps(
        batchOperations,
        config.concurrentUploads,
      );

      totalResults = [...totalResults, ...results];
      allMetrics.push(metrics);

      // Check if we're exceeding time limit
      const currentTime = performance.now();
      if (currentTime - startTime > config.maxTestDurationMs) {
        issues.push(
          `Test exceeded maximum duration ${config.maxTestDurationMs}ms`,
        );
        break;
      }
    }

    // Aggregate metrics
    const totalOps = allMetrics.reduce((sum, m) => sum + m.totalOperations, 0);

    const totalSuccessful = allMetrics.reduce(
      (sum, m) => sum + m.successfulOperations,
      0,
    );
    const totalFailed = allMetrics.reduce(
      (sum, m) => sum + m.failedOperations,
      0,
    );
    const avgDuration =
      allMetrics.reduce((sum, m) => sum + m.averageDuration, 0) /
      allMetrics.length;

    const errorRate = totalFailed / totalOps;
    const endTime = performance.now();
    const totalDurationMs = endTime - startTime;
    const totalBytes = config.fileSize * totalSuccessful;
    const totalThroughputMbps =
      (totalBytes * 8) / (totalDurationMs * 1024 * 1024);

    const aggregatedMetrics: ConcurrentMetrics = {
      totalOperations: totalOps,
      totalDuration: totalDurationMs,
      successfulOperations: totalSuccessful,
      failedOperations: totalFailed,
      averageDuration: avgDuration,
      maxDuration: Math.max(...allMetrics.map((m) => m.maxDuration)),
      minDuration: Math.min(...allMetrics.map((m) => m.minDuration)),
      concurrencyLevel: config.concurrentUploads,
    };

    // Check benchmarks
    if (errorRate > config.maxErrorRate) {
      issues.push(
        `Error rate ${(errorRate * 100).toFixed(1)}% exceeds maximum ${(config.maxErrorRate * 100).toFixed(1)}%`,
      );
    }

    if (totalThroughputMbps < config.minThroughputMbps) {
      issues.push(
        `Total throughput ${totalThroughputMbps.toFixed(2)} Mbps below minimum ${config.minThroughputMbps} Mbps`,
      );
    }

    return {
      success: issues.length === 0,
      metrics: aggregatedMetrics,
      errorRate,
      totalThroughputMbps,
      issues,
    };
  });
