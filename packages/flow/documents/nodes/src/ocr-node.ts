import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  DocumentAiPlugin,
  NodeType,
  type OcrTaskType,
  type OcrResolution,
  resolveUploadMetadata,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { Effect } from "effect";

export type OcrNodeParams = {
  taskType: OcrTaskType;
  resolution?: OcrResolution;
  credentialId?: string;
  referenceText?: string;
};

export function createOcrNode(
  id: string,
  params: OcrNodeParams,
) {
  return Effect.gen(function* () {
    const documentAiService = yield* DocumentAiPlugin;

    return yield* createFlowNode({
      id,
      name: "OCR",
      description: "Extract text from scanned documents using AI",
      type: NodeType.process,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: file, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };

          const fileUrl = file.url;

          // Validate input
          if (!fileUrl) {
            return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
              cause: "URL is required for OCR operation",
            }).toEffect();
          }

          yield* Effect.logInfo(
            `Starting OCR for file ${file.id} with task type: ${params.taskType}`,
          );

          // Build context for DocumentAI plugin
          const context = {
            clientId,
            credentialId: params.credentialId,
          };

          // Perform OCR with error handling
          const ocrResult = yield* documentAiService
            .performOCR(
              fileUrl,
              {
                taskType: params.taskType,
                resolution: params.resolution,
                referenceText: params.referenceText,
              },
              context
            )
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to perform OCR", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to perform OCR",
                  }).toEffect();
                }),
              ),
            );

          const { metadata } = resolveUploadMetadata(file.metadata);

          // Add OCR results to metadata
          const newMetadata = {
            ...file.metadata,
            ...metadata,
            ocrText: ocrResult.extractedText,
            ocrFormat: ocrResult.format,
            ocrTaskType: params.taskType,
          };

          yield* Effect.logInfo(
            `Successfully completed OCR for file ${file.id}, extracted ${ocrResult.extractedText.length} characters`,
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
