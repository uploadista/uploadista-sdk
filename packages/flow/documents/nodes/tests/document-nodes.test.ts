import { describe, expect, it, vi } from "@effect/vitest";
import {
  TestDocumentAiPlugin,
  TestDocumentPlugin,
  TestUploadEngine,
} from "@uploadista/core/testing";
import type { UploadFile } from "@uploadista/core/types";
import { Effect, Layer } from "effect";
import {
  createConvertToMarkdownNode,
  createDescribeDocumentNode,
  createExtractTextNode,
  createMergePdfNode,
  createOcrNode,
  createSplitPdfNode,
} from "../src/index";

/**
 * Test utilities for creating sample data
 */
const createTestUploadFile = (overrides?: Partial<UploadFile>): UploadFile => ({
  id: "test-file-1",
  offset: 0,
  size: 2048,
  storage: {
    id: "test-storage",
    type: "memory",
  },
  metadata: {
    mimeType: "application/pdf",
    originalName: "test-document.pdf",
    fileName: "test-document.pdf",
    extension: "pdf",
  },
  url: "https://example.com/test-document.pdf",
  creationDate: new Date().toISOString(),
  ...overrides,
});

/**
 * Test layer combining all mocks
 */
const TestLayer = Layer.mergeAll(
  TestDocumentPlugin,
  TestDocumentAiPlugin,
  TestUploadEngine,
);

// Mock fetch for URL availability tests
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
  } as Response),
);

describe("Document Nodes", () => {
  describe("ExtractTextNode", () => {
    it.effect("should create extract text node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createExtractTextNode("extract-1", {});

        expect(node.id).toBe("extract-1");
        expect(node.name).toBe("Extract Text");
        expect(node.description).toContain("Extract text");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should extract text from PDF", () =>
      Effect.gen(function* () {
        const node = yield* createExtractTextNode("extract-text", {});
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
          expect(result.data.metadata?.extractedText).toBeDefined();
          expect(result.data.metadata?.extractedText).toContain(
            "extracted text",
          );
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("SplitPdfNode", () => {
    it.effect("should create split PDF node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createSplitPdfNode("split-1", {
          mode: "range",
          startPage: 1,
          endPage: 3,
        });

        expect(node.id).toBe("split-1");
        expect(node.name).toBe("Split PDF");
        expect(node.description).toContain("Split");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should split PDF by page range", () =>
      Effect.gen(function* () {
        const node = yield* createSplitPdfNode("split-range", {
          mode: "range",
          startPage: 2,
          endPage: 4,
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

    it.effect("should split PDF into individual pages", () =>
      Effect.gen(function* () {
        const node = yield* createSplitPdfNode("split-individual", {
          mode: "individual",
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
          // Individual mode outputs array of files
          expect(result.data).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("MergePdfNode", () => {
    it.effect("should create merge PDF node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createMergePdfNode("merge-1", {});

        expect(node.id).toBe("merge-1");
        expect(node.name).toBe("Merge PDFs");
        expect(node.description).toContain("Merge");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should merge multiple PDFs", () =>
      Effect.gen(function* () {
        const node = yield* createMergePdfNode("merge-pdfs", {});
        const testFiles = [
          createTestUploadFile({ id: "file-1" }),
          createTestUploadFile({ id: "file-2" }),
          createTestUploadFile({ id: "file-3" }),
        ];

        const result = yield* node.run({
          data: testFiles,
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

  describe("DescribeDocumentNode", () => {
    it.effect(
      "should create describe document node with correct properties",
      () =>
        Effect.gen(function* () {
          const node = yield* createDescribeDocumentNode("describe-1", {});

          expect(node.id).toBe("describe-1");
          expect(node.name).toBe("Describe Document");
          expect(node.description).toContain("metadata");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should extract document metadata", () =>
      Effect.gen(function* () {
        const node = yield* createDescribeDocumentNode("describe-doc", {});
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
          expect(result.data.metadata?.pageCount).toBeDefined();
          expect(result.data.metadata?.author).toBeDefined();
          expect(result.data.metadata?.title).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("OcrNode", () => {
    it.effect("should create OCR node with correct properties", () =>
      Effect.gen(function* () {
        const node = yield* createOcrNode("ocr-1", {
          taskType: "convertToMarkdown",
          resolution: "gundam",
        });

        expect(node.id).toBe("ocr-1");
        expect(node.name).toBe("OCR");
        expect(node.description).toContain("text");
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should perform OCR with markdown conversion", () =>
      Effect.gen(function* () {
        const node = yield* createOcrNode("ocr-markdown", {
          taskType: "convertToMarkdown",
          resolution: "gundam",
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
          expect(result.data.extractedText).toBeDefined();
          expect(result.data.format).toBe("markdown");
        }
      }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should perform free OCR", () =>
      Effect.gen(function* () {
        const node = yield* createOcrNode("ocr-free", {
          taskType: "freeOcr",
          resolution: "base",
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
          expect(result.data.extractedText).toBeDefined();
          expect(result.data.format).toBe("plain");
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });

  describe("ConvertToMarkdownNode", () => {
    it.effect(
      "should create convert to markdown node with correct properties",
      () =>
        Effect.gen(function* () {
          const node = yield* createConvertToMarkdownNode("convert-1", {});

          expect(node.id).toBe("convert-1");
          expect(node.name).toBe("Convert to Markdown");
          expect(node.description).toContain("Markdown");
        }).pipe(Effect.provide(TestLayer)),
    );

    it.effect("should convert document to markdown", () =>
      Effect.gen(function* () {
        const node = yield* createConvertToMarkdownNode("convert-md", {});
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
          expect(result.data.metadata?.markdown).toBeDefined();
        }
      }).pipe(Effect.provide(TestLayer)),
    );
  });
});
