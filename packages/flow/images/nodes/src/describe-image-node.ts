import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  IMAGE_DESCRIPTION_OUTPUT_TYPE_ID,
  ImageAiPlugin,
  imageDescriptionOutputSchema,
  NodeType,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";

import { Effect } from "effect";
import { waitForUrlAvailability } from "./wait-for-url";

export function createDescribeImageNode(
  id: string,
  { credentialId, keepOutput }: { credentialId?: string; keepOutput?: boolean } = {},
) {
  return Effect.gen(function* () {
    const imageAiService = yield* ImageAiPlugin;

    return yield* createFlowNode({
      id,
      name: "Describe Image",
      description: "Describes the image using AI",
      type: NodeType.process,
      outputTypeId: IMAGE_DESCRIPTION_OUTPUT_TYPE_ID,
      keepOutput,
      inputSchema: uploadFileSchema,
      outputSchema: imageDescriptionOutputSchema,
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
          const result = yield* imageAiService
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

          yield* Effect.logInfo(
            `Successfully described image for file ${file.id}`,
          );

          // Return structured image description output (not UploadFile)
          return completeNodeExecution({
            description: result.description,
            flow,
          });
        });
      },
    });
  });
}
