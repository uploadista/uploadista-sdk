import { describe, expect, it } from "@effect/vitest";
import { UploadistaError } from "@uploadista/core/errors";
import { TestUploadEngine, TestZipPlugin } from "@uploadista/core/testing";
import type { UploadFile } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import {
  createConditionalNode,
  createMergeNode,
  createMultiplexNode,
  createZipNode,
} from "../src/nodes";

/**
 * Test utilities for creating sample UploadFile objects
 */
const createTestUploadFile = (
  id: string,
  overrides?: Partial<UploadFile>,
): UploadFile => ({
  id,
  offset: 0,
  size: 1024,
  storage: {
    id: "test-storage",
    type: "memory",
  },
  metadata: {
    mimeType: "text/plain",
    originalName: `file-${id}.txt`,
    extension: "txt",
  },
  creationDate: new Date().toISOString(),
  ...overrides,
});

const createTestImageFile = (
  id: string,
  width: number,
  height: number,
): UploadFile =>
  createTestUploadFile(id, {
    metadata: {
      mimeType: "image/jpeg",
      originalName: `image-${id}.jpg`,
      extension: "jpg",
      width,
      height,
    },
  });

/**
 * Test layer combining all mocks
 */
const TestLayer = Layer.mergeAll(TestUploadEngine, TestZipPlugin);

