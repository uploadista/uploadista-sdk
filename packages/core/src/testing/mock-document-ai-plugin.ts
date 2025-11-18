import { Effect, Layer } from "effect";
import type { OcrResult } from "../flow";
import { DocumentAiPlugin } from "../flow";

/**
 * Mock DocumentAiPlugin implementation for testing.
 *
 * Provides simple mock implementations of AI document operations.
 *
 * @example
 * ```typescript
 * import { TestDocumentAiPlugin } from "@uploadista/core/testing";
 *
 * const program = Effect.gen(function* () {
 *   const plugin = yield* DocumentAiPlugin;
 *   const result = yield* plugin.performOCR(
 *     "https://example.com/doc.pdf",
 *     { taskType: "convertToMarkdown", resolution: "gundam" },
 *     { clientId: "test-client" }
 *   );
 *   return result;
 * }).pipe(Effect.provide(TestDocumentAiPlugin));
 * ```
 */
export const TestDocumentAiPlugin = Layer.succeed(
  DocumentAiPlugin,
  DocumentAiPlugin.of({
    performOCR: (inputUrl: string, params, context) =>
      Effect.sync(() => {
        const result: OcrResult = {
          extractedText:
            params.taskType === "convertToMarkdown"
              ? "# Document Title\n\nThis is a paragraph with **bold** text.\n\n## Section 2\n\n- List item 1\n- List item 2"
              : "Plain text extracted from document without formatting.",
          format:
            params.taskType === "convertToMarkdown" ? "markdown" : "plain",
          confidence: 0.95,
        };
        return result;
      }),
  }),
);
