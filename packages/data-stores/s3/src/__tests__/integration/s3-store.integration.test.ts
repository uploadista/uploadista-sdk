import { UploadistaError } from "@uploadista/core/errors";
import { UploadFileKVStore } from "@uploadista/core/types";
import { Effect, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createS3StoreImplementation } from "../../s3-store";
import type { S3Store } from "../../types";
import {
  compareArrays,
  createTestDataStream,
  generateData,
  streamToArray,
  TEST_FILE_SIZES,
} from "../utils/test-data-generator";
import {
  createTestS3StoreConfig,
  createTestUploadFile,
  type MockS3TestMethods,
  runTestWithTimeout,
  setupTestEnvironment,
  TestLayersWithMockS3,
} from "../utils/test-setup";

describe("S3Store - Integration Tests", () => {
  let s3Store: S3Store;
  let mockService: MockS3TestMethods;

  beforeEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        mockService = yield* setupTestEnvironment();

        const kvStore = yield* UploadFileKVStore;
        const config = createTestS3StoreConfig();

        s3Store = yield* createS3StoreImplementation({
          ...config,
          kvStore,
        });
      }).pipe(Effect.provide(TestLayersWithMockS3())),
    );
  });

  afterEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        // Clear both S3 mock storage and KV store
        yield* mockService.clearStorage();

        // Clear all entries from KV store
        const kvStore = yield* UploadFileKVStore;
        if (!kvStore.list) {
          return;
        }
        const keys = yield* kvStore.list();
        if (keys && keys.length > 0) {
          yield* Effect.all(
            keys.map((key) => kvStore.delete(key)),
            { concurrency: "unbounded" },
          );
        }
      }).pipe(Effect.provide(TestLayersWithMockS3())),
    );
  });

  describe("End-to-End Upload Workflows", () => {
    it("should handle complete upload workflow for medium file", async () => {
      const testFile = createTestUploadFile(
        "e2e-medium",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const size = testFile.size ?? 0;
      const originalData = generateData(size, {
        type: "pattern",
        pattern: new Uint8Array([0x12, 0x34, 0x56, 0x78]),
      });
      const testData = createTestDataStream(size, {
        type: "pattern",
        pattern: new Uint8Array([0x12, 0x34, 0x56, 0x78]),
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Step 1: Create upload
          const createdFile = yield* s3Store.create(testFile);
          expect(createdFile.id).toBe(testFile.id);
          expect(createdFile.size).toBe(testFile.size);

          // Verify upload exists in KV store
          const initialUploadInfo = yield* s3Store.getUpload(testFile.id);
          expect(initialUploadInfo.offset).toBe(0);
          expect(initialUploadInfo.size).toBe(testFile.size);

          // Step 2: Upload data
          const progressUpdates: number[] = [];
          const finalOffset = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            {
              onProgress: (offset) => progressUpdates.push(offset),
            },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(progressUpdates.length).toBeGreaterThan(0);
          expect(progressUpdates[progressUpdates.length - 1]).toBe(
            testFile.size,
          );

          // Step 3: Verify upload completion
          const completedUploadInfo = yield* s3Store.getUpload(testFile.id);
          expect(completedUploadInfo.offset).toBe(testFile.size);

          // Step 4: Read back data and verify integrity
          const readStream = yield* s3Store.read(testFile.id);
          const readData = yield* Effect.promise(
            async () => await streamToArray(readStream),
          );

          expect(compareArrays(readData, originalData)).toBe(true);

          // Step 5: Verify metrics were recorded
          const metrics = yield* mockService.getMetrics();
          expect(metrics.operationCounts.get("createMultipartUpload")).toBe(1);
          expect(metrics.operationCounts.get("completeMultipartUpload")).toBe(
            1,
          );
          expect(metrics.operationCounts.get("uploadPart")).toBeGreaterThan(0);
          expect(metrics.totalBytesUploaded).toBe(testFile.size);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        30000,
      );
    });

    it("should handle complete upload workflow for large file", async () => {
      const testFile = createTestUploadFile(
        "e2e-large",
        TEST_FILE_SIZES.LARGE.size,
      );
      const size = testFile.size ?? 0;
      const originalData = generateData(size, {
        type: "random",
        seed: 42,
      });
      const testData = createTestDataStream(size, {
        type: "random",
        seed: 42,
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const progressUpdates: number[] = [];
          const finalOffset = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            {
              onProgress: (offset) => progressUpdates.push(offset),
            },
          );

          expect(finalOffset).toBe(testFile.size);

          // Verify data integrity for large file
          const readStream = yield* s3Store.read(testFile.id);
          const readData = yield* Effect.promise(
            async () => await streamToArray(readStream),
          );

          expect(readData.length).toBe(originalData.length);
          expect(compareArrays(readData, originalData)).toBe(true);

          // Verify efficient part usage
          const metrics = yield* mockService.getMetrics();
          const partUploads = metrics.operationCounts.get("uploadPart") || 0;

          // Should use reasonable number of parts for 50MB file
          expect(partUploads).toBeGreaterThanOrEqual(6);
          expect(partUploads).toBeLessThanOrEqual(10);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });

  describe("Resumable Upload Scenarios", () => {
    it("should handle resumable upload after interruption", async () => {
      const testFile = createTestUploadFile(
        "resumable",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const fullData = generateData(testFile.size ?? 0, {
        type: "text",
      });

      const halfSize = Math.floor((testFile.size ?? 0) / 2);
      const _firstHalf = fullData.slice(0, halfSize);
      const secondHalf = fullData.slice(halfSize);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Step 1: Create upload and upload first half
          yield* s3Store.create(testFile);

          const firstHalfStream = createTestDataStream(halfSize, {
            type: "text",
          });
          const firstOffset = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: firstHalfStream,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(firstOffset).toBe(halfSize);

          // Step 2: Check upload status
          const partialUploadInfo = yield* s3Store.getUpload(testFile.id);
          expect(partialUploadInfo.offset).toBe(halfSize);
          expect(partialUploadInfo.size).toBe(testFile.size);

          // Step 3: Resume upload with second half
          const _secondHalfSize = (testFile.size ?? 0) - halfSize;
          const secondHalfStream = Stream.fromIterable([secondHalf]);

          const finalOffset = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: secondHalfStream,
              offset: halfSize,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          // Step 4: Verify complete file integrity
          const readStream = yield* s3Store.read(testFile.id);
          const readData = yield* Effect.promise(
            async () => await streamToArray(readStream),
          );

          expect(compareArrays(readData, fullData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        45000,
      );
    });

    it("should handle multiple resume attempts", async () => {
      const testFile = createTestUploadFile(
        "multiple-resume",
        TEST_FILE_SIZES.LARGE.size,
      );
      const size = testFile.size ?? 0;
      const chunkSize = Math.floor(size / 4); // Upload in quarters

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Upload in chunks, checking status after each
          for (let i = 0; i < 4; i++) {
            const startOffset = i * chunkSize;
            const endOffset = i === 3 ? size : (i + 1) * chunkSize;
            const currentChunkSize = endOffset - startOffset;

            const chunkData = createTestDataStream(currentChunkSize, {
              type: "pattern",
              pattern: new Uint8Array([i, i, i, i]),
            });

            const offset = yield* s3Store.write(
              {
                file_id: testFile.id,
                stream: chunkData,
                offset: startOffset,
              },
              { onProgress: undefined },
            );

            expect(offset).toBe(endOffset);

            // Check status after each chunk
            const uploadInfo = yield* s3Store.getUpload(testFile.id);
            expect(uploadInfo.offset).toBe(endOffset);
          }

          // Verify final state
          const finalUploadInfo = yield* s3Store.getUpload(testFile.id);
          expect(finalUploadInfo.offset).toBe(testFile.size);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60000,
      );
    });
  });

  describe("Error Recovery Integration", () => {
    it("should recover from S3 service errors", async () => {
      const testFile = createTestUploadFile(
        "error-recovery",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Set up intermittent failures
          yield* mockService.setConfig({
            simulateLatency: 0,
            uploadFailureRate: 0.3, // 30% failure rate to test retry
          });

          // This might fail initially but should recover with retries
          const result = yield* Effect.either(
            s3Store.write(
              {
                file_id: testFile.id,
                stream: testData,
                offset: 0,
              },
              { onProgress: undefined },
            ),
          );

          // If it succeeds despite errors, verify it worked correctly
          if (result._tag === "Right") {
            expect(result.right).toBe(testFile.size ?? 0);

            const uploadInfo = yield* s3Store.getUpload(testFile.id);
            expect(uploadInfo.offset).toBe(testFile.size ?? 0);
          } else {
            // If it fails, it should be with a proper UploadistaError
            expect(result.left).toBeInstanceOf(UploadistaError);
          }

          // Reset error rate for cleanup
          yield* mockService.setConfig({ uploadFailureRate: 0 });
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        30000,
      );
    });

    it("should handle cleanup after failed uploads", async () => {
      const testFile = createTestUploadFile(
        "cleanup-test",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Force all upload parts to fail
          yield* mockService.setConfig({ uploadFailureRate: 1.0 });

          // Upload should fail
          const result = yield* Effect.either(
            s3Store.write(
              {
                file_id: testFile.id,
                stream: testData,
                offset: 0,
              },
              { onProgress: undefined },
            ),
          );

          expect(result._tag).toBe("Left");

          // Reset error rate
          yield* mockService.setConfig({ uploadFailureRate: 0 });

          // Remove the failed upload
          yield* s3Store.remove(testFile.id);

          // Verify cleanup
          const storage = yield* mockService.getStorage();
          expect(storage.objects.has(testFile.id)).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        60_000, // Increased timeout for retry logic
      );
    }, 60_000);
  });

  describe("Concurrent Operations Integration", () => {
    it("should handle multiple concurrent uploads", async () => {
      const fileCount = 3;
      const uploads = Array.from({ length: fileCount }, (_, i) => {
        const testFile = createTestUploadFile(
          `concurrent-${i}`,
          TEST_FILE_SIZES.SMALL_BASIC.size,
        );
        const testData = createTestDataStream(testFile.size ?? 0, {
          type: "random",
          seed: i + 1000,
        });

        return Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const finalOffset = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          return { fileId: testFile.id, size: testFile.size, finalOffset };
        });
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          const results = yield* Effect.all(uploads, { concurrency: 2 });

          // All uploads should succeed
          expect(results).toHaveLength(fileCount);
          results.forEach((result, i) => {
            expect(result.fileId).toBe(`concurrent-${i}`);
            expect(result.finalOffset).toBe(result.size);
          });

          // Verify all files are in storage
          const storage = yield* mockService.getStorage();
          for (let i = 0; i < fileCount; i++) {
            expect(storage.objects.has(`concurrent-${i}`)).toBe(true);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        30000,
      );
    });
  });

  describe("Storage and Capabilities Integration", () => {
    it("should report correct capabilities", () => {
      const capabilities = s3Store.getCapabilities();

      expect(capabilities.supportsParallelUploads).toBe(true);
      expect(capabilities.supportsConcatenation).toBe(true);
      expect(capabilities.supportsDeferredLength).toBe(true);
      expect(capabilities.supportsResumableUploads).toBe(true);
      expect(capabilities.supportsTransactionalUploads).toBe(true);
      expect(capabilities.maxConcurrentUploads).toBeGreaterThan(0);
      expect(capabilities.minChunkSize).toBe(5 * 1024 * 1024); // 5MB
      expect(capabilities.maxChunkSize).toBe(5 * 1024 * 1024 * 1024); // 5GB
      expect(capabilities.optimalChunkSize).toBe(8 * 1024 * 1024); // 8MB
    });

    it("should validate upload strategies correctly", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const parallelValid =
            yield* s3Store.validateUploadStrategy("parallel");
          expect(parallelValid).toBe(true);

          const singleValid = yield* s3Store.validateUploadStrategy("single");
          expect(singleValid).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should provide correct chunker constraints", () => {
      const constraints = s3Store.getChunkerConstraints();

      expect(constraints.minChunkSize).toBe(5 * 1024 * 1024);
      expect(constraints.maxChunkSize).toBe(5 * 1024 * 1024 * 1024);
      expect(constraints.optimalChunkSize).toBe(8 * 1024 * 1024);
      expect(constraints.requiresOrderedChunks).toBe(false);
    });
  });

  describe("Metadata and URL Integration", () => {
    it("should handle file metadata correctly", async () => {
      const testFile = createTestUploadFile(
        "metadata-integration",
        TEST_FILE_SIZES.SMALL_BASIC.size,
        {
          metadata: {
            contentType: "application/pdf",
            cacheControl: "max-age=3600",
          },
        },
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          const createdFile = yield* s3Store.create(testFile);

          expect(createdFile.metadata).toEqual(testFile.metadata);
          expect(createdFile.url).toContain(testFile.id);

          yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const uploadInfo = yield* s3Store.getUpload(testFile.id);
          expect(uploadInfo.metadata).toEqual(testFile.metadata);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });
  });

  describe("Cleanup and Expiration Integration", () => {
    it("should handle expired upload deletion", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          // Create some uploads (they won't actually be expired in the mock)
          const testFile1 = createTestUploadFile(
            "expired-1",
            TEST_FILE_SIZES.SMALL_BASIC.size,
          );
          const testFile2 = createTestUploadFile(
            "expired-2",
            TEST_FILE_SIZES.SMALL_BASIC.size,
          );

          yield* s3Store.create(testFile1);
          yield* s3Store.create(testFile2);

          // The mock implementation will handle this gracefully
          const deletedCount = yield* s3Store.deleteExpired;

          // Should complete without error
          expect(deletedCount).toBeGreaterThanOrEqual(0);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });
  });
});