describe("Utility Nodes", () => {
  describe("ConditionalNode", () => {
    it.effect("should create conditional node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-1", {
          field: "mimeType",
          operator: "equals",
          value: "image/jpeg",
        });

        expect(node.id).toBe("cond-1");
        expect(node.name).toBe("Conditional Router");
        expect(node.description).toContain("Routes flow based on");
        expect(node.condition).toEqual({
          field: "mimeType",
          operator: "equals",
          value: "image/jpeg",
        });
      }),
    );

    it.effect("should pass through data unchanged", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-2", {
          field: "size",
          operator: "greaterThan",
          value: 1000,
        });

        const testFile = createTestUploadFile("test-1");
        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toEqual(testFile);
        }
      }),
    );

    it.effect("should create node with equals operator", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-equals", {
          field: "extension",
          operator: "equals",
          value: "jpg",
        });

        expect(node.condition?.operator).toBe("equals");
      }),
    );

    it.effect("should create node with notEquals operator", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-not-equals", {
          field: "mimeType",
          operator: "notEquals",
          value: "image/png",
        });

        expect(node.condition?.operator).toBe("notEquals");
      }),
    );

    it.effect("should create node with greaterThan operator", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-gt", {
          field: "size",
          operator: "greaterThan",
          value: 5000,
        });

        expect(node.condition?.operator).toBe("greaterThan");
        expect(node.condition?.value).toBe(5000);
      }),
    );

    it.effect("should create node with lessThan operator", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-lt", {
          field: "width",
          operator: "lessThan",
          value: 1920,
        });

        expect(node.condition?.operator).toBe("lessThan");
      }),
    );

    it.effect("should create node with contains operator", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-contains", {
          field: "mimeType",
          operator: "contains",
          value: "image",
        });

        expect(node.condition?.operator).toBe("contains");
      }),
    );

    it.effect("should create node with startsWith operator", () =>
      Effect.gen(function* () {
        const node = yield* createConditionalNode("cond-starts", {
          field: "extension",
          operator: "startsWith",
          value: "jp",
        });

        expect(node.condition?.operator).toBe("startsWith");
      }),
    );

    it.effect("should work with different field types", () =>
      Effect.gen(function* () {
        const fields: Array<
          "mimeType" | "size" | "width" | "height" | "extension"
        > = ["mimeType", "size", "width", "height", "extension"];

        for (const field of fields) {
          const node = yield* createConditionalNode(`cond-${field}`, {
            field,
            operator: "equals",
            value: field === "size" ? 1000 : "test",
          });

          expect(node.condition?.field).toBe(field);
        }
      }),
    );
  });

  describe("MergeNode", () => {
    it.effect("should merge multiple files using concat strategy", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-1", {
          strategy: "concat",
        });

        const file1 = createTestUploadFile("file-1");
        const file2 = createTestUploadFile("file-2");
        const file3 = createTestUploadFile("file-3");

        const result = yield* node.run({
          data: {
            input1: file1,
            input2: file2,
            input3: file3,
          },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          if (result.data) {
            expect(result.data.metadata?.mimeType).toBe(
              "application/octet-stream",
            );
            expect(result.data.metadata?.extension).toBe("bin");
            expect(result.data.size).toBeGreaterThan(0);
          }
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle single file input", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-single", {
          strategy: "concat",
        });

        const file1 = createTestUploadFile("single-file");

        const result = yield* node.run({
          data: {
            input1: file1,
          },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe(
            "application/octet-stream",
          );
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with no inputs", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-empty", {
          strategy: "concat",
        });

        const result = yield* Effect.either(
          node.run({
            data: {},
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
          expect(result.left.code).toBe("VALIDATION_ERROR");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with null inputs", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-null", {
          strategy: "concat",
        });

        const result = yield* Effect.either(
          node.run({
            data: null as any,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with unknown strategy", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-unknown", {
          strategy: "unknown" as any,
        });

        const file1 = createTestUploadFile("file-1");

        const result = yield* Effect.either(
          node.run({
            data: { input1: file1 },
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
          expect(result.left.body).toContain("Unknown merge strategy");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should preserve file order in concat", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-order", {
          strategy: "concat",
        });

        const file1 = createTestUploadFile("first");
        const file2 = createTestUploadFile("second");
        const file3 = createTestUploadFile("third");

        const result = yield* node.run({
          data: {
            a: file1,
            b: file2,
            c: file3,
          },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.originalName).toContain(
            "merged_3_files",
          );
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should create node with proper metadata", () =>
      Effect.gen(function* () {
        const node = yield* createMergeNode("merge-meta", {
          strategy: "concat",
        });

        expect(node.id).toBe("merge-meta");
        expect(node.name).toBe("Merge Files");
        expect(node.description).toContain("concat strategy");
        expect(node.multiInput).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("MultiplexNode", () => {
    it.effect("should multiplex file using copy strategy", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-1", {
          outputCount: 3,
          strategy: "copy",
        });

        const testFile = createTestUploadFile("source-file");

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.id).not.toBe(testFile.id);
          expect(result.data.metadata?.mimeType).toBe("text/plain");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should preserve metadata when copying", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-meta", {
          outputCount: 2,
          strategy: "copy",
        });

        const testFile = createTestImageFile("image-1", 800, 600);

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data.metadata?.mimeType).toBe("image/jpeg");
          expect(result.data.metadata?.extension).toBe("jpg");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle metadata as string", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-string-meta", {
          outputCount: 1,
          strategy: "copy",
        });

        const testFile = createTestUploadFile("file-with-string-meta", {
          metadata: {
            mimeType: "application/pdf",
            originalName: "document.pdf",
          },
        });

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with split strategy", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-split", {
          outputCount: 2,
          strategy: "split",
        });

        const testFile = createTestUploadFile("test-file");

        const result = yield* Effect.either(
          node.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
          expect(result.left.body).toContain("Split strategy is not supported");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with unknown strategy", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-unknown", {
          outputCount: 2,
          strategy: "invalid" as any,
        });

        const testFile = createTestUploadFile("test-file");

        const result = yield* Effect.either(
          node.run({
            data: testFile,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
          expect(result.left.body).toContain("Unknown multiplex strategy");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should create node with proper metadata", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-props", {
          outputCount: 5,
          strategy: "copy",
        });

        expect(node.id).toBe("multiplex-props");
        expect(node.name).toBe("Multiplex");
        expect(node.description).toContain("copy strategy");
        expect(node.multiOutput).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle large files", () =>
      Effect.gen(function* () {
        const node = yield* createMultiplexNode("multiplex-large", {
          outputCount: 2,
          strategy: "copy",
        });

        const largeFile = createTestUploadFile("large-file", {
          size: 10 * 1024 * 1024, // 10MB
        });

        const result = yield* node.run({
          data: largeFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("ZipNode", () => {
    it.effect("should create zip from multiple files", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-1", {
          zipName: "archive.zip",
          includeMetadata: false,
        });

        const file1 = createTestUploadFile("file-1");
        const file2 = createTestUploadFile("file-2");
        const file3 = createTestUploadFile("file-3");

        const result = yield* node.run({
          data: {
            input1: file1,
            input2: file2,
            input3: file3,
          },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("application/zip");
          expect(result.data.metadata?.extension).toBe("zip");
          expect(result.data.metadata?.fileName).toBe("archive.zip");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should include metadata when requested", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-with-meta", {
          zipName: "files-with-metadata.zip",
          includeMetadata: true,
        });

        const file1 = createTestImageFile("img-1", 1920, 1080);
        const file2 = createTestImageFile("img-2", 800, 600);

        const result = yield* node.run({
          data: {
            image1: file1,
            image2: file2,
          },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data.metadata?.fileName).toBe(
            "files-with-metadata.zip",
          );
          expect(result.data.size).toBeGreaterThan(0);
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle custom zip names", () =>
      Effect.gen(function* () {
        const customName = "my-custom-archive-2024.zip";
        const node = yield* createZipNode("zip-custom-name", {
          zipName: customName,
          includeMetadata: false,
        });

        const file1 = createTestUploadFile("doc-1");

        const result = yield* node.run({
          data: { doc: file1 },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data.metadata?.fileName).toBe(customName);
          expect(result.data.metadata?.originalName).toBe(customName);
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with no inputs", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-empty", {
          zipName: "empty.zip",
          includeMetadata: false,
        });

        const result = yield* Effect.either(
          node.run({
            data: {},
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
          expect(result.left.code).toBe("VALIDATION_ERROR");
          expect(result.left.body).toContain("No inputs provided to zip node");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail with null inputs", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-null", {
          zipName: "null.zip",
          includeMetadata: false,
        });

        const result = yield* Effect.either(
          node.run({
            data: null as any,
            jobId: "test-job",
            flowId: "test-flow",
            storageId: "test-storage",
            clientId: "test-client",
          }),
        );

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should create node with proper metadata", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-props", {
          zipName: "test.zip",
          includeMetadata: true,
        });

        expect(node.id).toBe("zip-props");
        expect(node.name).toBe("Zip Files");
        expect(node.description).toBe(
          "Combines multiple files into a zip archive",
        );
        expect(node.multiInput).toBe(true);
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle multiple files with different types", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-mixed", {
          zipName: "mixed-files.zip",
          includeMetadata: false,
        });

        const textFile = createTestUploadFile("text-file");
        const imageFile = createTestImageFile("image-file", 640, 480);
        const pdfFile = createTestUploadFile("pdf-file", {
          metadata: {
            mimeType: "application/pdf",
            originalName: "document.pdf",
            extension: "pdf",
          },
        });

        const result = yield* node.run({
          data: {
            text: textFile,
            image: imageFile,
            pdf: pdfFile,
          },
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          expect(result.data.metadata?.mimeType).toBe("application/zip");
          expect(result.data.size).toBeGreaterThan(0);
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should process files concurrently", () =>
      Effect.gen(function* () {
        const node = yield* createZipNode("zip-concurrent", {
          zipName: "concurrent.zip",
          includeMetadata: false,
        });

        // Create many files to test concurrent processing
        const files: Record<string, UploadFile> = {};
        for (let i = 0; i < 10; i++) {
          files[`file${i}`] = createTestUploadFile(`file-${i}`);
        }

        const startTime = Date.now();

        const result = yield* node.run({
          data: files,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        const duration = Date.now() - startTime;

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data).toBeDefined();
          // Should complete reasonably quickly even with 10 files
          expect(duration).toBeLessThan(5000);
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
