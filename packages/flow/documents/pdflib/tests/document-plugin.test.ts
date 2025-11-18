import { describe, expect, it } from "@effect/vitest";
import { DocumentPlugin } from "@uploadista/core/flow";
import { Effect } from "effect";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { PdfLibDocumentPluginLive } from "../src/document-plugin";

/**
 * Test utilities for creating sample PDFs
 */
const createTestPdf = async (
  pageCount: number,
  options?: {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
  },
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();

  // Add metadata if provided
  if (options?.title) pdfDoc.setTitle(options.title);
  if (options?.author) pdfDoc.setAuthor(options.author);
  if (options?.subject) pdfDoc.setSubject(options.subject);
  if (options?.creator) pdfDoc.setCreator(options.creator);

  // Create pages
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([600, 800]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText(`Page ${i + 1}`, {
      x: 50,
      y: 750,
      size: 24,
      font,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Uint8Array(pdfBytes);
};

const getPdfMetadata = async (pdfBytes: Uint8Array) => {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle(),
    author: pdfDoc.getAuthor(),
    subject: pdfDoc.getSubject(),
    creator: pdfDoc.getCreator(),
  };
};

describe("pdf-lib Document Plugin", () => {
  describe("getMetadata", () => {
    it.effect("should extract metadata from PDF with all fields", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() =>
          createTestPdf(3, {
            title: "Test Document",
            author: "Test Author",
            subject: "Test Subject",
            creator: "Test Creator",
          }),
        );

        const metadata = yield* plugin.getMetadata(inputPdf);

        expect(metadata.pageCount).toBe(3);
        expect(metadata.format).toBe("pdf");
        expect(metadata.title).toBe("Test Document");
        expect(metadata.author).toBe("Test Author");
        expect(metadata.subject).toBe("Test Subject");
        expect(metadata.creator).toBe("Test Creator");
        expect(metadata.fileSize).toBeGreaterThan(0);
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should extract metadata from PDF without metadata fields", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(5));

        const metadata = yield* plugin.getMetadata(inputPdf);

        expect(metadata.pageCount).toBe(5);
        expect(metadata.format).toBe("pdf");
        expect(metadata.fileSize).toBeGreaterThan(0);
        // These might be null or undefined for PDFs without metadata
        expect([null, undefined, ""]).toContainEqual(metadata.title);
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should handle single-page PDF", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(1));

        const metadata = yield* plugin.getMetadata(inputPdf);

        expect(metadata.pageCount).toBe(1);
        expect(metadata.format).toBe("pdf");
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );
  });

  describe("splitPdf", () => {
    it.effect("should split PDF into page range", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(10));

        const result = yield* plugin.splitPdf(inputPdf, {
          mode: "range",
          startPage: 3,
          endPage: 5,
        });

        expect(result.mode).toBe("range");
        if (result.mode === "range") {
          expect(result.pdf).toBeInstanceOf(Uint8Array);
          const metadata = yield* Effect.promise(() =>
            getPdfMetadata(result.pdf),
          );
          expect(metadata.pageCount).toBe(3); // Pages 3, 4, 5
        }
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should split PDF into individual pages", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(5));

        const result = yield* plugin.splitPdf(inputPdf, {
          mode: "individual",
        });

        expect(result.mode).toBe("individual");
        if (result.mode === "individual") {
          expect(result.pdfs).toHaveLength(5);

          // Verify each PDF is a single page
          for (const pdf of result.pdfs) {
            expect(pdf).toBeInstanceOf(Uint8Array);
            const metadata = yield* Effect.promise(() => getPdfMetadata(pdf));
            expect(metadata.pageCount).toBe(1);
          }
        }
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should handle splitting single page", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(1));

        const result = yield* plugin.splitPdf(inputPdf, {
          mode: "range",
          startPage: 1,
          endPage: 1,
        });

        expect(result.mode).toBe("range");
        if (result.mode === "range") {
          const metadata = yield* Effect.promise(() =>
            getPdfMetadata(result.pdf),
          );
          expect(metadata.pageCount).toBe(1);
        }
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should fail with invalid page range", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(5));

        // Try to split with out-of-bounds range
        const result = yield* Effect.either(
          plugin.splitPdf(inputPdf, {
            mode: "range",
            startPage: 8,
            endPage: 12,
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.cause).toContain("Invalid page range");
        }
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );
  });

  describe("mergePdfs", () => {
    it.effect("should merge multiple PDFs in correct order", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;

        // Create 3 test PDFs with different page counts
        const pdf1 = yield* Effect.promise(() => createTestPdf(2));
        const pdf2 = yield* Effect.promise(() => createTestPdf(3));
        const pdf3 = yield* Effect.promise(() => createTestPdf(1));

        const merged = yield* plugin.mergePdfs({
          pdfs: [pdf1, pdf2, pdf3],
        });

        expect(merged).toBeInstanceOf(Uint8Array);

        const metadata = yield* Effect.promise(() => getPdfMetadata(merged));
        expect(metadata.pageCount).toBe(6); // 2 + 3 + 1
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should merge two PDFs", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;

        const pdf1 = yield* Effect.promise(() =>
          createTestPdf(4, { title: "First PDF" }),
        );
        const pdf2 = yield* Effect.promise(() =>
          createTestPdf(2, { title: "Second PDF" }),
        );

        const merged = yield* plugin.mergePdfs({
          pdfs: [pdf1, pdf2],
        });

        const metadata = yield* Effect.promise(() => getPdfMetadata(merged));
        expect(metadata.pageCount).toBe(6);
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should handle single PDF in merge array", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const pdf = yield* Effect.promise(() => createTestPdf(3));

        const merged = yield* plugin.mergePdfs({
          pdfs: [pdf],
        });

        const metadata = yield* Effect.promise(() => getPdfMetadata(merged));
        expect(metadata.pageCount).toBe(3);
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );
  });

  describe("error handling", () => {
    it.effect("should fail with corrupted PDF data", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const invalidData = new Uint8Array([1, 2, 3, 4, 5]);

        const result = yield* Effect.either(plugin.getMetadata(invalidData));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          // Just check that we got an error
          expect(result.left).toBeDefined();
        }
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should fail split with negative page numbers", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(5));

        const result = yield* Effect.either(
          plugin.splitPdf(inputPdf, {
            mode: "range",
            startPage: -1,
            endPage: 2,
          }),
        );

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );

    it.effect("should fail split with startPage > endPage", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() => createTestPdf(5));

        const result = yield* Effect.either(
          plugin.splitPdf(inputPdf, {
            mode: "range",
            startPage: 5,
            endPage: 2,
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left.cause).toContain("Invalid page range");
        }
      }).pipe(Effect.provide(PdfLibDocumentPluginLive)),
    );
  });
});
