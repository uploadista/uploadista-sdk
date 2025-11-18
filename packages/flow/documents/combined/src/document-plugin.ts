import { DocumentPlugin } from "@uploadista/core/flow";
import { pdfLibDocumentPlugin } from "@uploadista/flow-documents-pdflib";
import { unpdfDocumentPlugin } from "@uploadista/flow-documents-unpdf";
import { Effect, Layer } from "effect";

/**
 * Combined DocumentPlugin that uses:
 * - unpdf for text extraction
 * - pdf-lib for metadata, splitting, and merging
 *
 * This provides a complete DocumentPlugin implementation.
 */
export const combinedDocumentPlugin = Layer.unwrapEffect(
  Effect.gen(function* () {
    // Get the pdf-lib plugin for manipulation operations
    const pdfLibPlugin = yield* Effect.provide(
      DocumentPlugin,
      pdfLibDocumentPlugin
    );

    // Get the unpdf plugin for text extraction
    const unpdfPlugin = yield* Effect.provide(
      DocumentPlugin,
      unpdfDocumentPlugin
    );

    // Create a combined plugin
    return Layer.succeed(
      DocumentPlugin,
      DocumentPlugin.of({
        // Use unpdf for text extraction
        extractText: unpdfPlugin.extractText,
        // Use pdf-lib for metadata
        getMetadata: pdfLibPlugin.getMetadata,
        // Use pdf-lib for splitting
        splitPdf: pdfLibPlugin.splitPdf,
        // Use pdf-lib for merging
        mergePdfs: pdfLibPlugin.mergePdfs,
      })
    );
  })
);

export const CombinedDocumentPluginLive = combinedDocumentPlugin;
