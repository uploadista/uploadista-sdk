import { UploadistaError } from "@uploadista/core/errors";
import { DocumentPlugin } from "@uploadista/core/flow";
import { Effect, Layer } from "effect";
import { extractText } from "unpdf";

export const unpdfDocumentPlugin = Layer.succeed(
  DocumentPlugin,
  DocumentPlugin.of({
    extractText: (input) => {
      return Effect.gen(function* () {
        const text = yield* Effect.tryPromise({
          try: async () => {
            const result = await extractText(input, {
              mergePages: true,
            });
            return result.text;
          },
          catch: (error) => {
            const errorMessage =
              error instanceof Error ? error.message : String(error);

            if (
              errorMessage.toLowerCase().includes("encrypt") ||
              errorMessage.toLowerCase().includes("password")
            ) {
              return UploadistaError.fromCode("PDF_ENCRYPTED", {
                cause: errorMessage,
              });
            }

            if (
              errorMessage.toLowerCase().includes("corrupt") ||
              errorMessage.toLowerCase().includes("invalid") ||
              errorMessage.toLowerCase().includes("malformed")
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

        // If no text was extracted, log a warning
        if (!text || text.trim().length === 0) {
          yield* Effect.logWarning(
            "No text extracted from PDF. This might be a scanned document or image-based PDF. Consider using OCR instead.",
          );
        }

        return text;
      });
    },

    getMetadata: () => {
      return Effect.gen(function* () {
        // unpdf doesn't support metadata extraction
        // Return an error indicating that pdf-lib should be used instead
        return yield* UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
          cause:
            "unpdf does not support metadata extraction. Use @uploadista/flow-documents-pdflib instead.",
        }).toEffect();
      });
    },

    splitPdf: () => {
      return Effect.gen(function* () {
        // unpdf doesn't support PDF splitting
        return yield* UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
          cause:
            "unpdf does not support PDF splitting. Use @uploadista/flow-documents-pdflib instead.",
        }).toEffect();
      });
    },

    mergePdfs: () => {
      return Effect.gen(function* () {
        // unpdf doesn't support PDF merging
        return yield* UploadistaError.fromCode("DOCUMENT_PROCESSING_FAILED", {
          cause:
            "unpdf does not support PDF merging. Use @uploadista/flow-documents-pdflib instead.",
        }).toEffect();
      });
    },
  }),
);

export const UnpdfDocumentPluginLive = unpdfDocumentPlugin;
