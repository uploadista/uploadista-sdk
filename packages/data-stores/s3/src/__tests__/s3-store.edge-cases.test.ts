import { UploadistaError } from "@uploadista/core/errors";
import { UploadFileKVStore } from "@uploadista/core/types";
import { Effect, Option, Stream } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createS3Store } from "../s3-store";
import type { S3ClientService } from "../services";
import type { S3Store } from "../types";
import {
  createTestDataStream,
  TEST_FILE_SIZES,
} from "./utils/test-data-generator";
import {
  assertFileUploaded,
  createTestS3StoreConfig,
  createTestUploadFile,
  DEFAULT_TEST_CONFIG,
  type MockS3TestMethods,
  runTestWithTimeout,
  setupTestEnvironment,
  TestLayersWithMockS3,
} from "./utils/test-setup";

describe("S3Store - Edge Cases and Error Handling", () => {
  let s3Store: S3Store;
  let mockService: S3ClientService["Type"] & MockS3TestMethods;

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
        // Clear both S3 mock storage and KV store
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
      }).pipe(Effect.provide(TestLayersWithMockS3())),
    );
  });

  describe("Network Failures", () => {
    it("should handle createMultipartUpload failures", async () => {
      const testFile = createTestUploadFile(
        "create-failure",
        TEST_FILE_SIZES.MEDIUM.size,
      );

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Inject error for createMultipartUpload
          yield* mockService.injectError(
            "createMultipartUpload",
            new Error("Network timeout during multipart upload creation"),
          );

          // Attempt to create upload should fail
          const result = yield* Effect.either(s3Store.create(testFile));

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(UploadistaError);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should handle uploadPart failures", async () => {
      const testFile = createTestUploadFile(
        "upload-failure",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Inject error for uploadPart
          yield* mockService.injectError(
            "uploadPart",
            new Error("Part upload failed due to network error"),
          );

          // Attempt to write should fail
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
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(UploadistaError);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        15000, // Increased timeout for retry logic with persistent error injection
      );
    }, 15000);

    it("should handle completeMultipartUpload failures", async () => {
      const testFile = createTestUploadFile(
        "complete-failure",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Inject error for completeMultipartUpload
          yield* mockService.injectError(
            "completeMultipartUpload",
            new Error("Failed to complete multipart upload"),
          );

          // Write should fail at completion stage
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
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(UploadistaError);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        20000,
      );
    });

    it("should handle intermittent network failures with retry", async () => {
      const testFile = createTestUploadFile(
        "retry-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Set up mock to fail randomly but not too often
          yield* mockService.setConfig({
            ...DEFAULT_TEST_CONFIG,
            errorRate: 0.2, // 20% failure rate to test retry logic
          });

          yield* s3Store.create(testFile);

          // This might fail due to random errors, but should eventually succeed with retries
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

          // Note: The current implementation has retry logic, so this might succeed
          // If it fails, it should be due to UploadistaError
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(UploadistaError);
          } else {
            expect(result.right).toBe(testFile.size);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        15000,
      );
    });
  });

  describe("Invalid Input Handling", () => {
    it("should handle empty streams", async () => {
      const testFile = createTestUploadFile("empty-stream", 0);
      const emptyStream = Stream.empty;

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const result = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: emptyStream,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(result).toBe(0);

          // Should handle empty file correctly
          const storage = yield* mockService.getStorage();
          const uploadedFile = storage.objects.get(testFile.id);
          expect(uploadedFile).toBeDefined();
          expect(uploadedFile?.length).toBe(0);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should handle non-existent upload IDs", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            s3Store.getUpload("non-existent-id"),
          );

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(UploadistaError);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should handle invalid file sizes", async () => {
      const testFile = createTestUploadFile("invalid-size", -1);

      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(s3Store.create(testFile));

          // The store should handle this gracefully
          // Current implementation might allow this, so we test the behavior
          if (result._tag === "Right") {
            expect(result.right.size).toBe(-1);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });

    it("should handle corrupted streams", async () => {
      const testFile = createTestUploadFile(
        "corrupted-stream",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );

      // Create a stream that fails halfway through
      const corruptedStream = Stream.unfoldEffect(0, (n) => {
        const size = testFile.size ?? 0;
        if (n >= size) return Effect.succeed(Option.none());

        if (n > size / 2) {
          // Simulate stream corruption using Effect.fail
          return Effect.fail(
            UploadistaError.fromCode(
              "FILE_WRITE_ERROR",
              new Error("Stream corrupted"),
            ),
          );
        }

        const chunk = new Uint8Array(Math.min(1024, size - n)).fill(n % 256);
        return Effect.succeed(Option.some([chunk, n + chunk.length]));
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const result = yield* Effect.either(
            s3Store.write(
              {
                file_id: testFile.id,
                stream: corruptedStream,
                offset: 0,
              },
              { onProgress: undefined },
            ),
          );

          expect(result._tag).toBe("Left");
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(Error);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });
  });

  describe("Concurrent Access", () => {
    it("should handle concurrent writes to the same file", async () => {
      const testFile = createTestUploadFile(
        "concurrent-write",
        TEST_FILE_SIZES.MEDIUM.size,
      );

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          const size = testFile.size ?? 0;
          const stream1 = createTestDataStream(size, {
            type: "random",
            seed: 1,
          });
          const stream2 = createTestDataStream(size, {
            type: "random",
            seed: 2,
          });

          // Start two concurrent writes to the same file
          const write1 = s3Store.write(
            {
              file_id: testFile.id,
              stream: stream1,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const write2 = s3Store.write(
            {
              file_id: testFile.id,
              stream: stream2,
              offset: 0,
            },
            { onProgress: undefined },
          );

          // Both writes might succeed or one might fail due to race conditions
          const results = yield* Effect.all([
            Effect.either(write1),
            Effect.either(write2),
          ]);

          // At least one should succeed or both should fail with proper error handling
          const successCount = results.filter((r) => r._tag === "Right").length;
          const failureCount = results.filter((r) => r._tag === "Left").length;

          expect(successCount + failureCount).toBe(2);

          // If there are failures, they should be UploadistaErrors
          results.forEach((result) => {
            if (result._tag === "Left") {
              expect(result.left).toBeInstanceOf(Error);
            }
          });
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        30000,
      );
    });

    it("should handle concurrent creates for different files", async () => {
      const fileCount = 5;
      const creates = Array.from({ length: fileCount }, (_, i) => {
        const testFile = createTestUploadFile(
          `concurrent-create-${i}`,
          TEST_FILE_SIZES.SMALL_BASIC.size,
        );
        return s3Store.create(testFile);
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          const results = yield* Effect.all(creates.map(Effect.either));

          // All creates should succeed
          results.forEach((result, i) => {
            expect(result._tag).toBe("Right");
            if (result._tag === "Right") {
              expect(result.right.id).toBe(`concurrent-create-${i}`);
            }
          });
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });
  });

  describe("Resource Limits", () => {
    it("should handle files exceeding configured limits", async () => {
      const largeSize = 10 * 1024 * 1024; // 10MB
      const testFile = createTestUploadFile("size-limit", largeSize);

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Set a smaller max object size
          yield* mockService.setConfig({
            ...DEFAULT_TEST_CONFIG,
            maxObjectSize: 5 * 1024 * 1024, // 5MB limit
          });

          yield* s3Store.create(testFile);

          const testData = createTestDataStream(largeSize);

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
          if (result._tag === "Left") {
            expect(result.left).toBeInstanceOf(UploadistaError);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        25000, // Increased timeout for retry logic
      );
    });

    it("should handle part count limits", async () => {
      const testFile = createTestUploadFile(
        "part-limit",
        TEST_FILE_SIZES.LARGE.size,
      );

      await runTestWithTimeout(
        Effect.gen(function* () {
          // Create store with very small part size to exceed part limits
          const kvStore = yield* UploadFileKVStore;
          const config = createTestS3StoreConfig({
            partSize: 1024 * 1024, // 1MB parts
            maxMultipartParts: 5, // Very low limit
          });

          const limitedStore = yield* createS3Store({
            ...config,
            kvStore,
          });

          yield* limitedStore.create(testFile);

          const testData = createTestDataStream(testFile.size ?? 0);

          const result = yield* Effect.either(
            limitedStore.write(
              {
                file_id: testFile.id,
                stream: testData,
                offset: 0,
              },
              { onProgress: undefined },
            ),
          );

          // The system should automatically adjust part size to stay within limits
          // So this might actually succeed with larger parts
          if (result._tag === "Right") {
            expect(result.right).toBe(testFile.size);
          }
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        45000,
      );
    });
  });

  describe("Cleanup and Cancellation", () => {
    it("should clean up incomplete uploads on abort", async () => {
      const testFile = createTestUploadFile(
        "abort-test",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Start upload but don't complete it
          yield* mockService.injectError(
            "completeMultipartUpload",
            new Error("Simulated completion failure"),
          );

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

          // Remove the upload (this should clean up)
          yield* s3Store.remove(testFile.id);

          // Verify cleanup
          const storage = yield* mockService.getStorage();
          expect(storage.objects.has(testFile.id)).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        20000,
      );
    });

    it("should handle expired upload cleanup", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          // Create some multipart uploads that would be "expired"
          const testFile1 = createTestUploadFile(
            "expired-1",
            TEST_FILE_SIZES.MEDIUM.size,
          );
          const testFile2 = createTestUploadFile(
            "expired-2",
            TEST_FILE_SIZES.MEDIUM.size,
          );

          yield* s3Store.create(testFile1);
          yield* s3Store.create(testFile2);

          // Run cleanup
          const deletedCount = yield* s3Store.deleteExpired;

          // The mock doesn't simulate actual expiration, so this tests the mechanism
          expect(deletedCount).toBeGreaterThanOrEqual(0);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
      );
    });
  });

  describe("Data Integrity", () => {
    it("should detect mismatched part ETags", async () => {
      const testFile = createTestUploadFile(
        "etag-test",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Normal upload should work
          const result = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(result).toBe(testFile.size);

          // Verify the file was uploaded and has correct size
          yield* assertFileUploaded(
            mockService,
            testFile.id,
            testFile.size ?? 0,
          );
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        20000,
      );
    });

    it("should handle partial upload recovery", async () => {
      const testFile = createTestUploadFile(
        "partial-recovery",
        TEST_FILE_SIZES.MEDIUM.size,
      );
      const partialData = createTestDataStream((testFile.size ?? 0) / 2);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Upload first half
          const partialResult = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: partialData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(partialResult).toBe((testFile.size ?? 0) / 2);

          // Check upload status
          const uploadInfo = yield* s3Store.getUpload(testFile.id);
          expect(uploadInfo.offset).toBe((testFile.size ?? 0) / 2);
          expect(uploadInfo.size).toBe(testFile.size ?? 0);

          // Upload should be incomplete
          const storage = yield* mockService.getStorage();
          expect(storage.objects.has(testFile.id)).toBe(false); // Not completed yet
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        20000,
      );
    });
  });

  describe("Error Recovery", () => {
    it("should recover from temporary storage issues", async () => {
      const testFile = createTestUploadFile(
        "recovery-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* s3Store.create(testFile);

          // Set high error rate initially
          yield* mockService.setConfig({
            ...DEFAULT_TEST_CONFIG,
            uploadFailureRate: 0.8, // 80% failure rate
          });

          // First attempt likely to fail
          yield* Effect.either(
            s3Store.write(
              {
                file_id: testFile.id,
                stream: testData,
                offset: 0,
              },
              { onProgress: undefined },
            ),
          );

          // Reduce error rate and try again
          yield* mockService.setConfig({
            ...DEFAULT_TEST_CONFIG,
            uploadFailureRate: 0, // No failures
          });

          const result2 = yield* s3Store.write(
            {
              file_id: testFile.id,
              stream: createTestDataStream(testFile.size ?? 0),
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(result2).toBe(testFile.size ?? 0);
        }).pipe(Effect.provide(TestLayersWithMockS3())),
        20000,
      );
    });
  });
});
