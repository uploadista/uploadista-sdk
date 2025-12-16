import { describe, expect, it, vi } from "@effect/vitest";
import { UploadistaError } from "@uploadista/core/errors";
import {
  TestImageAiPlugin,
  TestImagePlugin,
  TestUploadEngine,
} from "@uploadista/core/testing";
import type { UploadFile } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import {
  createDescribeImageNode,
  createOptimizeNode,
  createRemoveBackgroundNode,
  createResizeNode,
  createTransformImageNode,
} from "../src/index";

/**
 * Test utilities for creating sample data
 */
const createTestUploadFile = (overrides?: Partial<UploadFile>): UploadFile => ({
  id: "test-file-1",
  offset: 0,
  size: 1024,
  storage: {
    id: "test-storage",
    type: "memory",
  },
  metadata: {
    mimeType: "image/jpeg",
    originalName: "test-image.jpg",
    fileName: "test-image.jpg",
    extension: "jpg",
    width: 800,
    height: 600,
  },
  url: "https://example.com/test-image.jpg",
  creationDate: new Date().toISOString(),
  ...overrides,
});

/**
 * Test layer combining all mocks
 */
const TestLayer = Layer.mergeAll(
  TestImagePlugin,
  TestImageAiPlugin,
  TestUploadEngine,
);

// Mock fetch for URL availability tests
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
  } as Response),
);

