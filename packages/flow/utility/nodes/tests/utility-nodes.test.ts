import { describe, expect, it } from "@effect/vitest";
import { UploadistaError } from "@uploadista/core/errors";
import {
  createFlow,
  createFlowNode,
  NodeType,
} from "@uploadista/core/flow";
import { TestUploadEngine, TestZipPlugin } from "@uploadista/core/testing";
import type { UploadFile } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import { z } from "zod";
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

  describe("Conditional Flow Routing", () => {
    /**
     * Helper to create an UploadFile for testing conditional routing
     */
    const createConditionalTestFile = (
      id: string,
      overrides?: { size?: number; mimeType?: string },
    ): UploadFile => ({
      id,
      offset: 0,
      size: overrides?.size ?? 1024,
      storage: {
        id: "test-storage",
        type: "memory",
      },
      metadata: {
        mimeType: overrides?.mimeType ?? "text/plain",
        originalName: `file-${id}.txt`,
        extension: "txt",
      },
      creationDate: new Date().toISOString(),
    });

    /**
     * Schema for UploadFile used in conditional routing tests
     */
    const uploadFileSchema = z.object({
      id: z.string(),
      offset: z.number(),
      size: z.number(),
      storage: z.object({
        id: z.string(),
        type: z.string(),
      }),
      metadata: z.record(z.string(), z.unknown()).optional(),
      creationDate: z.string().optional(),
    });

    it.effect(
      "should execute only the true branch when condition evaluates to true",
      () =>
        Effect.gen(function* () {
          // Create input node
          const inputNode = yield* createFlowNode({
            id: "input",
            name: "Input",
            description: "Input node",
            type: NodeType.input,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({ type: "complete", data }),
          });

          // Create conditional node that checks if size > 500
          const conditionalNode = yield* createConditionalNode("conditional", {
            field: "size",
            operator: "greaterThan",
            value: 500,
          });

          // Create node for true branch (size > 500)
          const trueBranchNode = yield* createFlowNode({
            id: "true-branch",
            name: "True Branch",
            description: "Executes when condition is true",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-TRUE` },
              }),
          });

          // Create node for false branch (size <= 500)
          const falseBranchNode = yield* createFlowNode({
            id: "false-branch",
            name: "False Branch",
            description: "Executes when condition is false",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-FALSE` },
              }),
          });

          // Create flow with conditional routing
          const flow = yield* createFlow({
            flowId: "conditional-true-test",
            name: "Conditional True Test",
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            nodes: {
              input: inputNode,
              conditional: conditionalNode,
              "true-branch": trueBranchNode,
              "false-branch": falseBranchNode,
            },
            edges: [
              { source: "input", target: "conditional" },
              { source: "conditional", target: "true-branch", sourcePort: "true" },
              { source: "conditional", target: "false-branch", sourcePort: "false" },
            ],
          });

          // Run with size > 500 (should trigger true branch)
          const result = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { size: 1000 }) },
            storageId: "test-storage",
            jobId: "test-job",
            clientId: null,
          });

          expect(result.type).toBe("completed");
          if (result.type === "completed") {
            // True branch should have executed
            expect(result.result["true-branch"]).toBeDefined();
            expect(result.result["true-branch"].id).toBe("test-TRUE");
            // False branch should NOT have executed (skipped)
            expect(result.result["false-branch"]).toBeUndefined();
          }
        }),
    );

    it.effect(
      "should execute only the false branch when condition evaluates to false",
      () =>
        Effect.gen(function* () {
          // Create input node
          const inputNode = yield* createFlowNode({
            id: "input",
            name: "Input",
            description: "Input node",
            type: NodeType.input,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({ type: "complete", data }),
          });

          // Create conditional node that checks if size > 500
          const conditionalNode = yield* createConditionalNode("conditional", {
            field: "size",
            operator: "greaterThan",
            value: 500,
          });

          // Create node for true branch
          const trueBranchNode = yield* createFlowNode({
            id: "true-branch",
            name: "True Branch",
            description: "Executes when condition is true",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-TRUE` },
              }),
          });

          // Create node for false branch
          const falseBranchNode = yield* createFlowNode({
            id: "false-branch",
            name: "False Branch",
            description: "Executes when condition is false",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-FALSE` },
              }),
          });

          // Create flow
          const flow = yield* createFlow({
            flowId: "conditional-false-test",
            name: "Conditional False Test",
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            nodes: {
              input: inputNode,
              conditional: conditionalNode,
              "true-branch": trueBranchNode,
              "false-branch": falseBranchNode,
            },
            edges: [
              { source: "input", target: "conditional" },
              { source: "conditional", target: "true-branch", sourcePort: "true" },
              { source: "conditional", target: "false-branch", sourcePort: "false" },
            ],
          });

          // Run with size <= 500 (should trigger false branch)
          const result = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { size: 100 }) },
            storageId: "test-storage",
            jobId: "test-job",
            clientId: null,
          });

          expect(result.type).toBe("completed");
          if (result.type === "completed") {
            // False branch should have executed
            expect(result.result["false-branch"]).toBeDefined();
            expect(result.result["false-branch"].id).toBe("test-FALSE");
            // True branch should NOT have executed (skipped)
            expect(result.result["true-branch"]).toBeUndefined();
          }
        }),
    );

    it.effect(
      "should skip downstream nodes when their only input is from a skipped conditional branch",
      () =>
        Effect.gen(function* () {
          // Create input node
          const inputNode = yield* createFlowNode({
            id: "input",
            name: "Input",
            description: "Input node",
            type: NodeType.input,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({ type: "complete", data }),
          });

          // Create conditional node
          const conditionalNode = yield* createConditionalNode("conditional", {
            field: "mimeType",
            operator: "equals",
            value: "image/jpeg",
          });

          // Create true branch node
          const trueBranchNode = yield* createFlowNode({
            id: "true-branch",
            name: "True Branch",
            description: "First node in true path",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-TRUE` },
              }),
          });

          // Create downstream node that depends on true branch
          const downstreamNode = yield* createFlowNode({
            id: "downstream",
            name: "Downstream",
            description: "Depends on true branch",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-DOWNSTREAM` },
              }),
          });

          // Create false branch node (this will be a sink)
          const falseBranchNode = yield* createFlowNode({
            id: "false-branch",
            name: "False Branch",
            description: "False path sink",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: `${data.id}-FALSE` },
              }),
          });

          // Create flow: input -> conditional -> true-branch -> downstream
          //                                   -> false-branch
          const flow = yield* createFlow({
            flowId: "conditional-cascade-test",
            name: "Conditional Cascade Test",
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            nodes: {
              input: inputNode,
              conditional: conditionalNode,
              "true-branch": trueBranchNode,
              downstream: downstreamNode,
              "false-branch": falseBranchNode,
            },
            edges: [
              { source: "input", target: "conditional" },
              { source: "conditional", target: "true-branch", sourcePort: "true" },
              { source: "true-branch", target: "downstream" },
              { source: "conditional", target: "false-branch", sourcePort: "false" },
            ],
          });

          // Run with mimeType != "image/jpeg" (should trigger false branch)
          const result = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { mimeType: "text/plain" }) },
            storageId: "test-storage",
            jobId: "test-job",
            clientId: null,
          });

          expect(result.type).toBe("completed");
          if (result.type === "completed") {
            // False branch should have executed
            expect(result.result["false-branch"]).toBeDefined();
            expect(result.result["false-branch"].id).toBe("test-FALSE");
            // True branch and its downstream should NOT have executed
            expect(result.result["true-branch"]).toBeUndefined();
            expect(result.result["downstream"]).toBeUndefined();
          }
        }),
    );

    it.effect(
      "should handle conditional with equals operator on mimeType",
      () =>
        Effect.gen(function* () {
          const inputNode = yield* createFlowNode({
            id: "input",
            name: "Input",
            description: "Input node",
            type: NodeType.input,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({ type: "complete", data }),
          });

          const conditionalNode = yield* createConditionalNode("conditional", {
            field: "mimeType",
            operator: "equals",
            value: "image/png",
          });

          const trueBranchNode = yield* createFlowNode({
            id: "true-branch",
            name: "True Branch",
            description: "PNG handler",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: "PNG_PROCESSED" },
              }),
          });

          const falseBranchNode = yield* createFlowNode({
            id: "false-branch",
            name: "False Branch",
            description: "Non-PNG handler",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: "OTHER_PROCESSED" },
              }),
          });

          const flow = yield* createFlow({
            flowId: "mimetype-conditional-test",
            name: "MimeType Conditional Test",
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            nodes: {
              input: inputNode,
              conditional: conditionalNode,
              "true-branch": trueBranchNode,
              "false-branch": falseBranchNode,
            },
            edges: [
              { source: "input", target: "conditional" },
              { source: "conditional", target: "true-branch", sourcePort: "true" },
              { source: "conditional", target: "false-branch", sourcePort: "false" },
            ],
          });

          // Test with PNG - should go to true branch
          const pngResult = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { mimeType: "image/png" }) },
            storageId: "test-storage",
            jobId: "test-job-1",
            clientId: null,
          });

          expect(pngResult.type).toBe("completed");
          if (pngResult.type === "completed") {
            expect(pngResult.result["true-branch"]?.id).toBe("PNG_PROCESSED");
            expect(pngResult.result["false-branch"]).toBeUndefined();
          }

          // Test with JPEG - should go to false branch
          const jpegResult = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { mimeType: "image/jpeg" }) },
            storageId: "test-storage",
            jobId: "test-job-2",
            clientId: null,
          });

          expect(jpegResult.type).toBe("completed");
          if (jpegResult.type === "completed") {
            expect(jpegResult.result["false-branch"]?.id).toBe("OTHER_PROCESSED");
            expect(jpegResult.result["true-branch"]).toBeUndefined();
          }
        }),
    );

    it.effect(
      "should handle conditional with contains operator",
      () =>
        Effect.gen(function* () {
          const inputNode = yield* createFlowNode({
            id: "input",
            name: "Input",
            description: "Input node",
            type: NodeType.input,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({ type: "complete", data }),
          });

          const conditionalNode = yield* createConditionalNode("conditional", {
            field: "mimeType",
            operator: "contains",
            value: "image",
          });

          const imageBranchNode = yield* createFlowNode({
            id: "image-branch",
            name: "Image Branch",
            description: "Handles images",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: "IMAGE_HANDLED" },
              }),
          });

          const otherBranchNode = yield* createFlowNode({
            id: "other-branch",
            name: "Other Branch",
            description: "Handles non-images",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: "OTHER_HANDLED" },
              }),
          });

          const flow = yield* createFlow({
            flowId: "contains-conditional-test",
            name: "Contains Conditional Test",
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            nodes: {
              input: inputNode,
              conditional: conditionalNode,
              "image-branch": imageBranchNode,
              "other-branch": otherBranchNode,
            },
            edges: [
              { source: "input", target: "conditional" },
              { source: "conditional", target: "image-branch", sourcePort: "true" },
              { source: "conditional", target: "other-branch", sourcePort: "false" },
            ],
          });

          // Test with image/jpeg - contains "image" -> true branch
          const imageResult = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { mimeType: "image/jpeg" }) },
            storageId: "test-storage",
            jobId: "test-job-1",
            clientId: null,
          });

          expect(imageResult.type).toBe("completed");
          if (imageResult.type === "completed") {
            expect(imageResult.result["image-branch"]?.id).toBe("IMAGE_HANDLED");
            expect(imageResult.result["other-branch"]).toBeUndefined();
          }

          // Test with text/plain - doesn't contain "image" -> false branch
          const textResult = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { mimeType: "text/plain" }) },
            storageId: "test-storage",
            jobId: "test-job-2",
            clientId: null,
          });

          expect(textResult.type).toBe("completed");
          if (textResult.type === "completed") {
            expect(textResult.result["other-branch"]?.id).toBe("OTHER_HANDLED");
            expect(textResult.result["image-branch"]).toBeUndefined();
          }
        }),
    );

    it.effect(
      "should handle conditional with lessThan operator on size",
      () =>
        Effect.gen(function* () {
          const inputNode = yield* createFlowNode({
            id: "input",
            name: "Input",
            description: "Input node",
            type: NodeType.input,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({ type: "complete", data }),
          });

          // Small files (< 1000 bytes) go to optimization, large files go direct
          const conditionalNode = yield* createConditionalNode("conditional", {
            field: "size",
            operator: "lessThan",
            value: 1000,
          });

          const smallFileBranch = yield* createFlowNode({
            id: "small-file",
            name: "Small File Handler",
            description: "Handles small files",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: "SMALL_OPTIMIZED" },
              }),
          });

          const largeFileBranch = yield* createFlowNode({
            id: "large-file",
            name: "Large File Handler",
            description: "Handles large files",
            type: NodeType.process,
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            run: ({ data }) =>
              Effect.succeed({
                type: "complete",
                data: { ...data, id: "LARGE_DIRECT" },
              }),
          });

          const flow = yield* createFlow({
            flowId: "size-conditional-test",
            name: "Size Conditional Test",
            inputSchema: uploadFileSchema,
            outputSchema: uploadFileSchema,
            nodes: {
              input: inputNode,
              conditional: conditionalNode,
              "small-file": smallFileBranch,
              "large-file": largeFileBranch,
            },
            edges: [
              { source: "input", target: "conditional" },
              { source: "conditional", target: "small-file", sourcePort: "true" },
              { source: "conditional", target: "large-file", sourcePort: "false" },
            ],
          });

          // Test with small file (< 1000)
          const smallResult = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { size: 500 }) },
            storageId: "test-storage",
            jobId: "test-job-1",
            clientId: null,
          });

          expect(smallResult.type).toBe("completed");
          if (smallResult.type === "completed") {
            expect(smallResult.result["small-file"]?.id).toBe("SMALL_OPTIMIZED");
            expect(smallResult.result["large-file"]).toBeUndefined();
          }

          // Test with large file (>= 1000)
          const largeResult = yield* flow.run({
            inputs: { input: createConditionalTestFile("test", { size: 5000 }) },
            storageId: "test-storage",
            jobId: "test-job-2",
            clientId: null,
          });

          expect(largeResult.type).toBe("completed");
          if (largeResult.type === "completed") {
            expect(largeResult.result["large-file"]?.id).toBe("LARGE_DIRECT");
            expect(largeResult.result["small-file"]).toBeUndefined();
          }
        }),
    );
  });
});
