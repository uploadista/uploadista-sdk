import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  NodeType,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { type UploadFile, uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";
import { z } from "zod";
import type { MergeParams } from "@/types/merge-node";

const inputSchema = z.record(z.string(), uploadFileSchema);
const outputSchema = uploadFileSchema;

export function createMergeNode(
  id: string,
  { strategy, separator: _separator }: MergeParams,
) {
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode<Record<string, UploadFile>, UploadFile>({
      id,
      name: "Merge Files",
      description: `Merges multiple files using ${strategy} strategy`,
      type: NodeType.merge,
      nodeTypeId: "merge",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      inputSchema,
      outputSchema,
      multiInput: true,
      run: ({ data: inputs, storageId, clientId }) => {
        return Effect.gen(function* () {
          if (!inputs || Object.keys(inputs).length === 0) {
            return yield* Effect.fail(
              UploadistaError.fromCode("VALIDATION_ERROR", {
                body: "No inputs provided to merge node",
              }),
            );
          }

          const inputFiles = Object.values(inputs);

          if (inputFiles.length === 0) {
            return yield* Effect.fail(
              UploadistaError.fromCode("VALIDATION_ERROR", {
                body: "No files to merge",
              }),
            );
          }

          switch (strategy) {
            case "concat": {
              // Read bytes from all input files
              const inputBytesArray: Uint8Array[] = [];
              let totalSize = 0;

              for (const file of inputFiles) {
                const bytes = yield* uploadServer.read(file.id, clientId);
                inputBytesArray.push(bytes);
                totalSize += bytes.byteLength;
              }

              // Concatenate all files into one
              const mergedBytes = new Uint8Array(totalSize);
              let offset = 0;
              for (const bytes of inputBytesArray) {
                mergedBytes.set(bytes, offset);
                offset += bytes.byteLength;
              }

              // Create a stream from the merged bytes
              const stream = new ReadableStream({
                start(controller) {
                  controller.enqueue(mergedBytes);
                  controller.close();
                },
              });

              // Upload the merged file
              const result = yield* uploadServer.upload(
                {
                  storageId,
                  size: mergedBytes.byteLength,
                  type: "application/octet-stream",
                  fileName: `merged_${inputFiles.length}_files.bin`,
                  lastModified: 0,
                  metadata: JSON.stringify({
                    mimeType: "application/octet-stream",
                    originalName: `merged_${inputFiles.length}_files`,
                    extension: "bin",
                  }),
                },
                clientId,
                stream,
              );

              return completeNodeExecution(result);
            }
            default: {
              return yield* Effect.fail(
                UploadistaError.fromCode("VALIDATION_ERROR", {
                  body: `Unknown merge strategy: ${strategy}`,
                }),
              );
            }
          }
        });
      },
    });
  });
}