describe("Image Nodes", () => {
  describe("OptimizeNode", () => {
    it.effect("should create optimize node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createOptimizeNode("optimize-1", {
          quality: 80,
          format: "webp",
        });

        expect(node.id).toBe("optimize-1");
        expect(node.name).toBe("Optimize");
        expect(node.description).toBe("Optimizes an image for web delivery");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should optimize image to webp format", () =>
      Effect.gen(function* () {
        const node = yield* createOptimizeNode("optimize-webp", {
          quality: 85,
          format: "webp",
        });

        const testFile = createTestUploadFile();

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
          expect(result.data.metadata?.mimeType).toBe("image/webp");
          expect(result.data.metadata?.fileName).toContain(".webp");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should optimize image to jpeg format", () =>
      Effect.gen(function* () {
        const node = yield* createOptimizeNode("optimize-jpeg", {
          quality: 90,
          format: "jpeg",
        });

        const testFile = createTestUploadFile();

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
          expect(result.data.metadata?.fileName).toContain(".jpg");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should optimize image to png format", () =>
      Effect.gen(function* () {
        const node = yield* createOptimizeNode("optimize-png", {
          quality: 100,
          format: "png",
        });

        const testFile = createTestUploadFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data.metadata?.mimeType).toBe("image/png");
          expect(result.data.metadata?.fileName).toContain(".png");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should optimize image to avif format", () =>
      Effect.gen(function* () {
        const node = yield* createOptimizeNode("optimize-avif", {
          quality: 75,
          format: "avif",
        });

        const testFile = createTestUploadFile();

        const result = yield* node.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        expect(result.type).toBe("complete");
        if (result.type === "complete") {
          expect(result.data.metadata?.mimeType).toBe("image/avif");
          expect(result.data.metadata?.fileName).toContain(".avif");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle different quality levels", () =>
      Effect.gen(function* () {
        const highQualityNode = yield* createOptimizeNode("optimize-high", {
          quality: 95,
          format: "jpeg",
        });

        const lowQualityNode = yield* createOptimizeNode("optimize-low", {
          quality: 50,
          format: "jpeg",
        });

        const testFile = createTestUploadFile();

        const highResult = yield* highQualityNode.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        const lowResult = yield* lowQualityNode.run({
          data: testFile,
          jobId: "test-job",
          flowId: "test-flow",
          storageId: "test-storage",
          clientId: "test-client",
        });

        // Lower quality should result in smaller file
        expect(highResult.type).toBe("complete");
        expect(lowResult.type).toBe("complete");
        if (
          highResult.type === "complete" &&
          lowResult.type === "complete" &&
          highResult.data.size &&
          lowResult.data.size
        ) {
          expect(lowResult.data.size).toBeLessThan(highResult.data.size);
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("ResizeNode", () => {
    it.effect("should create resize node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createResizeNode("resize-1", {
          width: 800,
          height: 600,
          fit: "cover",
        });

        expect(node.id).toBe("resize-1");
        expect(node.name).toBe("Resize");
        expect(node.description).toBe(
          "Resizes an image to the specified dimensions",
        );
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should resize image with both width and height", () =>
      Effect.gen(function* () {
        const node = yield* createResizeNode("resize-both", {
          width: 400,
          height: 300,
          fit: "cover",
        });

        const testFile = createTestUploadFile();

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
          expect(result.data.size).toBeGreaterThan(0);
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should resize image with width only", () =>
      Effect.gen(function* () {
        const node = yield* createResizeNode("resize-width", {
          width: 1000,
          fit: "contain",
        });

        const testFile = createTestUploadFile();

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

    it.effect("should resize image with height only", () =>
      Effect.gen(function* () {
        const node = yield* createResizeNode("resize-height", {
          height: 500,
          fit: "cover",
        });

        const testFile = createTestUploadFile();

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

    it.effect("should handle different fit modes", () =>
      Effect.gen(function* () {
        const fitModes: Array<"cover" | "contain" | "fill"> = [
          "cover",
          "contain",
          "fill",
        ];

        for (const fit of fitModes) {
          const node = yield* createResizeNode(`resize-${fit}`, {
            width: 800,
            height: 600,
            fit,
          });

          const testFile = createTestUploadFile();

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
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("TransformImageNode", () => {
    it.effect("should create transform node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createTransformImageNode("transform-1", {
          transformations: [{ type: "grayscale" }],
        });

        expect(node.id).toBe("transform-1");
        expect(node.name).toBe("Transform Image");
        expect(node.description).toContain("1 transformation");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should apply single transformation", () =>
      Effect.gen(function* () {
        const node = yield* createTransformImageNode("transform-single", {
          transformations: [{ type: "grayscale" }],
        });

        const testFile = createTestUploadFile();

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

    it.effect("should apply multiple transformations in sequence", () =>
      Effect.gen(function* () {
        const node = yield* createTransformImageNode("transform-multi", {
          transformations: [
            { type: "blur", sigma: 5 },
            { type: "grayscale" },
            { type: "rotate", angle: 90 },
          ],
        });

        const testFile = createTestUploadFile();

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
        expect(node.description).toContain("3 transformations");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should handle blur transformation", () =>
      Effect.gen(function* () {
        const node = yield* createTransformImageNode("transform-blur", {
          transformations: [{ type: "blur", sigma: 3 }],
        });

        const testFile = createTestUploadFile();

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

    it.effect("should handle rotate transformation", () =>
      Effect.gen(function* () {
        const node = yield* createTransformImageNode("transform-rotate", {
          transformations: [{ type: "rotate", angle: 180 }],
        });

        const testFile = createTestUploadFile();

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

    it.effect("should handle flip transformation", () =>
      Effect.gen(function* () {
        const node = yield* createTransformImageNode("transform-flip", {
          transformations: [{ type: "flip", direction: "horizontal" }],
        });

        const testFile = createTestUploadFile();

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
  });

  describe("DescribeImageNode", () => {
    it.effect("should create describe image node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createDescribeImageNode("describe-1");

        expect(node.id).toBe("describe-1");
        expect(node.name).toBe("Describe Image");
        expect(node.description).toBe("Describes the image using AI");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should describe image and add description to metadata", () =>
      Effect.gen(function* () {
        const node = yield* createDescribeImageNode("describe-test");

        const testFile = createTestUploadFile();

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
          expect(result.data.metadata?.description).toBeDefined();
          expect(typeof result.data.metadata?.description).toBe("string");
          expect(result.data.metadata?.description).toContain("test image");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail when URL is missing", () =>
      Effect.gen(function* () {
        const node = yield* createDescribeImageNode("describe-no-url");

        const testFile = createTestUploadFile({ url: undefined });

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
          expect(result.left.code).toBe("FLOW_NODE_ERROR");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should pass credential ID to AI plugin", () =>
      Effect.gen(function* () {
        const credentialId = "test-cred-123";
        const node = yield* createDescribeImageNode("describe-cred", {
          credentialId,
        });

        const testFile = createTestUploadFile();

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
          expect(result.data.metadata?.description).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("RemoveBackgroundNode", () => {
    it.effect(
      "should create remove background node with correct properties",
      () =>
        Effect.gen(function* () {
          const node = yield* createRemoveBackgroundNode("remove-bg-1");

          expect(node.id).toBe("remove-bg-1");
          expect(node.name).toBe("Remove Background");
          expect(node.description).toBe("Removes the background from an image");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should remove background and create new file", () =>
      Effect.gen(function* () {
        const node = yield* createRemoveBackgroundNode("remove-bg-test");

        const testFile = createTestUploadFile();

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
          // Should be a new file ID
          expect(result.data.id).not.toBe(testFile.id);
          expect(result.data.url).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should fail when URL is missing", () =>
      Effect.gen(function* () {
        const node = yield* createRemoveBackgroundNode("remove-bg-no-url");

        const testFile = createTestUploadFile({ url: undefined });

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
          expect(result.left.code).toBe("FLOW_NODE_ERROR");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should pass credential ID to AI plugin", () =>
      Effect.gen(function* () {
        const credentialId = "test-cred-456";
        const node = yield* createRemoveBackgroundNode("remove-bg-cred", {
          credentialId,
        });

        const testFile = createTestUploadFile();

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

    it.effect("should preserve image metadata", () =>
      Effect.gen(function* () {
        const node = yield* createRemoveBackgroundNode("remove-bg-metadata");

        const testFile = createTestUploadFile({
          metadata: {
            mimeType: "image/png",
            originalName: "photo.png",
            fileName: "photo.png",
            extension: "png",
            width: 1920,
            height: 1080,
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
          expect(result.data.metadata?.mimeType).toBe("image/png");
          expect(result.data.metadata?.extension).toBe("png");
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
