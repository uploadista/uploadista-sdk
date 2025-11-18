import { Effect, Layer } from "effect";
import type { DocumentMetadata, SplitPdfResult } from "../flow";
import { DocumentPlugin } from "../flow";

/**
 * Mock DocumentPlugin implementation for testing.
 *
 * Provides simple mock implementations of PDF operations that return mock data.
 *
 * @example
 * ```typescript
 * import { TestDocumentPlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const plugin = yield* DocumentPlugin;
 *   const text = yield* plugin.extractText(pdfBytes);
 *   return text;
 * }).pipe(Effect.provide(TestDocumentPlugin));
 * ```
 */
export const TestDocumentPlugin = Layer.succeed(
  DocumentPlugin,
  DocumentPlugin.of({
    extractText: (input: Uint8Array) =>
      Effect.sync(() => {
        // Mock text extraction
        return "This is extracted text from a PDF document.\nPage 1 content.";
      }),
    splitPdf: (input: Uint8Array, options) =>
      Effect.sync(() => {
        if (options.mode === "range") {
          // Mock range split
          const mockPdf = new Uint8Array(500).fill(80);
          return {
            mode: "range" as const,
            pdf: mockPdf,
          } satisfies SplitPdfResult;
        }
        // Mock individual split
        const mockPdfs = [
          new Uint8Array(200).fill(81),
          new Uint8Array(200).fill(82),
          new Uint8Array(200).fill(83),
        ];
        return {
          mode: "individual" as const,
          pdfs: mockPdfs,
        } satisfies SplitPdfResult;
      }),
    mergePdfs: (options) =>
      Effect.sync(() => {
        // Mock merge: combine sizes
        const totalSize = options.pdfs.reduce(
          (sum, pdf) => sum + pdf.byteLength,
          0,
        );
        return new Uint8Array(totalSize).fill(90);
      }),
    getMetadata: (input: Uint8Array) =>
      Effect.sync(() => {
        const metadata: DocumentMetadata = {
          pageCount: 5,
          format: "pdf",
          author: "Test Author",
          title: "Test Document",
          subject: "Test Subject",
          creator: "Test Creator",
          creationDate: "2024-01-01T00:00:00Z",
          modifiedDate: "2024-01-02T00:00:00Z",
          fileSize: input.byteLength,
        };
        return metadata;
      }),
  }),
);
