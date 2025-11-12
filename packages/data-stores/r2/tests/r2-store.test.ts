import { UploadFileKVStore } from "@uploadista/core/types";
import { Effect, Either } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  compareArrays,
  createStandardTestFiles,
  createTestDataStream,
  generateData,
  TEST_FILE_SIZES,
} from "../../s3/tests/utils/test-data-generator";
import { createR2Store } from "../src/r2-store";
import type { R2ClientService } from "../src/services/r2-client.service";
import type { R2Store } from "../src/types";
import {
  assertFileUploaded,
  assertMetricsRecorded,
  createTestUploadFile,
  type MockR2TestMethods,
  runTestWithTimeout,
  setupTestEnvironment,
  TestLayersWithMockR2,
} from "./utils/test-setup";

describe("R2Store - Basic Upload Tests", () => {
  let r2Store: R2Store;
  let mockService: R2ClientService["Type"] & MockR2TestMethods;

  beforeEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        // Setup test environment with mock R2
        mockService = yield* setupTestEnvironment();

        // Create R2 store with test configuration
        r2Store = yield* createR2Store({
          deliveryUrl: "https://test-r2-cdn.example.com",
          partSize: 8 * 1024 * 1024, // 8MB default part size
          minPartSize: 5 * 1024 * 1024, // 5MB minimum
          maxMultipartParts: 10_000,
          maxConcurrentPartUploads: 10,
          bucket: "test-r2-bucket",
          r2Bucket: {} as any,
        }).pipe(Effect.map((store) => store as unknown as R2Store));
      }).pipe(Effect.provide(TestLayersWithMockR2())),
    );
  });

  afterEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        // Clear both R2 mock storage and KV store
        yield* mockService.clearStorage();

        // Clear all entries from KV store
        const kvStore = yield* UploadFileKVStore;
        if (!kvStore.list) {
          return;
        }
        const keys = yield* kvStore.list();
        if (keys.length > 0) {
          yield* Effect.all(
            keys.map((key) => kvStore.delete(key)),
            { concurrency: "unbounded" },
          );
        }
      }).pipe(Effect.provide(TestLayersWithMockR2())),
    );
  });

  describe("Small File Uploads (< 5MB)", () => {
    it("should upload tiny files successfully", async () => {
      const testFile = createTestUploadFile(
        "tiny-test",
        TEST_FILE_SIZES.TINY.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Create upload
          const createdFile = yield* r2Store.create(testFile);
          expect(createdFile.id).toBe(testFile.id);
          expect(createdFile.size).toBe(testFile.size);

          // Write data
          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          // Verify file was uploaded
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Verify metrics
          yield* assertMetricsRecorded(mockService, "createMultipartUpload", 1);
          yield* assertMetricsRecorded(
            mockService,
            "completeMultipartUpload",
            1,
          );
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });

    it("should upload small files (1MB) successfully", async () => {
      const testFile = createTestUploadFile(
        "small-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0, {
        type: "random",
        seed: 12345,
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          // Verify the uploaded data matches the original
          const uploadedData = yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );
          const originalData = generateData(testFile.size ?? 0, {
            type: "random",
            seed: 12345,
          });

          expect(compareArrays(uploadedData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });

    it("should upload files just under multipart threshold (4.9MB)", async () => {
      const testFile = createTestUploadFile(
        "large-small-test",
        TEST_FILE_SIZES.SMALL_LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });

    it("should handle metadata for small files", async () => {
      const testFile = createTestUploadFile(
        "metadata-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
        {
          metadata: {
            contentType: "text/plain",
            cacheControl: "no-cache, max-age=0",
          },
        },
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          // File should exist with correct size
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });
  });

  describe("Medium File Uploads (5MB - 50MB)", () => {
    it("should upload files at multipart threshold (5MB)", async () => {
      const testFile = createTestUploadFile(
        "medium-min-test",
        TEST_FILE_SIZES.MEDIUM_MIN.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Should use multipart upload
          yield* assertMetricsRecorded(mockService, "uploadPart", 1);
          yield* assertMetricsRecorded(
            mockService,
            "completeMultipartUpload",
            1,
          );
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        15000, // Longer timeout for larger files
      );
    });

    it("should upload medium files (10MB) with multiple parts", async () => {
      const testFile = createTestUploadFile(
        "medium-test",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0, {
        type: "pattern",
        pattern: new Uint8Array([0xab, 0xcd, 0xef]),
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          const uploadedData = yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Verify the data integrity
          const originalData = generateData(testFile.size ?? 0, {
            type: "pattern",
            pattern: new Uint8Array([0xab, 0xcd, 0xef]),
          });
          expect(compareArrays(uploadedData, originalData)).toBe(true);

          // Should have used multiple parts for 10MB with 8MB part size
          const metrics = yield* mockService.getMetrics();
          const partUploads = metrics.operationCounts.get("uploadPart") || 0;
          expect(partUploads).toBeGreaterThan(1);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        20000,
      );
    });

    it("should upload large medium files (49MB)", async () => {
      const testFile = createTestUploadFile(
        "large-medium-test",
        TEST_FILE_SIZES.MEDIUM_LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Should have used multiple parts
          const metrics = yield* mockService.getMetrics();
          const partUploads = metrics.operationCounts.get("uploadPart") || 0;
          expect(partUploads).toBeGreaterThanOrEqual(6); // ~6 parts for 49MB with 8MB parts
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        30000,
      );
    });
  });

  describe("Large File Uploads (50MB+)", () => {
    it("should upload large files (50MB) efficiently", async () => {
      const testFile = createTestUploadFile(
        "large-test",
        TEST_FILE_SIZES.LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Should have used multiple parts optimally
          const metrics = yield* mockService.getMetrics();
          const partUploads = metrics.operationCounts.get("uploadPart") || 0;
          expect(partUploads).toBeGreaterThanOrEqual(6); // ~7 parts for 50MB with 8MB parts
          expect(partUploads).toBeLessThanOrEqual(8);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        45000,
      );
    });

    it("should upload extra large files (100MB) with optimal part sizing", async () => {
      const testFile = createTestUploadFile(
        "xl-test",
        TEST_FILE_SIZES.LARGE_XL.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          const metrics = yield* mockService.getMetrics();
          const partUploads = metrics.operationCounts.get("uploadPart") || 0;
          expect(partUploads).toBeGreaterThanOrEqual(12); // ~13 parts for 100MB with 8MB parts
          expect(partUploads).toBeLessThanOrEqual(15);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        60000,
      );
    });
  });

  describe("Upload Progress Tracking", () => {
    it("should track progress for small files", async () => {
      const testFile = createTestUploadFile(
        "progress-small",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);
      const progressUpdates: number[] = [];

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
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

          // Progress should be monotonically increasing
          for (let i = 1; i < progressUpdates.length; i++) {
            expect(progressUpdates[i]).toBeGreaterThanOrEqual(
              progressUpdates[i - 1],
            );
          }
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });

    it("should track progress for large files", async () => {
      const testFile = createTestUploadFile(
        "progress-large",
        TEST_FILE_SIZES.LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);
      const progressUpdates: number[] = [];

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          const finalOffset = yield* r2Store.write(
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
          expect(progressUpdates.length).toBeGreaterThan(10); // Should have many progress updates
          expect(progressUpdates[progressUpdates.length - 1]).toBe(
            testFile.size,
          );

          // Progress should be monotonically increasing
          for (let i = 1; i < progressUpdates.length; i++) {
            expect(progressUpdates[i]).toBeGreaterThanOrEqual(
              progressUpdates[i - 1],
            );
          }
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        45000,
      );
    });
  });

  describe("Upload Retrieval", () => {
    it("should retrieve upload information accurately", async () => {
      const testFile = createTestUploadFile(
        "retrieve-test",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          // Upload file
          yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Retrieve upload info
          const uploadInfo = yield* r2Store.getUpload(testFile.id);

          expect(uploadInfo.id).toBe(testFile.id);
          expect(uploadInfo.size).toBe(testFile.size);
          expect(uploadInfo.offset).toBe(testFile.size); // Should be fully uploaded
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        20000,
      );
    });

    it("should read uploaded file data", async () => {
      const testFile = createTestUploadFile(
        "read-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const originalData = generateData(testFile.size ?? 0, {
        type: "text",
      });
      const testData = createTestDataStream(testFile.size ?? 0, {
        type: "text",
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          // Upload file
          yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Read file data
          const readData = yield* r2Store.read(testFile.id);

          expect(compareArrays(readData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });
  });

  describe("File Deletion", () => {
    it("should remove uploaded files", async () => {
      const testFile = createTestUploadFile(
        "delete-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* r2Store.create(testFile);

          // Upload file
          yield* r2Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Verify file exists
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Remove file
          yield* r2Store.remove(testFile.id);

          // Verify file is deleted
          const storage = yield* mockService.getStorage();
          expect(storage.objects.has(testFile.id)).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });
  });

  describe("Standard Test Files", () => {
    it("should handle all standard test file types", async () => {
      const testFiles = createStandardTestFiles();

      await runTestWithTimeout(
        Effect.gen(function* () {
          for (const testFileData of testFiles.slice(0, 5)) {
            // Test first 5 to keep test time reasonable
            const testFile = createTestUploadFile(
              testFileData.id,
              testFileData.size,
              {
                metadata: testFileData.metadata,
              },
            );

            yield* r2Store.create(testFile);

            const finalOffset = yield* r2Store.write(
              {
                file_id: testFile.id,
                stream: testFileData.stream,
                offset: 0,
              },
              { onProgress: undefined },
            );

            expect(finalOffset).toBe(testFile.size);

            const uploadedData = yield* assertFileUploaded(
              mockService,
              testFile.id,
              testFile.size ?? 0,
            );
            expect(compareArrays(uploadedData, testFileData.data)).toBe(true);
          }
        }).pipe(Effect.provide(TestLayersWithMockR2())),
        60000, // Longer timeout for multiple files
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle network failures gracefully", async () => {
      const testFile = createTestUploadFile(
        "error-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Inject error
          yield* mockService.setConfig({
            errorRate: 1.0, // 100% error rate
            simulateLatency: 0,
            uploadFailureRate: 0,
            enableErrorInjection: true,
          });

          // Attempt to create - should fail
          const result = yield* Effect.either(r2Store.create(testFile));
          expect(Either.isLeft(result)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });

    it("should handle invalid file IDs", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          // Try to get non-existent upload
          const result = yield* Effect.either(
            r2Store.getUpload("non-existent-id"),
          );
          expect(Either.isLeft(result)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });
  });

  describe("Capabilities", () => {
    it("should report correct capabilities", async () => {
      await runTestWithTimeout(
        Effect.sync(() => {
          const capabilities = r2Store.getCapabilities();

          expect(capabilities.supportsParallelUploads).toBe(true);
          expect(capabilities.supportsConcatenation).toBe(true);
          expect(capabilities.supportsDeferredLength).toBe(true);
          expect(capabilities.supportsResumableUploads).toBe(true);
          expect(capabilities.minChunkSize).toBe(5 * 1024 * 1024); // 5MB
          expect(capabilities.maxParts).toBe(10_000);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });

    it("should validate upload strategies correctly", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const parallelValid =
            yield* r2Store.validateUploadStrategy("parallel");
          const singleValid = yield* r2Store.validateUploadStrategy("single");

          expect(parallelValid).toBe(true);
          expect(singleValid).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockR2())),
      );
    });
  });
});
