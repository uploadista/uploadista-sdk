import { Effect } from "effect";
import { z } from "zod";
import { UploadistaError } from "../../errors";
import type { InputFile } from "../../types";
import { uploadFileSchema } from "../../types";
import { UploadServer } from "../../upload";
import { arrayBuffer, fetchFile } from "../../upload/upload-url";
import { createFlowNode, NodeType } from "../node";
import { completeNodeExecution, waitingNodeExecution } from "../types";
import { resolveUploadMetadata } from "../utils/resolve-upload-metadata";

// Input schemas for different operations
const initStreamingInputSchema = z.object({
  operation: z.literal("init"),
  storageId: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const finalizeStreamingInputSchema = z.object({
  operation: z.literal("finalize"),
  uploadId: z.string(),
});

const urlInputSchema = z.object({
  operation: z.literal("url"),
  url: z.string(),
  storageId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const inputDataSchema = z.union([
  initStreamingInputSchema,
  finalizeStreamingInputSchema,
  urlInputSchema,
]);

export type InputData = z.infer<typeof inputDataSchema>;

// Input node parameters for filtering
export const inputNodeParamsSchema = z.object({
  allowedMimeTypes: z.array(z.string()).optional(),
  minSize: z.number().positive().optional(),
  maxSize: z.number().positive().optional(),
});

export type InputNodeParams = z.infer<typeof inputNodeParamsSchema>;

// Helper function to validate file against params
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
            `File type "${file.type}" is not allowed. Allowed types: ${params.allowedMimeTypes.join(", ")}`,
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

export function createInputNode(id: string, params?: InputNodeParams) {
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
