import { Effect } from "effect";
import { z } from "zod";
import { UploadistaError } from "../../errors";
import type { InputFile } from "../../types";
import { uploadFileSchema } from "../../types";
import { UploadServer } from "../../upload";
import { arrayBuffer, fetchFile } from "../../upload/upload-url";
import { createFlowNode, NodeType } from "../node";
import { STREAMING_INPUT_TYPE_ID } from "../node-types";
import { completeNodeExecution, waitingNodeExecution } from "../types";
import { resolveUploadMetadata } from "../utils/resolve-upload-metadata";

/**
 * Schema for initializing a streaming upload operation.
 * Creates a new upload session for chunked file uploads.
 */
const initStreamingInputSchema = z.object({
  /** Operation type identifier */
  operation: z.literal("init"),
  /** Storage ID where the file will be stored */
  storageId: z.string(),
  /** Optional metadata for the file */
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Schema for finalizing a streaming upload operation.
 * Completes the upload process after all chunks have been uploaded.
 */
const finalizeStreamingInputSchema = z.object({
  /** Operation type identifier */
  operation: z.literal("finalize"),
  /** Upload ID from the init operation */
  uploadId: z.string(),
});

/**
 * Schema for fetching a file from a URL.
 * Downloads and processes a file from a remote URL.
 */
const urlInputSchema = z.object({
  /** Operation type identifier */
  operation: z.literal("url"),
  /** URL to fetch the file from */
  url: z.string(),
  /** Optional storage ID where the file will be stored */
  storageId: z.string().optional(),
  /** Optional metadata for the file */
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * Union schema for all input operations.
 * Defines the possible input data structures for the input node.
 */
export const inputDataSchema = z.union([
  initStreamingInputSchema,
  finalizeStreamingInputSchema,
  urlInputSchema,
]);

/**
 * Type representing the input data for the input node.
 * Can be one of three operation types: init, finalize, or url.
 */
export type InputData = z.infer<typeof inputDataSchema>;

/**
 * Schema for input node filtering parameters.
 * Defines validation rules for incoming files.
 */
export const inputNodeParamsSchema = z.object({
  /** Array of allowed MIME types (supports wildcards like "image/*") */
  allowedMimeTypes: z.array(z.string()).optional(),
  /** Minimum file size in bytes */
  minSize: z.number().positive().optional(),
  /** Maximum file size in bytes */
  maxSize: z.number().positive().optional(),
});

/**
 * Parameters for configuring input node validation.
 * Controls which files are accepted based on type and size constraints.
 */
export type InputNodeParams = z.infer<typeof inputNodeParamsSchema>;

/**
 * Helper function to validate file against input parameters.
 * Performs MIME type and size validation based on the provided parameters.
 *
 * @param file - File information to validate
 * @param params - Validation parameters
 * @returns An Effect that succeeds if validation passes or fails with validation error
 */
function validateFile(
  file: { type: string; size: number },
  params?: InputNodeParams,
): Effect.Effect<void, UploadistaError> {
  return Effect.gen(function* () {
    if (!params) return;

    // Check MIME type
    if (params.allowedMimeTypes && params.allowedMimeTypes.length > 0) {
      const isAllowed = params.allowedMimeTypes.some((allowed) => {
        // Support wildcard patterns like "image/*"
        if (allowed.endsWith("/*")) {
          const prefix = allowed.slice(0, -2);
          return file.type.startsWith(prefix);
        }
        return file.type === allowed;
      });

      if (!isAllowed) {
        throw yield* UploadistaError.fromCode("VALIDATION_ERROR", {
          cause: new Error(
            `File type "${
              file.type
            }" is not allowed. Allowed types: ${params.allowedMimeTypes.join(
              ", ",
            )}`,
          ),
        }).toEffect();
      }
    }

    // Check minimum size
    if (params.minSize !== undefined && file.size < params.minSize) {
      throw yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        cause: new Error(
          `File size (${file.size} bytes) is below minimum (${params.minSize} bytes)`,
        ),
      }).toEffect();
    }

    // Check maximum size
    if (params.maxSize !== undefined && file.size > params.maxSize) {
      throw yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        cause: new Error(
          `File size (${file.size} bytes) exceeds maximum (${params.maxSize} bytes)`,
        ),
      }).toEffect();
    }
  });
}

