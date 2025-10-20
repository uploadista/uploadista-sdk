import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  ImageAiPlugin,
  NodeType,
  resolveUploadMetadata,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";

import { Effect } from "effect";
import { waitForUrlAvailability } from "./wait-for-url";

export function createDescribeImageNode(
  id: string,
  { credentialId }: { credentialId?: string } = {},
) {
  return Effect.gen(function* () {
    const imageAiService = yield* ImageAiPlugin;

    return yield* createFlowNode({
      id,
      name: "Describe Image",
      description: "Describes the image using AI",
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
              cause: "URL is required for describe image operation",
            }).toEffect();
          }

          yield* Effect.logInfo(
            `Describing image for file ${file.id} at URL: ${fileUrl}`,
          );

          // Wait for URL to be available with retry mechanism
          yield* waitForUrlAvailability(fileUrl);

          // Build context for ImageAI plugin
          const context = {
            clientId,
            credentialId,
          };

          // Describe image with error handling
          const { description } = yield* imageAiService
            .describeImage(fileUrl, context)
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to describe image", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to describe image",
                  }).toEffect();
                }),
              ),
            );

          const { metadata } = resolveUploadMetadata(file.metadata);

          // add description to metadata
          const newMetadata = {
            ...file.metadata,
            ...metadata,
            description,
          };

          yield* Effect.logInfo(
            `Successfully described image for file ${file.id}`,
          );

          return completeNodeExecution(
            newMetadata
              ? {
                  ...file,
                  metadata: newMetadata,
                  flow,
                }
              : file,
          );
        });
      },
    });
  });
}
