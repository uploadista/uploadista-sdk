import { UploadistaError } from "@uploadista/core/errors";
import {
  type DocumentMetadata,
  DocumentPlugin,
  type SplitPdfResult,
} from "@uploadista/core/flow";
import { Effect, Layer } from "effect";
import { PDFDocument } from "pdf-lib";

/**
 * Helper to parse date from PDF date string format
 */
function parsePdfDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;
  try {
    // PDF date format: D:YYYYMMDDHHmmSSOHH'mm'
    // Example: D:20230101120000Z
    const match = dateStr.match(
      /D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/,
    );
    if (!match) return null;

    const [, year, month, day, hour = "00", minute = "00", second = "00"] =
      match;
    const date = new Date(
      `${year}-${month}-${day}T${hour}:${minute}:${second}Z`,
    );
    return date.toISOString();
  } catch {
    return null;
  }
}

export const pdfLibDocumentPlugin = Layer.succeed(
  DocumentPlugin,
  DocumentPlugin.of({
    extractText: (_input) => {
      return Effect.gen(function* () {
        // pdf-lib has very limited text extraction capabilities
        // Return an error indicating that unpdf should be used instead
        return yield* UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
          cause:
            "pdf-lib does not support text extraction. Use @uploadista/flow-documents-unpdf instead.",
        }).toEffect();
      });
    },

    getMetadata: (input) => {
      return Effect.gen(function* () {
        const pdfDoc = yield* Effect.tryPromise({
          try: async () =>
            await PDFDocument.load(input, { ignoreEncryption: false }),
          catch: (error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            if (errorMessage.toLowerCase().includes("encrypt")) {
              return UploadistaError.fromCode("PDF_ENCRYPTED", {
                cause: errorMessage,
              });
            }

            if (
              errorMessage.toLowerCase().includes("corrupt") ||
              errorMessage.toLowerCase().includes("invalid")
            ) {
              return UploadistaError.fromCode("PDF_CORRUPTED", {
                cause: errorMessage,
              });
            }

            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: errorMessage,
            });
          },
        });

        const pageCount = pdfDoc.getPageCount();
        const author = pdfDoc.getAuthor() || null;
        const title = pdfDoc.getTitle() || null;
        const subject = pdfDoc.getSubject() || null;
        const creator = pdfDoc.getCreator() || null;
        const creationDateStr = pdfDoc.getCreationDate();
        const modificationDateStr = pdfDoc.getModificationDate();

        const creationDate = creationDateStr
          ? parsePdfDate(creationDateStr.toString())
          : null;
        const modifiedDate = modificationDateStr
          ? parsePdfDate(modificationDateStr.toString())
          : null;

        const metadata: DocumentMetadata = {
          pageCount,
          format: "pdf",
          author,
          title,
          subject,
          creator,
          creationDate,
          modifiedDate,
          fileSize: input.byteLength,
        };

        return metadata;
      });
    },

    splitPdf: (input, options) => {
      return Effect.gen(function* () {
        const pdfDoc = yield* Effect.tryPromise({
          try: async () =>
            await PDFDocument.load(input, { ignoreEncryption: false }),
          catch: (error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            if (errorMessage.toLowerCase().includes("encrypt")) {
              return UploadistaError.fromCode("PDF_ENCRYPTED", {
                cause: errorMessage,
              });
            }

            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: errorMessage,
            });
          },
        });

        const totalPages = pdfDoc.getPageCount();

        if (options.mode === "individual") {
          // Split into individual pages
          const pdfs: Uint8Array[] = [];

          for (let i = 0; i < totalPages; i++) {
            const newPdf = yield* Effect.tryPromise({
              try: async () => await PDFDocument.create(),
              catch: (error) => {
                return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
                  cause: error instanceof Error ? error.message : String(error),
                });
              },
            });

            const [copiedPage] = yield* Effect.tryPromise({
              try: async () => await newPdf.copyPages(pdfDoc, [i]),
              catch: (error) => {
                return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
                  cause: error instanceof Error ? error.message : String(error),
                });
              },
            });

            newPdf.addPage(copiedPage);

            const pdfBytes = yield* Effect.tryPromise({
              try: async () => await newPdf.save(),
              catch: (error) => {
                return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
                  cause: error instanceof Error ? error.message : String(error),
                });
              },
            });

            pdfs.push(new Uint8Array(pdfBytes));
          }

          const result: SplitPdfResult = {
            mode: "individual",
            pdfs,
          };

          return result;
        }

        // Range mode
        if (!options.startPage || !options.endPage) {
          return yield* UploadistaError.fromCode("PAGE_RANGE_INVALID", {
            cause: "startPage and endPage are required for range mode",
          }).toEffect();
        }

        // Validate page range (1-indexed)
        if (
          options.startPage < 1 ||
          options.endPage > totalPages ||
          options.startPage > options.endPage
        ) {
          return yield* UploadistaError.fromCode("PAGE_RANGE_INVALID", {
            cause: `Invalid page range: ${options.startPage}-${options.endPage}. Document has ${totalPages} pages.`,
          }).toEffect();
        }

        const newPdf = yield* Effect.tryPromise({
          try: async () => await PDFDocument.create(),
          catch: (error) => {
            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: error instanceof Error ? error.message : String(error),
            });
          },
        });

        // Convert from 1-indexed to 0-indexed
        const pageIndices = Array.from(
          { length: options.endPage - options.startPage + 1 },
          (_, i) => (options.startPage ?? 1) - 1 + i,
        );

        const copiedPages = yield* Effect.tryPromise({
          try: async () => await newPdf.copyPages(pdfDoc, pageIndices),
          catch: (error) => {
            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: error instanceof Error ? error.message : String(error),
            });
          },
        });

        for (const page of copiedPages) {
          newPdf.addPage(page);
        }

        const pdfBytes = yield* Effect.tryPromise({
          try: async () => await newPdf.save(),
          catch: (error) => {
            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: error instanceof Error ? error.message : String(error),
            });
          },
        });

        const result: SplitPdfResult = {
          mode: "range",
          pdf: new Uint8Array(pdfBytes),
        };

        return result;
      });
    },

    mergePdfs: (options) => {
      return Effect.gen(function* () {
        if (options.pdfs.length === 0) {
          return yield* UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
            cause: "At least one PDF is required for merging",
          }).toEffect();
        }

        if (options.pdfs.length === 1) {
          // Single PDF, just return it
          yield* Effect.logWarning(
            "Only one PDF provided for merging, returning original",
          );
          return options.pdfs[0];
        }

        const mergedPdf = yield* Effect.tryPromise({
          try: async () => await PDFDocument.create(),
          catch: (error) => {
            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: error instanceof Error ? error.message : String(error),
            });
          },
        });

        for (const pdfBytes of options.pdfs) {
          const pdf = yield* Effect.tryPromise({
            try: async () =>
              await PDFDocument.load(pdfBytes, { ignoreEncryption: false }),
            catch: (error) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);

              if (errorMessage.toLowerCase().includes("encrypt")) {
                return UploadistaError.fromCode("PDF_ENCRYPTED", {
                  cause: errorMessage,
                });
              }

              return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
                cause: errorMessage,
              });
            },
          });

          const pageCount = pdf.getPageCount();
          const pageIndices = Array.from({ length: pageCount }, (_, i) => i);

          const copiedPages = yield* Effect.tryPromise({
            try: async () => await mergedPdf.copyPages(pdf, pageIndices),
            catch: (error) => {
              return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
                cause: error instanceof Error ? error.message : String(error),
              });
            },
          });

          for (const page of copiedPages) {
            mergedPdf.addPage(page);
          }
        }

        const mergedBytes = yield* Effect.tryPromise({
          try: async () => await mergedPdf.save(),
          catch: (error) => {
            return UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
              cause: error instanceof Error ? error.message : String(error),
            });
          },
        });

        return new Uint8Array(mergedBytes);
      });
    },
  }),
);

export const PdfLibDocumentPluginLive = pdfLibDocumentPlugin;
