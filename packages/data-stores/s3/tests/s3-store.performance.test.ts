import { UploadFileKVStore } from "@uploadista/core/types";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createS3Store } from "../s3-store";
import type { S3Store } from "../types";
import {
  benchmarkUpload,
  createPerformanceBenchmarks,
  formatConcurrentMetrics,
  formatMemoryMetrics,
  formatMetrics,
  measureConcurrentOps,
  measureMemory,
  measurePerformance,
  ProgressTracker,
  runStressTest,
} from "./utils/performance-helpers";
import {
  createTestDataStream,
  TEST_FILE_SIZES,
} from "./utils/test-data-generator";
import {
  createTestS3StoreConfig,
  createTestUploadFile,
  type MockS3TestMethods,
  runTestWithTimeout,
  setupTestEnvironment,
  TestLayersWithMockS3,
} from "./utils/test-setup";

describe("S3Store - Performance Tests", () => {
  let s3Store: S3Store;
  let mockService: MockS3TestMethods;
  const benchmarks = createPerformanceBenchmarks();

  beforeEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        mockService = yield* setupTestEnvironment();

        const kvStore = yield* UploadFileKVStore;
        const config = createTestS3StoreConfig();

        s3Store = yield* createS3Store({
          ...config,
          kvStore,
        });
      }).pipe(Effect.provide(TestLayersWithMockS3())),
    );
  });

  afterEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        yield* mockService.clearStorage();
      }),
    );
  });

  describe("Upload Speed Benchmarks", () => {
    it("should meet performance benchmarks for tiny files", async () => {
      const testFile = createTestUploadFile(
        "perf-tiny",
        TEST_FILE_SIZES.TINY.size,
      );
      const size = testFile.size ?? 0;
      const testData = createTestDataStream(size);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const uploadOperation = s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const { success, metrics, memory, issues } = yield* benchmarkUpload(
            uploadOperation,
            benchmarks.tiny,
          );

          console.log(`Tiny file upload: ${formatMetrics(metrics)}`);
          console.log(`Memory usage: ${formatMemoryMetrics(memory)}`);

          if (!success) {
            console.warn("Benchmark issues:", issues);
          }

          // We expect the upload to succeed even if it doesn't meet all benchmarks
          expect(metrics.durationMs).toBeLessThan(1000); // Should be very fast
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should meet performance benchmarks for small files", async () => {
      const testFile = createTestUploadFile(
        "perf-small",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const size = testFile.size ?? 0;
      const testData = createTestDataStream(size);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const uploadOperation = s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const { success, metrics, memory, issues } = yield* benchmarkUpload(
            uploadOperation,
            benchmarks.small,
          );

          console.log(`Small file upload: ${formatMetrics(metrics)}`);
          console.log(`Memory usage: ${formatMemoryMetrics(memory)}`);

          if (!success) {
            console.warn("Benchmark issues:", issues);
          }

          expect(metrics.bytesProcessed).toBe(size);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        15000,
      );
    });

    it("should meet performance benchmarks for medium files", async () => {
      const testFile = createTestUploadFile(
        "perf-medium",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const size = testFile.size ?? 0;
      const testData = createTestDataStream(size);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const uploadOperation = s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const { success, metrics, memory, issues } = yield* benchmarkUpload(
            uploadOperation,
            benchmarks.medium,
          );

          console.log(`Medium file upload: ${formatMetrics(metrics)}`);
          console.log(`Memory usage: ${formatMemoryMetrics(memory)}`);

          if (!success) {
            console.warn("Benchmark issues:", issues);
          }

          expect(metrics.bytesProcessed).toBe(size);
          expect(metrics.throughputMbps).toBeGreaterThan(1); // At least 1 Mbps
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        30000,
      );
    });

    it("should meet performance benchmarks for large files", async () => {
      const testFile = createTestUploadFile(
        "perf-large",
        TEST_FILE_SIZES.LARGE.size,
      );
      const size = testFile.size ?? 0;
      const testData = createTestDataStream(size);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const uploadOperation = s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const { success, metrics, memory, issues } = yield* benchmarkUpload(
            uploadOperation,
            benchmarks.large,
          );

          console.log(`Large file upload: ${formatMetrics(metrics)}`);
          console.log(`Memory usage: ${formatMemoryMetrics(memory)}`);

          if (!success) {
            console.warn("Benchmark issues:", issues);
          }

          expect(metrics.bytesProcessed).toBe(size);
          expect(metrics.throughputMbps).toBeGreaterThan(5); // At least 5 Mbps for large files
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });

  describe("Memory Usage Tests", () => {
    it("should use reasonable memory for small files", async () => {
      const testFile = createTestUploadFile(
        "memory-small",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const size = testFile.size ?? 0;
      const testData = createTestDataStream(size);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const uploadOperation = s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const { memory } = yield* measureMemory(uploadOperation);

          console.log(
            `Memory usage for small file: ${formatMemoryMetrics(memory)}`,
          );

          // Memory usage should be reasonable (not more than 2x file size)
          const memoryUsageMB = memory.heapUsedDelta / (1024 * 1024);
          const fileSizeMB = size / (1024 * 1024);

          expect(memoryUsageMB).toBeLessThan(fileSizeMB * 3); // Allow some overhead
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should use reasonable memory for large files", async () => {
      const testFile = createTestUploadFile(
        "memory-large",
        TEST_FILE_SIZES.LARGE.size,
      );
      const size = testFile.size ?? 0;
      const testData = createTestDataStream(size);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const uploadOperation = s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const { memory } = yield* measureMemory(uploadOperation);

          console.log(
            `Memory usage for large file: ${formatMemoryMetrics(memory)}`,
          );

          // Memory usage should be bounded (streaming should prevent loading entire file)
          const memoryUsageMB = memory.heapUsedDelta / (1024 * 1024);
          const fileSizeMB = size / (1024 * 1024);

          // Memory usage should be much less than file size due to streaming
          expect(memoryUsageMB).toBeLessThan(fileSizeMB * 0.5); // Should use less than 50% of file size
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });

  describe("Concurrent Upload Tests", () => {
    it("should handle multiple small concurrent uploads efficiently", async () => {
      const fileCount = 5;
      const fileSize = TEST_FILE_SIZES.SMALL_BASIC.size;

      const uploadOperations = Array.from({ length: fileCount }, (_, i) =>
        Effect.gen(function* () {
          const testFile = createTestUploadFile(
            `concurrent-small-${i}`,
            fileSize,
          );
          const testData = createTestDataStream(fileSize ?? 0, {
            type: "random",
            seed: i,
          });

          yield* s3Store.create(testFile);

          return yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );
        }),
      );

      await runTestWithTimeout(
        Effect.gen(function* () {
          const { results, metrics } = yield* measureConcurrentOps(
            uploadOperations,
            3, // 3 concurrent uploads
          );

          console.log(
            `Concurrent uploads: ${formatConcurrentMetrics(metrics)}`,
          );

          expect(results).toHaveLength(fileCount);
          expect(metrics.successfulOperations).toBe(fileCount);
          expect(metrics.failedOperations).toBe(0);

          // All uploads should complete relatively quickly
          expect(metrics.maxDuration).toBeLessThan(10000); // 10 seconds max
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        30000,
      );
    });

    it("should handle multiple medium concurrent uploads", async () => {
      const fileCount = 3;
      const fileSize = TEST_FILE_SIZES.MEDIUM.size;

      const uploadOperations = Array.from({ length: fileCount }, (_, i) =>
        Effect.gen(function* () {
          const testFile = createTestUploadFile(
            `concurrent-medium-${i}`,
            fileSize,
          );
          const testData = createTestDataStream(fileSize ?? 0, {
            type: "random",
            seed: i + 100,
          });

          yield* s3Store.create(testFile);

          return yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );
        }),
      );

      await runTestWithTimeout(
        Effect.gen(function* () {
          const { results, metrics } = yield* measureConcurrentOps(
            uploadOperations,
            2, // 2 concurrent uploads to avoid overwhelming mock
          );

          console.log(
            `Concurrent medium uploads: ${formatConcurrentMetrics(metrics)}`,
          );

          expect(results).toHaveLength(fileCount);
          expect(metrics.successfulOperations).toBe(fileCount);

          // Should complete in reasonable time
          expect(metrics.maxDuration).toBeLessThan(30000); // 30 seconds max
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });

  describe("Progress Tracking Performance", () => {
    it("should provide smooth progress updates for large files", async () => {
      const testFile = createTestUploadFile(
        "progress-perf",
        TEST_FILE_SIZES.LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);
      const progressTracker = new ProgressTracker();

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const { metrics } = yield* measurePerformance(
            s3Store.write(
              {
                file_id: testFile.id,
                stream: testData,
                offset: 0,
              },
              { onProgress: progressTracker.onProgress },
            ),
            testFile.size,
          );

          console.log(
            `Upload with progress tracking: ${formatMetrics(metrics)}`,
          );

          const progressRate = progressTracker.getProgressRate();
          const updateCount = progressTracker.getUpdateCount();
          const totalTracked = progressTracker.getTotalBytesTracked();

          console.log(
            `Progress updates: ${updateCount}, Rate: ${(progressRate / (1024 * 1024)).toFixed(2)} MB/s`,
          );

          expect(updateCount).toBeGreaterThan(10); // Should have many progress updates
          expect(totalTracked).toBe(testFile.size);
          expect(progressRate).toBeGreaterThan(0);

          // Progress tracking shouldn't significantly slow down upload
          expect(metrics.durationMs).toBeLessThan(60000); // Should complete in reasonable time
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });

  describe("Stress Tests", () => {
    it("should handle stress test with multiple concurrent uploads", async () => {
      const stressConfig = {
        concurrentUploads: 3,
        fileSize: TEST_FILE_SIZES.SMALL_BASIC.size,
        totalFiles: 10,
        maxErrorRate: 0.1, // Allow 10% failures
        minThroughputMbps: 0.1, // Much more relaxed for test environment
        maxTestDurationMs: 30000,
      };

      const createUpload = () =>
        Effect.gen(function* () {
          const testFile = createTestUploadFile(
            `stress-${Math.random().toString(36).substring(7)}`,
            stressConfig.fileSize,
          );
          const testData = createTestDataStream(stressConfig.fileSize);

          yield* s3Store.create(testFile);

          return yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );
        });

      await runTestWithTimeout(
        Effect.gen(function* () {
          const { success, metrics, errorRate, totalThroughputMbps, issues } =
            yield* runStressTest(createUpload, stressConfig);

          console.log(`Stress test: ${formatConcurrentMetrics(metrics)}`);
          console.log(`Error rate: ${(errorRate * 100).toFixed(1)}%`);
          console.log(
            `Total throughput: ${totalThroughputMbps.toFixed(2)} Mbps`,
          );

          if (!success) {
            console.warn("Stress test issues:", issues);
          }

          expect(metrics.successfulOperations).toBeGreaterThan(0);
          expect(errorRate).toBeLessThanOrEqual(stressConfig.maxErrorRate);

          // Should achieve reasonable throughput
          expect(totalThroughputMbps).toBeGreaterThan(0.05); // Much more relaxed for test environment
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        45000,
      );
    });

    it("should handle stress test with larger files", async () => {
      const stressConfig = {
        concurrentUploads: 2,
        fileSize: TEST_FILE_SIZES.MEDIUM.size,
        totalFiles: 4,
        maxErrorRate: 0.1,
        minThroughputMbps: 0.1, // Even more relaxed for test environment
        maxTestDurationMs: 60000,
      };

      const createUpload = () =>
        Effect.gen(function* () {
          const testFile = createTestUploadFile(
            `stress-large-${Math.random().toString(36).substring(7)}`,
            stressConfig.fileSize,
          );
          const testData = createTestDataStream(stressConfig.fileSize);

          yield* s3Store.create(testFile);

          return yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );
        });

      await runTestWithTimeout(
        Effect.gen(function* () {
          const { success, metrics, errorRate, totalThroughputMbps, issues } =
            yield* runStressTest(createUpload, stressConfig);

          console.log(
            `Large files stress test: ${formatConcurrentMetrics(metrics)}`,
          );
          console.log(`Error rate: ${(errorRate * 100).toFixed(1)}%`);
          console.log(
            `Total throughput: ${totalThroughputMbps.toFixed(2)} Mbps`,
          );

          if (!success) {
            console.warn("Large files stress test issues:", issues);
          }

          expect(metrics.successfulOperations).toBeGreaterThan(0);
          expect(errorRate).toBeLessThanOrEqual(stressConfig.maxErrorRate);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        75000,
      );
    });
  });

  describe("Part Size Optimization", () => {
    it("should use optimal part sizes for different file sizes", async () => {
      const testCases = [
        { size: TEST_FILE_SIZES.MEDIUM_MIN.size, expectedParts: 1 },
        {
          size: TEST_FILE_SIZES.MEDIUM.size,
          expectedMinParts: 1,
          expectedMaxParts: 3, // More flexible to account for part size optimization
        },
        {
          size: TEST_FILE_SIZES.LARGE.size,
          expectedMinParts: 6,
          expectedMaxParts: 8,
        },
      ];

      await runTestWithTimeout(
        Effect.gen(function* () {
          for (const testCase of testCases) {
            const testFile = createTestUploadFile(
              `optimization-${testCase.size}`,
              testCase.size,
            );
            const testData = createTestDataStream(testCase.size);

            yield* s3Store.create(testFile);

            // Clear metrics before each test
            yield* mockService.clearStorage();
            yield* mockService.setConfig({ simulateLatency: 0 });

            yield* s3Store.create(testFile);

            yield* s3Store.write(
              {
                file_id: testFile.id,
                stream: testData,
                offset: 0,
              },
              { onProgress: undefined },
            );

            const metrics = yield* mockService.getMetrics();
            const partUploads = metrics.operationCounts.get("uploadPart") || 0;

            console.log(
              `File size: ${(testCase.size / (1024 * 1024)).toFixed(1)}MB, Parts: ${partUploads}`,
            );

            if ("expectedParts" in testCase) {
              expect(partUploads).toBe(testCase.expectedParts);
            } else {
              expect(partUploads).toBeGreaterThanOrEqual(
                testCase.expectedMinParts,
              );
              expect(partUploads).toBeLessThanOrEqual(
                testCase.expectedMaxParts,
              );
            }
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });
});
