import type { DataStore, UploadFile } from "@uploadista/core/types";
import { UploadFileKVStore } from "@uploadista/core/types";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileStore } from "../src/file-store";
import {
  compareArrays,
  createStandardTestFiles,
  createTestDataStream,
  generateData,
  TEST_FILE_SIZES,
} from "./utils/test-data-generator";
import {
  assertFileUploaded,
  cleanupTestDirectory,
  createTestDirectory,
  createTestFilesystemStoreConfig,
  createTestUploadFile,
  getFileSize,
  listFiles,
  runTestWithTimeout,
  TestLayersWithMemoryKV,
} from "./utils/test-setup";

describe("FilesystemStore - Basic Upload Tests", () => {
  let filesystemStore: DataStore<UploadFile>;
  let testDirectory: string;

  beforeEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        // Create a temporary test directory
        testDirectory = yield* createTestDirectory();

        // Create filesystem store with test configuration
        const config = createTestFilesystemStoreConfig(testDirectory);

        filesystemStore = (yield* fileStore(config)) as DataStore<UploadFile>;
      }).pipe(Effect.provide(TestLayersWithMemoryKV())),
    );
  });

  afterEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
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

        // Clean up test directory
        yield* cleanupTestDirectory(testDirectory);
      }).pipe(Effect.provide(TestLayersWithMemoryKV())),
    );
  });

  describe("Store Creation", () => {
    it("should create filesystem store successfully", async () => {
      await runTestWithTimeout(
        Effect.sync(() => {
          expect(filesystemStore).toBeDefined();
          expect(filesystemStore.bucket).toBeDefined();
          expect(filesystemStore.create).toBeDefined();
          expect(filesystemStore.write).toBeDefined();
          expect(filesystemStore.read).toBeDefined();
          expect(filesystemStore.remove).toBeDefined();
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should have correct capabilities", async () => {
      await runTestWithTimeout(
        Effect.sync(() => {
          const capabilities = filesystemStore.getCapabilities();

          expect(capabilities.supportsParallelUploads).toBe(false);
          expect(capabilities.supportsConcatenation).toBe(false);
          expect(capabilities.supportsDeferredLength).toBe(true);
          expect(capabilities.supportsResumableUploads).toBe(true);
          expect(capabilities.requiresOrderedChunks).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should validate upload strategies correctly", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const singleStrategy = yield* filesystemStore.validateUploadStrategy(
            "single",
          );
          expect(singleStrategy).toBe(true);

          const parallelStrategy = yield* filesystemStore.validateUploadStrategy(
            "parallel",
          );
          expect(parallelStrategy).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Small File Uploads", () => {
    it("should upload tiny files successfully", async () => {
      const testFile = createTestUploadFile(
        "tiny-test",
        TEST_FILE_SIZES.TINY.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Create upload
          const createdFile = yield* filesystemStore.create(testFile);
          expect(createdFile.id).toBe(testFile.id);
          expect(createdFile.size).toBe(testFile.size);

          // Write data
          const finalOffset = yield* filesystemStore.write(
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
            testDirectory,
            testFile.id,
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* filesystemStore.create(testFile);

          const finalOffset = yield* filesystemStore.write(
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
            testDirectory,
            testFile.id,
            testFile.size ?? 0,
          );
          const originalData = generateData(testFile.size ?? 0, {
            type: "random",
            seed: 12345,
          });

          expect(compareArrays(uploadedData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should upload files with file extensions", async () => {
      const testFile = createTestUploadFile(
        "test-file",
        TEST_FILE_SIZES.SMALL_BASIC.size,
        {
          metadata: {
            fileName: "document.pdf",
          },
        },
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          const createdFile = yield* filesystemStore.create(testFile);

          yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Should create file with extension
          yield* assertFileUploaded(
            testDirectory,
            "test-file.pdf",
            testFile.size ?? 0,
          );

          // Verify storage path includes extension
          expect(createdFile.storage.id).toContain(".pdf");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should create subdirectories as needed", async () => {
      const testFile = createTestUploadFile(
        "subdir/nested/file",
        TEST_FILE_SIZES.TINY.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* filesystemStore.create(testFile);

          yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Verify file was created in subdirectory
          yield* assertFileUploaded(
            testDirectory,
            "subdir/nested/file",
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Medium File Uploads", () => {
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
          yield* filesystemStore.create(testFile);

          const finalOffset = yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          const uploadedData = yield* assertFileUploaded(
            testDirectory,
            testFile.id,
            testFile.size ?? 0,
          );

          // Verify the data integrity
          const originalData = generateData(testFile.size ?? 0, {
            type: "pattern",
            pattern: new Uint8Array([0xab, 0xcd, 0xef]),
          });
          expect(compareArrays(uploadedData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* filesystemStore.create(testFile);

          const finalOffset = yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            testDirectory,
            testFile.id,
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        30000,
      );
    });
  });

  describe("Large File Uploads", () => {
    it("should upload large files (50MB) efficiently", async () => {
      const testFile = createTestUploadFile(
        "large-test",
        TEST_FILE_SIZES.LARGE.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* filesystemStore.create(testFile);

          const finalOffset = yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          yield* assertFileUploaded(
            testDirectory,
            testFile.id,
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        45000,
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
          yield* filesystemStore.create(testFile);

          const finalOffset = yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            {
              onProgress: (chunkSize) => progressUpdates.push(chunkSize),
            },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(progressUpdates.length).toBeGreaterThan(0);

          // Sum of all chunks should equal file size
          const totalBytes = progressUpdates.reduce((sum, size) => sum + size, 0);
          expect(totalBytes).toBe(testFile.size);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Resumable Uploads", () => {
    it.skip("should support resumable uploads with offset", { timeout: 30000 }, async () => {
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
          yield* filesystemStore.create(testFile);

          // Upload first part
          const offset1 = yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: part1Data,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(offset1).toBe(part1Size);

          // Verify partial upload
          const partialSize = yield* getFileSize(testDirectory, testFile.id);
          expect(partialSize).toBe(part1Size);

          // Upload second part (resume)
          const offset2 = yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: part2Data,
              offset: offset1,
            },
            { onProgress: undefined },
          );

          expect(offset2).toBe(fileSize);

          // Verify complete file was uploaded
          const uploadedData = yield* assertFileUploaded(
            testDirectory,
            testFile.id,
            fileSize,
          );

          // Verify first part is zeros and second part is ones
          for (let i = 0; i < part1Size; i++) {
            expect(uploadedData[i]).toBe(0);
          }
          for (let i = part1Size; i < fileSize; i++) {
            expect(uploadedData[i]).toBe(0xff);
          }
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        25000,
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
          yield* filesystemStore.create(testFile);

          // Upload file
          yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Read file data
          const readData = yield* filesystemStore.read(testFile.id);

          expect(compareArrays(readData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should retrieve upload information accurately", async () => {
      const testFile = createTestUploadFile(
        "getupload-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* filesystemStore.create(testFile);

          // Upload file
          yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Verify file size matches expected
          const fileSize = yield* getFileSize(testDirectory, testFile.id);
          expect(fileSize).toBe(testFile.size); // Should be fully uploaded
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* filesystemStore.create(testFile);

          // Upload file
          yield* filesystemStore.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Verify file exists
          yield* assertFileUploaded(
            testDirectory,
            testFile.id,
            testFile.size ?? 0,
          );

          // Remove file
          yield* filesystemStore.remove(testFile.id);

          // Verify file is deleted from KV store
          const kvStore = yield* UploadFileKVStore;
          const result = yield* Effect.either(kvStore.get(testFile.id));
          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Standard Test Files", () => {
    it("should handle all standard test file types", async () => {
      const testFiles = createStandardTestFiles();

      await runTestWithTimeout(
        Effect.gen(function* () {
          for (const testFileData of testFiles) {
            const testFile = createTestUploadFile(
              testFileData.id,
              testFileData.size,
              {
                metadata: testFileData.metadata,
              },
            );

            yield* filesystemStore.create(testFile);

            const finalOffset = yield* filesystemStore.write(
              {
                file_id: testFile.id,
                stream: testFileData.stream,
                offset: 0,
              },
              { onProgress: undefined },
            );

            expect(finalOffset).toBe(testFile.size);

            const uploadedData = yield* assertFileUploaded(
              testDirectory,
              testFile.id,
              testFile.size ?? 0,
            );
            expect(compareArrays(uploadedData, testFileData.data)).toBe(true);
          }
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        60000,
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle file not found errors", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            filesystemStore.read("non-existent-file"),
          );

          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should handle remove errors for non-existent files", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            filesystemStore.remove("non-existent-file"),
          );

          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Filesystem-Specific Features", () => {
    it("should list all uploaded files", async () => {
      const file1 = createTestUploadFile("file1", TEST_FILE_SIZES.TINY.size);
      const file2 = createTestUploadFile("file2", TEST_FILE_SIZES.TINY.size);
      const data1 = createTestDataStream(file1.size ?? 0);
      const data2 = createTestDataStream(file2.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* filesystemStore.create(file1);
          yield* filesystemStore.write(
            { file_id: file1.id, stream: data1, offset: 0 },
            { onProgress: undefined },
          );

          yield* filesystemStore.create(file2);
          yield* filesystemStore.write(
            { file_id: file2.id, stream: data2, offset: 0 },
            { onProgress: undefined },
          );

          const files = yield* listFiles(testDirectory);
          expect(files.length).toBe(2);
          expect(files).toContain("file1");
          expect(files).toContain("file2");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });
});
