import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  NodeType,
  resolveUploadMetadata,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { type UploadFile, uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";
import type { MultiplexParams } from "@/types/multiplex-node";

export function createMultiplexNode(
  id: string,
  { outputCount: _outputCount, strategy }: MultiplexParams,
) {
  return Effect.gen(function* () {
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode<UploadFile, UploadFile>({
      id,
      name: "Multiplex",
      description: `Multiplexes input using ${strategy} strategy`,
      type: NodeType.multiplex,
      nodeTypeId: "multiplex",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      multiOutput: true,
      run: ({ data: file, storageId, clientId }) => {
        return Effect.gen(function* () {
          const { type, fileName, metadata, metadataJson } =
            resolveUploadMetadata(file.metadata);
          const normalizedFile = metadata ? { ...file, metadata } : file;

          if (strategy === "copy") {
            // For copy strategy, read and re-upload the file
            const inputBytes = yield* uploadServer.read(
              normalizedFile.id,
              clientId,
            );

            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(inputBytes);
                controller.close();
              },
            });

            const result = yield* uploadServer.upload(
              {
                storageId,
                size: inputBytes.byteLength,
                type,
                fileName,
                lastModified: 0,
                metadata: metadataJson,
              },
              clientId,
              stream,
            );

            const resolvedResult = resolveUploadMetadata(result.metadata);

            return completeNodeExecution(
              resolvedResult.metadata
                ? { ...result, metadata: resolvedResult.metadata }
                : result,
            );
          } else if (strategy === "split") {
            // Split strategy is not supported in the new pattern
            // as it would require returning multiple UploadFiles
            return yield* Effect.fail(
              UploadistaError.fromCode("VALIDATION_ERROR", {
                body: "Split strategy is not supported with UploadFile pattern",
              }),
            );
          }

          return yield* Effect.fail(
            UploadistaError.fromCode("VALIDATION_ERROR", {
              body: `Unknown multiplex strategy: ${strategy}`,
            }),
          );
        });
      },
    });
  });
}
