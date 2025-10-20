import { Effect } from "effect";
import { z } from "zod";
import { UploadistaError } from "../../errors";
import { type UploadFile, uploadFileSchema } from "../../types";
import { UploadServer } from "../../upload";
import { createFlowNode, NodeType } from "../node";
import { completeNodeExecution } from "../types";
import { resolveUploadMetadata } from "../utils/resolve-upload-metadata";

export const storageParamsSchema = z.object({});

export type StorageParams = z.infer<typeof storageParamsSchema>;

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
