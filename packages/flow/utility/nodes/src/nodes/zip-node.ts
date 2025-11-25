import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  NodeType,
  STORAGE_OUTPUT_TYPE_ID,
  ZipPlugin,
} from "@uploadista/core/flow";
import { type UploadFile, uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";
import { z } from "zod";
import type { ZipParams } from "@/types/zip-node";

const inputSchema = z.record(z.string(), uploadFileSchema);
const outputSchema = uploadFileSchema;

export function createZipNode(
  id: string,
  { zipName, includeMetadata }: ZipParams,
) {
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;
    const zipPlugin = yield* ZipPlugin;
    return yield* createFlowNode<Record<string, UploadFile>, UploadFile>({
      id,
      name: "Zip Files",
      description: "Combines multiple files into a zip archive",
      type: NodeType.process,
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      inputSchema,
      outputSchema,
      multiInput: true,
      run: ({ data: inputs, storageId, clientId }) => {
        return Effect.gen(function* () {
          if (!inputs || Object.keys(inputs).length === 0) {
            return yield* Effect.fail(
              UploadistaError.fromCode("VALIDATION_ERROR", {
                body: "No inputs provided to zip node",
              }),
            );
          }

          const zipInputs = yield* Effect.forEach(
            Object.values(inputs),
            (input) =>
              Effect.gen(function* () {
                const data = yield* uploadServer.read(input.id, clientId);
                return {
                  id: input.id,
                  data,
                  metadata: input.metadata,
                };
              }),
            { concurrency: "unbounded" },
          );

          const zipBytes = yield* zipPlugin.zip(zipInputs, {
            zipName,
            includeMetadata,
          });

          // Create a stream from the zip bytes
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(zipBytes);
              controller.close();
            },
          });

          // Upload the zip file
          const result = yield* uploadServer.upload(
            {
              storageId,
              size: zipBytes.byteLength,
              type: "application/zip",
              fileName: zipName,
              lastModified: 0,
              metadata: JSON.stringify({
                mimeType: "application/zip",
                type: "application/zip",
                originalName: zipName,
                fileName: zipName,
                extension: "zip",
              }),
            },
            clientId,
            stream,
          );

          return completeNodeExecution(result);
        });
      },
    });
  });
}
