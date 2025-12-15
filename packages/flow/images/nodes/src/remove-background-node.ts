import { UploadistaError } from "@uploadista/core/errors";
import {
  applyFileNaming,
  buildNamingContext,
  completeNodeExecution,
  createFlowNode,
  type FileNamingConfig,
  ImageAiPlugin,
  NodeType,
  resolveUploadMetadata,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadEngine } from "@uploadista/core/upload";
import { Effect } from "effect";
import { waitForUrlAvailability } from "./wait-for-url";

/**
 * Creates a remove-background node that removes backgrounds from images using AI.
 *
 * @param id - Unique node identifier
 * @param options - Optional configuration
 * @param options.credentialId - Optional credential ID for AI service
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `nobg`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "photo.jpg" -> "photo-nobg.jpg"
 * const node = yield* createRemoveBackgroundNode("remove-bg-1", {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createRemoveBackgroundNode(
  id: string,
  {
    credentialId,
    keepOutput,
    naming,
  }: {
    credentialId?: string;
    keepOutput?: boolean;
    naming?: FileNamingConfig;
  } = {},
) {
  return Effect.gen(function* () {
    const imageAiService = yield* ImageAiPlugin;
    const uploadEngine = yield* UploadEngine;

    return yield* createFlowNode({
      id,
      name: "Remove Background",
      description: "Removes the background from an image",
      type: NodeType.process,
      nodeTypeId: "remove-background",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      // AI service - enable circuit breaker with skip fallback
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        resetTimeout: 60000,
        fallback: { type: "skip", passThrough: true },
      },
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

          // Apply file naming if configured
          let outputFileName = fileName;
          if (naming) {
            const namingConfig: FileNamingConfig = {
              ...naming,
              autoSuffix: naming.autoSuffix ?? (() => "nobg"),
            };
            const namingContext = buildNamingContext(file, {
              flowId,
              jobId,
              nodeId: id,
              nodeType: "remove-background",
            });
            outputFileName = applyFileNaming(file, namingContext, namingConfig);
          }

          yield* Effect.logInfo(`Uploading processed file to storage`);

          // Upload the transformed bytes back to the upload server with error handling
          const result = yield* uploadEngine
            .uploadFromUrl(
              {
                storageId,
                size: 0,
                type,
                fileName: outputFileName,
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

          // Update metadata with new filename if naming was applied
          const updatedMetadata = metadata
            ? {
                ...metadata,
                ...(outputFileName !== fileName && {
                  fileName: outputFileName,
                  originalName: outputFileName,
                  name: outputFileName,
                  extension:
                    outputFileName.split(".").pop() || metadata.extension,
                }),
              }
            : result.metadata;

          return completeNodeExecution(
            updatedMetadata
              ? {
                  ...result,
                  metadata: updatedMetadata,
                }
              : result,
          );
        });
      },
    });
  });
}
