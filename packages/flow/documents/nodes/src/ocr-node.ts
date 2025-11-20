import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  DocumentAiPlugin,
  NodeType,
  OCR_OUTPUT_TYPE_ID,
  type OcrResolution,
  type OcrTaskType,
  ocrOutputSchema,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { Effect } from "effect";

export type OcrNodeParams = {
  taskType: OcrTaskType;
  resolution?: OcrResolution;
  credentialId?: string;
  referenceText?: string;
};

export function createOcrNode(id: string, params: OcrNodeParams) {
  return Effect.gen(function* () {
    const documentAiService = yield* DocumentAiPlugin;

    return yield* createFlowNode({
      id,
      name: "OCR",
      description: "Extract text from scanned documents using AI",
      type: NodeType.process,
      nodeTypeId: OCR_OUTPUT_TYPE_ID,
      inputSchema: uploadFileSchema,
      outputSchema: ocrOutputSchema,
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
                        : "Failed to perform OCR",
                  }).toEffect();
                }),
              ),
            );

          yield* Effect.logInfo(
            `Successfully completed OCR for file ${file.id}, extracted ${ocrResult.extractedText.length} characters`,
          );

          // Return structured OCR output (not UploadFile)
          return completeNodeExecution({
            extractedText: ocrResult.extractedText,
            format: ocrResult.format,
            taskType: params.taskType,
            confidence: ocrResult.confidence,
            flow,
          });
        });
      },
    });
  });
}
