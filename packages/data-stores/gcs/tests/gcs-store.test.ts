import type { DataStore, UploadFile } from "@uploadista/core/types";
import { UploadFileKVStore } from "@uploadista/core/types";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GCSClientService } from "../src/services/gcs-client.service";
import { createGCSStore } from "../src/gcs-store-v2";
import {
  compareArrays,
  createStandardTestFiles,
  createTestDataStream,
  generateData,
  TEST_FILE_SIZES,
} from "./utils/test-data-generator";
import {
  assertFileUploaded,
  assertMetricsRecorded,
  createTestGCSStoreConfig,
  createTestUploadFile,
  type MockGCSTestMethods,
  runTestWithTimeout,
  setupTestEnvironment,
  TestLayersWithMockGCS,
} from "./utils/test-setup";

describe("GCSStore - Basic Upload Tests", () => {
  let gcsStore: DataStore<UploadFile>;
  let mockService: GCSClientService["Type"] & MockGCSTestMethods;

  beforeEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        // Setup test environment with mock GCS
        mockService = yield* setupTestEnvironment();

        // Create GCS store with test configuration
        gcsStore = (yield* createGCSStore()) as DataStore<UploadFile>;
      }).pipe(Effect.provide(TestLayersWithMockGCS())),
    );
  });

  afterEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        // Clear both GCS mock storage and KV store
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
      }).pipe(Effect.provide(TestLayersWithMockGCS())),
    );
  });

  describe("Store Creation", () => {
    it("should create GCS store successfully", async () => {
      await runTestWithTimeout(
        Effect.sync(() => {
          expect(gcsStore).toBeDefined();
          expect(gcsStore.bucket).toBeDefined();
          expect(gcsStore.create).toBeDefined();
          expect(gcsStore.write).toBeDefined();
          expect(gcsStore.read).toBeDefined();
          expect(gcsStore.remove).toBeDefined();
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });

    it("should have correct capabilities", async () => {
      await runTestWithTimeout(
        Effect.sync(() => {
          const capabilities = gcsStore.getCapabilities();

          expect(capabilities.supportsParallelUploads).toBe(false);
          expect(capabilities.supportsConcatenation).toBe(true);
          expect(capabilities.supportsDeferredLength).toBe(true);
          expect(capabilities.supportsResumableUploads).toBe(true);
          expect(capabilities.requiresOrderedChunks).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });

    it("should validate upload strategies correctly", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const singleStrategy = yield* gcsStore.validateUploadStrategy(
            "single",
          );
          expect(singleStrategy).toBe(true);

          const parallelStrategy = yield* gcsStore.validateUploadStrategy(
            "parallel",
          );
          expect(parallelStrategy).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });
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
          // First save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          // Create upload
          const createdFile = yield* gcsStore.create(testFile);
          expect(createdFile.id).toBe(testFile.id);
          expect(createdFile.size).toBe(testFile.size);

          // Write data
          const finalOffset = yield* gcsStore.write(
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
          yield* assertMetricsRecorded(mockService, "putObject", 1);
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });

    it("should upload files just under 5MB threshold", async () => {
      const testFile = createTestUploadFile(
        "large-small-test",
        TEST_FILE_SIZES.SMALL_LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });

    it("should handle metadata for small files", async () => {
      const testFile = createTestUploadFile(
        "metadata-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
        {
          metadata: {
            contentType: "text/plain",
            customField: "custom-value",
          },
        },
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          // Verify file exists with correct metadata
          const storage = yield* mockService.getStorage();
          const obj = storage.objects.get(testFile.id);
          expect(obj).toBeDefined();
          expect(obj?.metadata).toBeDefined();
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });
  });

  describe("Medium File Uploads (5MB - 50MB)", () => {
    it("should upload medium files (10MB)", async () => {
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
        45000,
      );
    });

    it("should upload extra large files (100MB)", async () => {
      const testFile = createTestUploadFile(
        "xl-test",
        TEST_FILE_SIZES.LARGE_XL.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
        45000,
      );
    });
  });

  describe("File Read Operations", () => {
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          // Upload file
          yield* gcsStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Read file data
          const readData = yield* gcsStore.read(testFile.id);

          expect(compareArrays(readData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
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
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          // Upload file
          yield* gcsStore.write(
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
          yield* gcsStore.remove(testFile.id);

          // Verify file is deleted
          const storage = yield* mockService.getStorage();
          expect(storage.objects.has(testFile.id)).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });
  });

  describe("Resumable Uploads (Patching)", () => {
    it.skip("should support resumable uploads with append", { timeout: 30000 }, async () => {
      const testFile = createTestUploadFile(
        "resumable-test",
        TEST_FILE_SIZES.MEDIUM.size,
      );

      // Split the upload into two parts
      const fileSize = testFile.size ?? 0;
      const part1Size = Math.floor(fileSize / 2);
      const part2Size = fileSize - part1Size;

      const part1Data = createTestDataStream(part1Size, { type: "zeros" });
      const part2Data = createTestDataStream(part2Size, { type: "ones" });

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Save to KV store
          const kvStore = yield* UploadFileKVStore;
          yield* kvStore.set(testFile.id, testFile);

          yield* gcsStore.create(testFile);

          // Upload first part
          const offset1 = yield* gcsStore.write(
            {
              file_id: testFile.id,
              stream: part1Data,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(offset1).toBe(part1Size);

          // Update KV store with new offset
          testFile.offset = offset1;
          yield* kvStore.set(testFile.id, testFile);

          // Upload second part (append)
          const offset2 = yield* gcsStore.write(
            {
              file_id: testFile.id,
              stream: part2Data,
              offset: offset1,
            },
            { onProgress: undefined },
          );

          expect(offset2).toBe(testFile.size);

          // Verify complete file was uploaded
          const uploadedData = yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );

          // Verify first part is zeros and second part is ones
          for (let i = 0; i < part1Size; i++) {
            expect(uploadedData[i]).toBe(0);
          }
          for (let i = part1Size; i < fileSize; i++) {
            expect(uploadedData[i]).toBe(0xff);
          }
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
        25000,
      );
    });
  });

  describe("Standard Test Files", () => {
    it("should handle all standard test file types", async () => {
      const testFiles = createStandardTestFiles();

      await runTestWithTimeout(
        Effect.gen(function* () {
          const kvStore = yield* UploadFileKVStore;

          for (const testFileData of testFiles) {
            const testFile = createTestUploadFile(
              testFileData.id,
              testFileData.size,
              {
                metadata: testFileData.metadata,
              },
            );

            // Save to KV store
            yield* kvStore.set(testFile.id, testFile);

            yield* gcsStore.create(testFile);

            const finalOffset = yield* gcsStore.write(
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
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
        60000,
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle file not found errors", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            gcsStore.read("non-existent-file"),
          );

          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });

    it("should handle missing file ID on create", async () => {
      const testFile = createTestUploadFile("", 1024);

      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(gcsStore.create(testFile));

          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMockGCS())),
      );
    });
  });
});
