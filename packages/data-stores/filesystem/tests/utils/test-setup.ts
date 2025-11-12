import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { UploadFile } from "@uploadista/core/types";
import { uploadFileKvStore } from "@uploadista/core/types";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { Effect, Layer } from "effect";
import type { FileStoreOptions } from "../../src/file-store";

// Test directory configuration
export const TEST_DELIVERY_URL = "http://localhost:3000/files";

// Helper to create a temporary test directory
export const createTestDirectory = (): Effect.Effect<string, never> =>
  Effect.promise(async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "uploadista-test-"));
    return tmpDir;
  });

// Helper to clean up test directory
export const cleanupTestDirectory = (
  directory: string,
): Effect.Effect<void, never> =>
  Effect.promise(async () => {
    try {
      await fs.rm(directory, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
      console.warn(`Failed to cleanup test directory ${directory}:`, error);
    }
  });

// Common filesystem store configuration for tests
export const createTestFilesystemStoreConfig = (
  directory: string,
  overrides: Partial<FileStoreOptions> = {},
): FileStoreOptions => ({
  directory,
  deliveryUrl: TEST_DELIVERY_URL,
  ...overrides,
});

// Layer that provides KV store for testing
export const TestLayersWithMemoryKV = () => {
  return uploadFileKvStore.pipe(Layer.provide(memoryKvStore));
};

// Helper to run tests with timeout
export const runTestWithTimeout = async <E>(
  effect: Effect.Effect<void, E>,
  timeout = 10000,
) => {
  await Effect.runPromise(Effect.timeout(effect, `${timeout} millis`));
};

// Helper to create test upload file
export const createTestUploadFile = (
  id: string,
  size: number,
  options: {
    metadata?: Record<string, string | number | boolean>;
  } = {},
): UploadFile => ({
  id,
  size,
  offset: 0,
  metadata: options.metadata,
  storage: {
    id: "test-storage",
    type: "filesystem",
    path: id,
    bucket: "test-directory",
  },
  sizeIsDeferred: false,
});

// Helper to assert file exists on filesystem
export const assertFileExists = (
  directory: string,
  fileId: string,
): Effect.Effect<void, never> =>
  Effect.promise(async () => {
    const filePath = path.join(directory, fileId);
    try {
      await fs.access(filePath);
    } catch (_error) {
      throw new Error(`File ${fileId} not found at ${filePath}`);
    }
  });

// Helper to read file from filesystem
export const readFileFromFilesystem = (
  directory: string,
  fileId: string,
): Effect.Effect<Uint8Array, never> =>
  Effect.promise(async () => {
    const filePath = path.join(directory, fileId);
    const buffer = await fs.readFile(filePath);
    return new Uint8Array(buffer);
  });

// Helper to get file size from filesystem
export const getFileSize = (
  directory: string,
  fileId: string,
): Effect.Effect<number, never> =>
  Effect.promise(async () => {
    const filePath = path.join(directory, fileId);
    const stats = await fs.stat(filePath);
    return stats.size;
  });

// Helper to list files in directory
export const listFiles = (directory: string): Effect.Effect<string[], never> =>
  Effect.promise(async () => {
    try {
      const files = await fs.readdir(directory, { recursive: true });
      return files.filter((file) => {
        // Filter out directories
        return !file.endsWith("/");
      });
    } catch (_error) {
      return [];
    }
  });

// Helper to assert file was uploaded correctly
export const assertFileUploaded = (
  directory: string,
  fileId: string,
  expectedSize: number,
): Effect.Effect<Uint8Array, never> =>
  Effect.gen(function* () {
    yield* assertFileExists(directory, fileId);

    const size = yield* getFileSize(directory, fileId);
    if (size !== expectedSize) {
      throw new Error(
        `File size mismatch: expected ${expectedSize}, got ${size}`,
      );
    }

    return yield* readFileFromFilesystem(directory, fileId);
  });
