import { UploadistaError } from "@uploadista/core/errors";
import {
  applyFileNaming,
  buildNamingContext,
  completeNodeExecution,
  createFlowNode,
  DocumentPlugin,
  type FileNamingConfig,
  getBaseName,
  NodeType,
  resolveUploadMetadata,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";
import { z } from "zod";

export type MergePdfNodeParams = {
  inputCount?: number;
  keepOutput?: boolean;
  /**
   * Optional file naming configuration.
   * Auto suffix: `merged`
   */
  naming?: FileNamingConfig;
};

// Schema for multiple file inputs
const multipleFilesSchema = z.array(uploadFileSchema);

export function createMergePdfNode(
  id: string,
  params: MergePdfNodeParams = {},
) {
  return Effect.gen(function* () {
    const documentService = yield* DocumentPlugin;
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name: "Merge PDFs",
      description: "Merge multiple PDF documents into one",
      type: NodeType.process,
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: params.keepOutput,
      inputSchema: multipleFilesSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: files, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };

          // Validate that we have an array of files
          if (!Array.isArray(files)) {
            return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
              cause:
                "Merge PDF node requires an array of files from a Merge utility node",
            }).toEffect();
          }

          if (files.length === 0) {
            return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
              cause: "At least one PDF file is required for merging",
            }).toEffect();
          }

          // Read buffers from all files
          const pdfBuffers: Uint8Array[] = [];
          let totalPages = 0;

          for (const file of files) {
            // Read file bytes from upload server
            const fileBytes = yield* uploadServer.read(file.id, clientId);
            pdfBuffers.push(fileBytes);

            // Sum up page counts if available
            const fileMetadata = resolveUploadMetadata(file.metadata).metadata;
            if (
              fileMetadata?.pageCount &&
              typeof fileMetadata.pageCount === "number"
            ) {
              totalPages += fileMetadata.pageCount;
            }
          }

          yield* Effect.logInfo(`Merging ${files.length} PDF files`);

          // Merge PDFs with error handling
          const mergedPdf = yield* documentService
            .mergePdfs({ pdfs: pdfBuffers })
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to merge PDFs", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to merge PDFs",
                  }).toEffect();
                }),
              ),
            );

          // Use metadata from first file as base
          const firstFile = files[0];
          const { metadata } = resolveUploadMetadata(firstFile.metadata);

          // Create a stream from the merged PDF bytes
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(mergedPdf);
              controller.close();
            },
          });

          // Generate output filename
          let outputFileName = `merged-${files.length}-documents.pdf`;
          if (params.naming) {
            const namingConfig: FileNamingConfig = {
              ...params.naming,
              autoSuffix: params.naming.autoSuffix ?? (() => "merged"),
            };
            const namingContext = buildNamingContext(
              firstFile,
              { flowId, jobId, nodeId: id, nodeType: "merge-pdf" },
              { mergedCount: files.length },
            );
            const namedFile = applyFileNaming(firstFile, namingContext, namingConfig);
            outputFileName = `${getBaseName(namedFile)}.pdf`;
          }

          // Upload the merged PDF back to the upload server
          const result = yield* uploadServer.upload(
            {
              storageId: firstFile.storage.id,
              size: mergedPdf.byteLength,
              type: "application/pdf",
              fileName: outputFileName,
              lastModified: 0,
              metadata: JSON.stringify({
                ...metadata,
                pageCount: totalPages,
                mergedFrom: files.length,
              }),
              flow,
            },
            clientId,
            stream,
          );

          const newMetadata = {
            ...metadata,
            pageCount: totalPages,
            mergedFrom: files.length,
            fileName: outputFileName,
          };

          yield* Effect.logInfo(
            `Successfully merged ${files.length} PDFs into one document with ${totalPages} pages`,
          );

          return completeNodeExecution({
            ...result,
            metadata: newMetadata,
          });
        });
      },
    });
  });
}
