import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  ImageAiPlugin,
  NodeType,
  resolveUploadMetadata,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";
import { waitForUrlAvailability } from "./wait-for-url";

export function createRemoveBackgroundNode(
  id: string,
  { credentialId }: { credentialId?: string } = {},
) {
  return Effect.gen(function* () {
    const imageAiService = yield* ImageAiPlugin;
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name: "Remove Background",
      description: "Removes the background from an image",
      type: NodeType.process,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: file, flowId, jobId, storageId, clientId }) => {
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
              cause: "URL is required for remove background operation",
            }).toEffect();
          }

          yield* Effect.logInfo(
            `Removing background for file ${file.id} at URL: ${file.url}`,
          );

          // Wait for URL to be available with retry mechanism
          yield* waitForUrlAvailability(fileUrl);

          // Build context for ImageAI plugin
          const context = {
            clientId,
            credentialId,
          };

          // Remove background with error handling
          const backgroundRemovalResult = yield* imageAiService
            .removeBackground(fileUrl, context)
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to remove background", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to remove background from image",
                  }).toEffect();
                }),
              ),
            );

          const { outputUrl } = backgroundRemovalResult;
          const { type, fileName, metadata, metadataJson } =
            resolveUploadMetadata(file.metadata);

          yield* Effect.logInfo(`Uploading processed file to storage`);

          // Upload the transformed bytes back to the upload server with error handling
          const result = yield* uploadServer
            .uploadFromUrl(
              {
                storageId,
                size: 0,
                type,
                fileName,
                lastModified: 0,
                metadata: metadataJson,
                flow,
              },
              clientId,
              outputUrl,
            )
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError(
                    "Failed to upload processed file",
                    error,
                  );
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to upload processed file",
                  }).toEffect();
                }),
              ),
            );

          yield* Effect.logInfo(
            `Successfully removed background for file ${file.id}`,
          );

          return completeNodeExecution(
            metadata
              ? {
                  ...result,
                  metadata,
                }
              : result,
          );
        });
      },
    });
  });
}
