import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  DocumentPlugin,
  NodeType,
  resolveUploadMetadata,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";

export type ExtractTextNodeParams = {
  keepOutput?: boolean;
};

export function createExtractTextNode(
  id: string,
  params: ExtractTextNodeParams = {},
) {
  return Effect.gen(function* () {
    const documentService = yield* DocumentPlugin;
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name: "Extract Text",
      description: "Extract text from searchable PDF documents",
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

          yield* Effect.logInfo(`Extracting text from PDF file ${file.id}`);

          // Read file bytes from upload server
          const fileBytes = yield* uploadServer.read(file.id, clientId);

          // Extract text with error handling
          const extractedText = yield* documentService
            .extractText(fileBytes)
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to extract text", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to extract text",
                  }).toEffect();
                }),
              ),
            );

          const { metadata } = resolveUploadMetadata(file.metadata);

          // Add extracted text to metadata
          const newMetadata = {
            ...file.metadata,
            ...metadata,
            extractedText,
          };

          if (!extractedText || extractedText.trim().length === 0) {
            yield* Effect.logWarning(
              `No text extracted from file ${file.id}. This might be a scanned document. Consider using the OCR node instead.`,
            );
          } else {
            yield* Effect.logInfo(
              `Successfully extracted ${extractedText.length} characters from file ${file.id}`,
            );
          }

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
