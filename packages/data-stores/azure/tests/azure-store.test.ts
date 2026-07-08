import {
  TypedKvStore,
  type UploadFile,
  UploadFileKVStore,
} from "@uploadista/core/types";
import { makeMemoryBaseKvStore } from "@uploadista/kv-store-memory";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  compareArrays,
  createStandardTestFiles,
  createTestDataStream,
  generateData,
  TEST_FILE_SIZES,
} from "../../s3/tests/utils/test-data-generator";
import { type AzureStore, azureStore } from "../src/azure-store";

// Mock Azure Storage types
interface MockContainerClient {
  name: string;
  getBlockBlobClient: (id: string) => MockBlockBlobClient;
  deleteBlob: (id: string) => Promise<void>;
  listBlobsFlat: (options?: any) => AsyncIterable<any>;
}

interface MockBlockBlobClient {
  id: string;
  stageBlock: (
    blockId: string,
    data: Uint8Array,
    length: number,
  ) => Promise<void>;
  commitBlockList: (blockIds: string[], options?: any) => Promise<void>;
  upload: (data: Uint8Array, length: number) => Promise<void>;
  download: () => Promise<{
    readableStreamBody?: ReadableStream;
    blobBody?: Blob;
  }>;
  deleteIfExists: () => Promise<void>;
  getBlockList: (
    type: string,
  ) => Promise<{ committedBlocks?: Array<{ size: number }> }>;
  getProperties: () => Promise<{ contentLength?: number }>;
}

// Mock storage state
const mockStorage = {
  blobs: new Map<string, Uint8Array>(),
  blocks: new Map<string, Map<string, Uint8Array>>(),
  committedBlocks: new Map<string, Array<{ blockId: string; size: number }>>(),
};

// Helper to create mock container client
const createMockContainerClient = (
  containerName: string,
): MockContainerClient => {
  return {
    name: containerName,
    getBlockBlobClient: (id: string) => createMockBlockBlobClient(id),
    deleteBlob: async (id: string) => {
      mockStorage.blobs.delete(id);
      mockStorage.blocks.delete(id);
      mockStorage.committedBlocks.delete(id);
    },
    listBlobsFlat: async function* (options?: any) {
      for (const [name, _data] of mockStorage.blobs) {
        yield {
          name,
          metadata: options?.includeMetadata ? {} : undefined,
        };
      }
    },
  };
};

const createMockBlockBlobClient = (id: string): MockBlockBlobClient => {
  return {
    id,
    stageBlock: async (blockId: string, data: Uint8Array, length: number) => {
      if (!mockStorage.blocks.has(id)) {
        mockStorage.blocks.set(id, new Map());
      }
      mockStorage.blocks.get(id)!.set(blockId, data);
    },
    commitBlockList: async (blockIds: string[], options?: any) => {
      const blocks = mockStorage.blocks.get(id);
      if (!blocks) {
        throw new Error("No blocks staged");
      }

      // Concatenate all blocks in order
      const chunks: Uint8Array[] = [];
      let totalSize = 0;
      const committedBlocksList: Array<{ blockId: string; size: number }> = [];

      for (const blockId of blockIds) {
        const block = blocks.get(blockId);
        if (!block) {
          throw new Error(`Block ${blockId} not found`);
        }
        chunks.push(block);
        totalSize += block.length;
        committedBlocksList.push({ blockId, size: block.length });
      }

      const result = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      mockStorage.blobs.set(id, result);
      mockStorage.committedBlocks.set(id, committedBlocksList);
      mockStorage.blocks.delete(id); // Clear staged blocks
    },
    upload: async (data: Uint8Array, length: number) => {
      mockStorage.blobs.set(id, data);
    },
    download: async () => {
      const data = mockStorage.blobs.get(id);
      if (!data) {
        const error: any = new Error("Blob not found");
        error.statusCode = 404;
        throw error;
      }
      return {
        readableStreamBody: new ReadableStream({
          start(controller) {
            controller.enqueue(data);
            controller.close();
          },
        }),
      };
    },
    deleteIfExists: async () => {
      mockStorage.blobs.delete(id);
      mockStorage.blocks.delete(id);
      mockStorage.committedBlocks.delete(id);
    },
    getBlockList: async (type: string) => {
      if (type === "committed") {
        const blocks = mockStorage.committedBlocks.get(id);
        return {
          committedBlocks: blocks?.map((b) => ({ size: b.size })) || [],
        };
      }
      return { committedBlocks: [] };
    },
    getProperties: async () => {
      const data = mockStorage.blobs.get(id);
      if (!data) {
        const error: any = new Error("Blob not found");
        error.statusCode = 404;
        throw error;
      }
      return { contentLength: data.length };
    },
  };
};

