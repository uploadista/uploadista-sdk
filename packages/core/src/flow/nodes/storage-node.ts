import { Effect } from "effect";
import { z } from "zod";
import { UploadistaError } from "../../errors";
import { type UploadFile, uploadFileSchema } from "../../types";
import { UploadServer } from "../../upload";
import { createFlowNode, NodeType } from "../node";
import { STORAGE_OUTPUT_TYPE_ID } from "../node-types";
import { completeNodeExecution } from "../types";
import { resolveUploadMetadata } from "../utils/resolve-upload-metadata";

/**
 * Schema for storage node parameters.
 * Currently empty but can be extended for storage-specific configuration.
 */
export const storageParamsSchema = z.object({});

/**
 * Parameters for the storage node.
 * Currently no parameters are required, but the schema is available for future extensions.
 */
export type StorageParams = z.infer<typeof storageParamsSchema>;

/**
 * Creates a storage node for storing files in the specified storage.
 *
 * The storage node handles the process of:
 * 1. Reading the input file from the upload server
 * 2. Checking if the file is already in the target storage
 * 3. If not, transferring the file to the target storage
 * 4. Applying optional post-processing
 * 5. Returning the final stored file
 *
 * @param id - Unique identifier for the node
 * @param postProcessFile - Optional function to process the file after storage
 * @returns An Effect that creates a flow node configured for file storage
 *
 * @example
 * ```typescript
 * // Create basic storage node
 * const storageNode = yield* createStorageNode("store-file");
 *
 * // Create storage node with post-processing
 * const storageWithProcessing = yield* createStorageNode("store-and-process", (file) => {
 *   return Effect.succeed({
 *     ...file,
 *     metadata: { ...file.metadata, processed: true }
 *   });
 * });
 * ```
 */
export function createStorageNode(
  id: string,
  postProcessFile: (file: UploadFile) => Effect.Effect<UploadFile> = (file) =>
    Effect.succeed(file),
) {
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;
    return yield* createFlowNode({
      id,
      name: "Storage",
      description: "Stores a file in the storage",
      type: NodeType.output,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      nodeTypeId: STORAGE_OUTPUT_TYPE_ID,
      run: ({ data: file, storageId, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const { type, fileName, metadata, metadataJson } =
            resolveUploadMetadata(file.metadata);
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };
          const normalizedFile = metadata ? { ...file, metadata } : file;

          const upload = yield* uploadServer.getUpload(file.id);
          if (!upload.id) {
            return yield* Effect.fail(
              UploadistaError.fromCode(
                "FILE_READ_ERROR",
                new Error("Upload Key is undefined"),
              ),
            );
          }
          // If the upload is already in the correct storage, return the file, just update the flow
          if (upload.storage.id === storageId) {
            return completeNodeExecution(
              yield* postProcessFile({ ...normalizedFile, flow }),
            );
          }

          const inputBytes = yield* uploadServer.read(file.id, clientId);
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(inputBytes);
              controller.close();
            },
          });

          const uploadResult = yield* uploadServer.upload(
            {
              storageId,
              size: inputBytes.byteLength,
              type,
              fileName,
              lastModified: 0,
              metadata: metadataJson,
              flow,
            },
            clientId,
            stream,
          );

          const resolvedUploadResult = resolveUploadMetadata(
            uploadResult.metadata,
          );

          const postProcessed = yield* postProcessFile(
            resolvedUploadResult.metadata
              ? { ...uploadResult, metadata: resolvedUploadResult.metadata }
              : uploadResult,
          );

          return completeNodeExecution(postProcessed);
        });
      },
    });
  });
}
