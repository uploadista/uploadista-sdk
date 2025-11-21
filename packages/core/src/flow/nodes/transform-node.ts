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
  /** Optional node type ID for result type registration */
  nodeTypeId?: string;
  /**
   * Whether to keep this node's output as a flow result even if it has outgoing edges.
   * When true, the node's output will be included in the final flow outputs alongside topology sinks.
   * Defaults to false.
   */
  keepOutput?: boolean;
  /** Function that transforms file bytes */
  transform: (
    bytes: Uint8Array,
    file: UploadFile,
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
 * // Create a transform node with keepOutput enabled
 * const processedNode = yield* createTransformNode({
 *   id: "process-image",
 *   name: "Process Image",
 *   description: "Processes images and preserves output",
 *   keepOutput: true, // Output will be included in flow results
 *   transform: (bytes, file) => {
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
  nodeTypeId,
  keepOutput,
  transform,
}: TransformNodeConfig) {
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode<UploadFile, UploadFile>({
      id,
      name,
      description,
      type: NodeType.process,
      nodeTypeId,
      keepOutput,
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
            stream,
          );

          // Merge updated metadata with result
          const updatedMetadata = metadata
            ? {
                ...metadata,
                // Update mimeType and related fields if type changed
                ...(outputType && {
                  mimeType: outputType,
                  type: outputType,
                  "content-type": outputType,
                }),
                // Update fileName and related fields if fileName changed
                ...(outputFileName && {
                  fileName: outputFileName,
                  originalName: outputFileName,
                  name: outputFileName,
                  // Update extension based on new fileName
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