/**
 * Creates an input node for handling file input through multiple methods.
 *
 * The input node supports three operation types:
 * - `init`: Initialize a streaming upload session
 * - `finalize`: Complete a streaming upload after all chunks are uploaded
 * - `url`: Fetch a file directly from a URL
 *
 * @param id - Unique identifier for the node
 * @param params - Optional validation parameters for filtering incoming files
 * @returns An Effect that creates a flow node configured for file input
 *
 * @example
 * ```typescript
 * // Create input node with validation
 * const inputNode = yield* createInputNode("file-input", {
 *   allowedMimeTypes: ["image/*", "application/pdf"],
 *   maxSize: 10 * 1024 * 1024, // 10MB
 * });
 *
 * // Create input node without validation
 * const openInputNode = yield* createInputNode("open-input");
 * ```
 */
export function createInputNode(
  id: string,
  params?: InputNodeParams,
  options?: { keepOutput?: boolean },
) {
  const keepOutput = options?.keepOutput ?? false;
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;
    return yield* createFlowNode({
      id,
      name: "Input",
      description:
        "Handles file input through multiple methods - streaming upload (init/finalize) or direct URL fetch",
      type: NodeType.input,
      inputSchema: inputDataSchema,
      outputSchema: uploadFileSchema,
      keepOutput,
      nodeTypeId: STREAMING_INPUT_TYPE_ID,
      run: ({ data, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          switch (data.operation) {
            case "init": {
              // Create upload using upload server - it handles all state management
              const inputFile: InputFile = {
                storageId: data.storageId,
                size: data.metadata?.size || 0,
                type: data.metadata?.mimeType || "application/octet-stream",
                fileName: data.metadata?.originalName,
                lastModified: data.metadata?.size ? Date.now() : undefined,
                metadata: data.metadata
                  ? JSON.stringify(data.metadata)
                  : undefined,
                flow: {
                  flowId,
                  nodeId: id,
                  jobId,
                },
              };

              const uploadFile = yield* uploadServer.createUpload(
                inputFile,
                clientId,
              );

              // Return waiting state with the upload file
              // Client will upload chunks directly to the upload API
              return waitingNodeExecution(uploadFile);
            }

            case "finalize": {
              // Get final upload file from upload server's KV store
              const finalUploadFile = yield* uploadServer.getUpload(
                data.uploadId,
              );

              // Extract type and size from metadata for validation
              const { type } = resolveUploadMetadata(finalUploadFile.metadata);
              const size = finalUploadFile.size || 0;

              // Validate file against params
              yield* validateFile({ type, size }, params);

              // Complete the node execution with the final upload file
              // Flow can now continue to next nodes (e.g., save to storage, optimize)
              return completeNodeExecution(finalUploadFile);
            }

            case "url": {
              // Fetch file from URL directly
              const response = yield* fetchFile(data.url);
              const buffer = yield* arrayBuffer(response);

              // Extract metadata from response or use provided metadata
              const mimeType =
                data.metadata?.mimeType ||
                response.headers.get("content-type") ||
                "application/octet-stream";
              const size =
                data.metadata?.size ||
                Number(response.headers.get("content-length") || 0);
              const fileName =
                data.metadata?.originalName ||
                data.url.split("/").pop() ||
                "file";

              // Validate file against params
              yield* validateFile({ type: mimeType, size }, params);

              // Create a readable stream from the buffer
              const stream = new ReadableStream({
                start(controller) {
                  controller.enqueue(new Uint8Array(buffer));
                  controller.close();
                },
              });

              // Use upload server to create and store the file
              const inputFile: InputFile = {
                storageId: data.storageId || "buffer",
                size,
                type: mimeType,
                fileName,
                lastModified: Date.now(),
                metadata: data.metadata
                  ? JSON.stringify(data.metadata)
                  : undefined,
              };

              const uploadFile = yield* uploadServer.upload(
                inputFile,
                clientId,
                stream,
              );

              // Complete the node execution with the upload file
              return completeNodeExecution({
                ...uploadFile,
                flow: {
                  flowId,
                  nodeId: id,
                  jobId,
                },
              });
            }

            default:
              throw yield* UploadistaError.fromCode("VALIDATION_ERROR", {
                cause: new Error("Invalid operation"),
              }).toEffect();
          }
        });
      },
    });
  });
}
