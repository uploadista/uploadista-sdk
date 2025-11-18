import { describe, expect, it } from "@effect/vitest";
import { DocumentPlugin } from "@uploadista/core/flow";
import { Effect } from "effect";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { UnpdfDocumentPluginLive } from "../src/document-plugin";

/**
 * Test utilities for creating sample PDFs with text content
 */
const createPdfWithText = async (texts: string[]): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const text of texts) {
    const page = pdfDoc.addPage([600, 800]);
    page.drawText(text, {
      x: 50,
      y: 750,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Uint8Array(pdfBytes);
};

describe("unpdf Document Plugin", () => {
  describe("extractText", () => {
    it.effect("should extract text from single-page PDF", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() =>
          createPdfWithText(["Hello, this is a test document."]),
        );

        const text = yield* plugin.extractText(inputPdf);

        expect(text).toContain("Hello");
        expect(text).toContain("test document");
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );

    it.effect("should extract text from multi-page PDF", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() =>
          createPdfWithText([
            "Page 1 content",
            "Page 2 content",
            "Page 3 content",
          ]),
        );

        const text = yield* plugin.extractText(inputPdf);

        expect(text).toContain("Page 1");
        expect(text).toContain("Page 2");
        expect(text).toContain("Page 3");
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );

    it.effect("should handle PDF with special characters", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const inputPdf = yield* Effect.promise(() =>
          createPdfWithText([
            "Special chars: !@#$%^&*()_+-={}[]|:;<>?,./",
            "Numbers: 1234567890",
            "Unicode: café résumé naïve",
          ]),
        );

        const text = yield* plugin.extractText(inputPdf);

        expect(text).toContain("Special chars");
        expect(text).toContain("Numbers");
        expect(text).toContain("Unicode");
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );

    it.effect("should handle PDF with multiple paragraphs", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const multilineText = `This is paragraph one.
It has multiple lines.

This is paragraph two.
It also has multiple lines.`;

        const inputPdf = yield* Effect.promise(() =>
          createPdfWithText([multilineText]),
        );

        const text = yield* plugin.extractText(inputPdf);

        expect(text).toContain("paragraph one");
        expect(text).toContain("paragraph two");
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );

    it.effect("should handle empty PDF", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const pdfDoc = yield* Effect.promise(() => PDFDocument.create());
        pdfDoc.addPage([600, 800]); // Empty page
        const pdfBytes = yield* Effect.promise(() => pdfDoc.save());
        const inputPdf = new Uint8Array(pdfBytes);

        const text = yield* plugin.extractText(inputPdf);

        // Empty PDF should return empty or whitespace-only string
        expect(text.trim()).toBe("");
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );
  });

  describe("error handling", () => {
    it.effect("should fail with corrupted PDF data", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const invalidData = new Uint8Array([1, 2, 3, 4, 5]);

        const result = yield* Effect.either(plugin.extractText(invalidData));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          // Just check that we got an error
          expect(result.left).toBeDefined();
        }
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );

    it.effect("should fail with empty buffer", () =>
      Effect.gen(function* () {
        const plugin = yield* DocumentPlugin;
        const emptyData = new Uint8Array([]);

        const result = yield* Effect.either(plugin.extractText(emptyData));

        expect(result._tag).toBe("Left");
      }).pipe(Effect.provide(UnpdfDocumentPluginLive)),
    );
  });
});
