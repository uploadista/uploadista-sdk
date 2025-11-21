import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  DocumentAiPlugin,
  DocumentPlugin,
  NodeType,
  resolveUploadMetadata,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect, Either } from "effect";

export type ConvertToMarkdownNodeParams = {
  credentialId?: string;
  resolution?: "tiny" | "small" | "base" | "gundam" | "large";
  keepOutput?: boolean;
};

export function createConvertToMarkdownNode(
  id: string,
  params: ConvertToMarkdownNodeParams = {},
) {
  return Effect.gen(function* () {
    const documentService = yield* DocumentPlugin;
    const documentAiService = yield* DocumentAiPlugin;
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name: "Convert to Markdown",
      description:
        "Convert documents to Markdown format (intelligently uses OCR if needed)",
      type: NodeType.process,
      nodeTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: params.keepOutput,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: file, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };

          yield* Effect.logInfo(`Converting file ${file.id} to Markdown`);

          // Read file bytes from upload server
          const fileBytes = yield* uploadServer.read(file.id, clientId);

          // Try to extract text first (for searchable PDFs)
          const extractResult = yield* documentService
            .extractText(fileBytes)
            .pipe(Effect.either);

          let markdown: string;
          let markdownSource: "text" | "ocr";

          if (
            Either.isRight(extractResult) &&
            extractResult.right.trim().length > 0
          ) {
            // Successfully extracted text from searchable PDF
            const text = extractResult.right;

            yield* Effect.logInfo(
              `Successfully extracted ${text.length} characters from searchable PDF`,
            );

            // Simple text-to-markdown conversion
            // In a real implementation, this could be more sophisticated
            markdown = text
              .split("\n\n")
              .map((para: string) => para.trim())
              .filter((para: string) => para.length > 0)
              .join("\n\n");

            markdownSource = "text";

            yield* Effect.logInfo(
              `Converted text to Markdown (${markdown.length} characters)`,
            );
          } else {
            // Text extraction failed or returned empty - use OCR
            yield* Effect.logInfo(
              "Text extraction failed or returned empty, falling back to OCR",
            );

            const fileUrl = file.url;

            if (!fileUrl) {
              return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                cause: "URL is required for OCR-based markdown conversion",
              }).toEffect();
            }

            // Build context for DocumentAI plugin
            const context = {
              clientId,
              credentialId: params.credentialId,
            };

            // Perform OCR with markdown conversion
            const ocrResult = yield* documentAiService
              .performOCR(
                fileUrl,
                {
                  taskType: "convertToMarkdown",
                  resolution: params.resolution || "gundam",
                },
                context,
              )
              .pipe(
                Effect.catchAll((error) =>
                  Effect.gen(function* () {
                    yield* Effect.logError("Failed to perform OCR", error);
                    return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                      cause:
                        error instanceof Error
                          ? error.message
                          : "Failed to perform OCR for markdown conversion",
                    }).toEffect();
                  }),
                ),
              );

            markdown = ocrResult.extractedText;
            markdownSource = "ocr";

            yield* Effect.logInfo(
              `Successfully converted scanned document to Markdown using OCR (${markdown.length} characters)`,
            );
          }

          const { metadata } = resolveUploadMetadata(file.metadata);

          // Add markdown to metadata
          const newMetadata = {
            ...file.metadata,
            ...metadata,
            markdown,
            markdownSource,
          };

          yield* Effect.logInfo(
            `Successfully converted file ${file.id} to Markdown via ${markdownSource}`,
          );

          return completeNodeExecution({
            ...file,
            metadata: newMetadata,
            flow,
          });
        });
      },
    });
  });
}
