import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  DocumentPlugin,
  NodeType,
  resolveUploadMetadata,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";

export type DescribeDocumentNodeParams = {
  keepOutput?: boolean;
};

export function createDescribeDocumentNode(
  id: string,
  params: DescribeDocumentNodeParams = {},
) {
  return Effect.gen(function* () {
    const documentService = yield* DocumentPlugin;
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name: "Describe Document",
      description: "Extract metadata from PDF documents",
      type: NodeType.process,
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

          yield* Effect.logInfo(
            `Extracting metadata from PDF file ${file.id}`,
          );

          // Read file bytes from upload server
          const fileBytes = yield* uploadServer.read(file.id, clientId);

          // Get metadata with error handling
          const documentMetadata = yield* documentService
            .getMetadata(fileBytes)
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to extract metadata", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to extract metadata",
                  }).toEffect();
                }),
              ),
            );

          const { metadata } = resolveUploadMetadata(file.metadata);

          // Add document metadata to file metadata (filter out null values)
          const newMetadata = {
            ...file.metadata,
            ...metadata,
            pageCount: documentMetadata.pageCount,
            format: documentMetadata.format,
            ...(documentMetadata.author && { author: documentMetadata.author }),
            ...(documentMetadata.title && { title: documentMetadata.title }),
            ...(documentMetadata.subject && { subject: documentMetadata.subject }),
            ...(documentMetadata.creator && { creator: documentMetadata.creator }),
            ...(documentMetadata.creationDate && { creationDate: documentMetadata.creationDate }),
            ...(documentMetadata.modifiedDate && { modifiedDate: documentMetadata.modifiedDate }),
            fileSize: documentMetadata.fileSize,
          };

          yield* Effect.logInfo(
            `Successfully extracted metadata from file ${file.id}: ${documentMetadata.pageCount} pages`,
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