// Mock Azure SDK
vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: (connectionString: string) => ({
      getContainerClient: (name: string) => createMockContainerClient(name),
    }),
  },
  StorageSharedKeyCredential: vi.fn(),
}));

// Test utilities
const createTestUploadFile = (
  id: string,
  size: number,
  overrides: any = {},
) => ({
  id,
  offset: 0,
  size,
  metadata: {
    contentType: "application/octet-stream",
    ...overrides.metadata,
  },
  storage: {
    id: id,
    type: "azure",
    path: id,
    ...overrides.storage,
  },
  url: `https://test-azure-cdn.example.com/${id}`,
  ...overrides,
});

const runTestWithTimeout = <A, E>(
  effect: Effect.Effect<A, E>,
  timeoutMs: number = 10000,
): Promise<A> =>
  Effect.runPromise(
    effect.pipe(
      Effect.timeout(`${timeoutMs} millis`),
      Effect.tapError((error) =>
        Effect.logError("Test failed").pipe(
          Effect.annotateLogs({ error: String(error) }),
        ),
      ),
    ),
  );

const TestLayersWithMemoryKV = () =>
  Layer.effect(
    UploadFileKVStore,
    Effect.sync(
      () =>
        new TypedKvStore<UploadFile>(
          makeMemoryBaseKvStore(),
          "uploadista:upload-file:",
          JSON.stringify,
          JSON.parse,
        ),
    ),
  );

