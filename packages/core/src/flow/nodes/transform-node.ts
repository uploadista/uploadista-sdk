import { Effect } from "effect";
import type { UploadistaError } from "../../errors";
import type { UploadFile } from "../../types";
import { uploadFileSchema } from "../../types";
import { UploadServer } from "../../upload";
import { createFlowNode, NodeType } from "../node";
import { completeNodeExecution } from "../types";
import { resolveUploadMetadata } from "../utils/resolve-upload-metadata";

/**
 * Configuration object for creating a transform node.
 */
export interface TransformNodeConfig {
  /** Unique identifier for the node */
  id: string;
  /** Human-readable name for the node */
  name: string;
  /** Description of what the node does */
  description: string;
  /** Function that transforms file bytes */
  transform: (
    bytes: Uint8Array,
    file: UploadFile
  ) => Effect.Effect<
    Uint8Array | { bytes: Uint8Array; type?: string; fileName?: string },
    UploadistaError
  >;
}

/**
 * Creates a transform node that handles the common pattern of:
 * 1. Reading bytes from an UploadFile
 * 2. Transforming the bytes
 * 3. Uploading the result as a new UploadFile
 *
 * This simplifies nodes that just need to transform file bytes without
 * worrying about upload server interactions.
 *
 * @param config - Configuration object for the transform node
 * @returns An Effect that creates a flow node configured for file transformation
 *
 * @example
 * ```typescript
 * // Create an image resize transform node
 * const resizeNode = yield* createTransformNode({
 *   id: "resize-image",
 *   name: "Resize Image",
 *   description: "Resizes images to specified dimensions",
 *   transform: (bytes, file) => {
 *     // Your transformation logic here
 *     return Effect.succeed(transformedBytes);
 *   }
 * });
 *
 * // Create a transform node that changes file metadata
 * const metadataTransformNode = yield* createTransformNode({
 *   id: "add-metadata",
 *   name: "Add Metadata",
 *   description: "Adds custom metadata to files",
 *   transform: (bytes, file) => {
 *     return Effect.succeed({
 *       bytes,
 *       type: "application/custom",
 *       fileName: `processed-${file.fileName}`
 *     });
 *   }
 * });
 * ```
 */
export function createTransformNode({
  id,
  name,
  description,
  transform,
}: TransformNodeConfig) {
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name,
      description,
      type: NodeType.process,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: file, storageId, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };
          // Read input bytes from upload server
          const inputBytes = yield* uploadServer.read(file.id, clientId);

          // Transform the bytes using the provided function
          const transformResult = yield* transform(inputBytes, file);

          // Handle both simple Uint8Array and object with metadata
          const outputBytes =
            transformResult instanceof Uint8Array
              ? transformResult
              : transformResult.bytes;

          const outputType =
            transformResult instanceof Uint8Array
              ? undefined
              : transformResult.type;

          const outputFileName =
            transformResult instanceof Uint8Array
              ? undefined
              : transformResult.fileName;

          // Create a stream from the output bytes
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(outputBytes);
              controller.close();
            },
          });

          const { type, fileName, metadata, metadataJson } =
            resolveUploadMetadata(file.metadata);

          // Upload the transformed bytes back to the upload server
          // Use output metadata if provided, otherwise fall back to original
          const result = yield* uploadServer.upload(
            {
              storageId,
              size: outputBytes.byteLength,
              type: outputType ?? type,
              fileName: outputFileName ?? fileName,
              lastModified: 0,
              metadata: metadataJson,
              flow,
            },
            clientId,
            stream
          );

          return completeNodeExecution(
            metadata
              ? {
                  ...result,
                  metadata,
                }
              : result
          );
        });
      },
    });
  });
}