describe("AzureStore - Basic Upload Tests", () => {
  let store: AzureStore;

  beforeEach(async () => {
    // Clear mock storage
    mockStorage.blobs.clear();
    mockStorage.blocks.clear();
    mockStorage.committedBlocks.clear();

    await runTestWithTimeout(
      Effect.gen(function* () {
        store = yield* azureStore({
          connectionString: "DefaultEndpointsProtocol=https;AccountName=test;",
          containerName: "test-container",
          deliveryUrl: "https://test-azure-cdn.example.com",
          blockSize: 8 * 1024 * 1024, // 8MB
          minBlockSize: 1024, // 1KB
          maxBlocks: 50_000,
          maxConcurrentBlockUploads: 10,
        }).pipe(Effect.map((store) => store as AzureStore));
      }).pipe(Effect.provide(TestLayersWithMemoryKV())),
    );
  });

  afterEach(async () => {
    await runTestWithTimeout(
      Effect.gen(function* () {
        const kvStore = yield* UploadFileKVStore;
        if (kvStore.list) {
          const keys = yield* kvStore.list();
          if (keys.length > 0) {
            yield* Effect.all(
              keys.map((key) => kvStore.delete(key)),
              { concurrency: "unbounded" },
            );
          }
        }
      }).pipe(Effect.provide(TestLayersWithMemoryKV())),
    );

    // Clear mock storage
    mockStorage.blobs.clear();
    mockStorage.blocks.clear();
    mockStorage.committedBlocks.clear();
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
          const createdFile = yield* store.create(testFile);
          expect(createdFile.id).toBe(testFile.id);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          // Verify file exists in mock storage
          const blob = mockStorage.blobs.get(testFile.id);
          expect(blob).toBeDefined();
          expect(blob!.length).toBe(testFile.size);
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          const uploadedData = mockStorage.blobs.get(testFile.id)!;
          const originalData = generateData(testFile.size ?? 0, {
            type: "random",
            seed: 12345,
          });

          expect(compareArrays(uploadedData, originalData)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(mockStorage.blobs.has(testFile.id)).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Medium File Uploads (5MB - 50MB)", () => {
    it("should upload medium files (10MB) with multiple blocks", async () => {
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);

          const uploadedData = mockStorage.blobs.get(testFile.id)!;
          const originalData = generateData(testFile.size ?? 0, {
            type: "pattern",
            pattern: new Uint8Array([0xab, 0xcd, 0xef]),
          });
          expect(compareArrays(uploadedData, originalData)).toBe(true);

          // Should have committed multiple blocks
          const blocks = mockStorage.committedBlocks.get(testFile.id);
          expect(blocks).toBeDefined();
          expect(blocks!.length).toBeGreaterThan(1);
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(mockStorage.blobs.has(testFile.id)).toBe(true);

          const blocks = mockStorage.committedBlocks.get(testFile.id);
          expect(blocks).toBeDefined();
          expect(blocks!.length).toBeGreaterThanOrEqual(6);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(mockStorage.blobs.get(testFile.id)!.length).toBe(
            testFile.size,
          );

          const blocks = mockStorage.committedBlocks.get(testFile.id);
          expect(blocks!.length).toBeGreaterThanOrEqual(6);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        45000,
      );
    });

    it("should upload extra large files (100MB) with optimal block sizing", async () => {
      const testFile = createTestUploadFile(
        "xl-test",
        TEST_FILE_SIZES.LARGE_XL.size,
      );
      const testData = createTestDataStream(testFile.size ?? 0);

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(mockStorage.blobs.get(testFile.id)!.length).toBe(
            testFile.size,
          );

          const blocks = mockStorage.committedBlocks.get(testFile.id);
          expect(blocks!.length).toBeGreaterThanOrEqual(12);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            {
              onProgress: (offset) => Effect.sync(() => { progressUpdates.push(offset); }),
            },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(progressUpdates.length).toBeGreaterThan(0);

          // Progress should be monotonically increasing
          for (let i = 1; i < progressUpdates.length; i++) {
            expect(progressUpdates[i]).toBeGreaterThanOrEqual(
              progressUpdates[i - 1],
            );
          }
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* store.create(testFile);

          const finalOffset = yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            {
              onProgress: (offset) => Effect.sync(() => { progressUpdates.push(offset); }),
            },
          );

          expect(finalOffset).toBe(testFile.size);
          expect(progressUpdates.length).toBeGreaterThan(10);

          for (let i = 1; i < progressUpdates.length; i++) {
            expect(progressUpdates[i]).toBeGreaterThanOrEqual(
              progressUpdates[i - 1],
            );
          }
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
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
          yield* store.create(testFile);

          yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const uploadInfo = yield* store.getUpload(testFile.id);

          expect(uploadInfo.id).toBe(testFile.id);
          expect(uploadInfo.size).toBe(testFile.size);
          expect(uploadInfo.offset).toBe(testFile.size);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        20000,
      );
    });

    it("should read uploaded file data", async () => {
      const testFile = createTestUploadFile(
        "read-test",
        TEST_FILE_SIZES.SMALL_BASIC.size,
      );
      const originalData = generateData(testFile.size ?? 0, { type: "text" });
      const testData = createTestDataStream(testFile.size ?? 0, {
        type: "text",
      });

      await runTestWithTimeout(
        Effect.gen(function* () {
          yield* store.create(testFile);

          yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          const readData = yield* store.read(testFile.id);
          expect(compareArrays(readData, originalData)).toBe(true);
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
          yield* store.create(testFile);

          yield* store.write(
            {
              file_id: testFile.id,
              stream: testData,
              offset: 0,
            },
            { onProgress: undefined },
          );

          expect(mockStorage.blobs.has(testFile.id)).toBe(true);

          yield* store.remove(testFile.id);

          expect(mockStorage.blobs.has(testFile.id)).toBe(false);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Standard Test Files", () => {
    it("should handle all standard test file types", async () => {
      const testFiles = createStandardTestFiles();

      await runTestWithTimeout(
        Effect.gen(function* () {
          for (const testFileData of testFiles.slice(0, 5)) {
            const testFile = createTestUploadFile(
              testFileData.id,
              testFileData.size,
              {
                metadata: testFileData.metadata,
              },
            );

            yield* store.create(testFile);

            const finalOffset = yield* store.write(
              {
                file_id: testFile.id,
                stream: testFileData.stream,
                offset: 0,
              },
              { onProgress: undefined },
            );

            expect(finalOffset).toBe(testFile.size);

            const uploadedData = mockStorage.blobs.get(testFile.id)!;
            expect(compareArrays(uploadedData, testFileData.data)).toBe(true);
          }
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
        60000,
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid file IDs", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(
            store.getUpload("non-existent-id"),
          );
          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should handle read errors for non-existent files", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const result = yield* Effect.either(store.read("non-existent-file"));
          expect(result._tag).toBe("Left");
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });

  describe("Capabilities", () => {
    it("should report correct capabilities", async () => {
      await runTestWithTimeout(
        Effect.sync(() => {
          const capabilities = store.getCapabilities();

          expect(capabilities.supportsParallelUploads).toBe(true);
          expect(capabilities.supportsConcatenation).toBe(false);
          expect(capabilities.supportsDeferredLength).toBe(true);
          expect(capabilities.supportsResumableUploads).toBe(true);
          expect(capabilities.minChunkSize).toBe(1024); // 1KB
          expect(capabilities.maxParts).toBe(50_000);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });

    it("should validate upload strategies correctly", async () => {
      await runTestWithTimeout(
        Effect.gen(function* () {
          const parallelValid = yield* store.validateUploadStrategy("parallel");
          const singleValid = yield* store.validateUploadStrategy("single");

          expect(parallelValid).toBe(true);
          expect(singleValid).toBe(true);
        }).pipe(Effect.provide(TestLayersWithMemoryKV())),
      );
    });
  });
});
