import { UploadistaError } from "@uploadista/core/errors";
import {
  completeNodeExecution,
  createFlowNode,
  DocumentPlugin,
  NodeType,
  resolveUploadMetadata,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { uploadFileSchema } from "@uploadista/core/types";
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";

export type SplitPdfNodeParams = {
  mode: "range" | "individual";
  startPage?: number;
  endPage?: number;
  keepOutput?: boolean;
};

export function createSplitPdfNode(id: string, params: SplitPdfNodeParams) {
  return Effect.gen(function* () {
    const documentService = yield* DocumentPlugin;
    const uploadServer = yield* UploadServer;

    return yield* createFlowNode({
      id,
      name: "Split PDF",
      description: "Split PDF into pages or page ranges",
      type: NodeType.process,
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: params.keepOutput,
      inputSchema: uploadFileSchema,
      outputSchema: uploadFileSchema,
      run: ({ data: file, flowId, jobId, clientId }) => {
        return Effect.gen(function* () {
          const flow = {
            flowId,
            nodeId: id,
            jobId,
          };

          yield* Effect.logInfo(
            `Splitting PDF file ${file.id} in ${params.mode} mode`,
          );

          // Read file bytes from upload server
          const fileBytes = yield* uploadServer.read(file.id, clientId);

          // Split PDF with error handling
          const result = yield* documentService
            .splitPdf(fileBytes, params)
            .pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logError("Failed to split PDF", error);
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause:
                      error instanceof Error
                        ? error.message
                        : "Failed to split PDF",
                  }).toEffect();
                }),
              ),
            );

          const { metadata } = resolveUploadMetadata(file.metadata);

          if (result.mode === "individual") {
            // Return array of files (one per page)
            yield* Effect.logInfo(
              `Successfully split PDF into ${result.pdfs.length} individual pages`,
            );

            // For individual mode, we'd need to return multiple files
            // This requires special handling in the flow engine
            // For now, we'll return the first page and log a warning
            yield* Effect.logWarning(
              "Individual page mode returns multiple files - flow engine support required",
            );

            const pdfBytes = result.pdfs[0];

            // Create a stream from the PDF bytes
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(pdfBytes);
                controller.close();
              },
            });

            // Upload the split PDF back to the upload server
            const uploadResult = yield* uploadServer.upload(
              {
                storageId: file.storage.id,
                size: pdfBytes.byteLength,
                type: "application/pdf",
                fileName: `${metadata?.fileName || "document"}-page-1.pdf`,
                lastModified: 0,
                metadata: JSON.stringify({
                  ...metadata,
                  pageCount: 1,
                  splitMode: "individual",
                }),
                flow,
              },
              clientId,
              stream,
            );

            const newMetadata = {
              ...metadata,
              pageCount: 1,
              splitMode: "individual",
            };

            return completeNodeExecution({
              ...uploadResult,
              metadata: newMetadata,
            });
          }

          // Range mode - return single PDF with selected pages
          const pageCount =
            params.endPage && params.startPage
              ? params.endPage - params.startPage + 1
              : 1;

          const pdfBytes = result.pdf;

          // Create a stream from the PDF bytes
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(pdfBytes);
              controller.close();
            },
          });

          // Upload the split PDF back to the upload server
          const uploadResult = yield* uploadServer.upload(
            {
              storageId: file.storage.id,
              size: pdfBytes.byteLength,
              type: "application/pdf",
              fileName: `${metadata?.fileName || "document"}-pages-${params.startPage}-${params.endPage}.pdf`,
              lastModified: 0,
              metadata: JSON.stringify({
                ...metadata,
                pageCount,
                splitMode: "range",
                splitRange: `${params.startPage}-${params.endPage}`,
              }),
              flow,
            },
            clientId,
            stream,
          );

          const newMetadata = {
            ...metadata,
            pageCount,
            splitMode: "range",
            splitRange: `${params.startPage}-${params.endPage}`,
          };

          yield* Effect.logInfo(
            `Successfully split PDF to pages ${params.startPage}-${params.endPage}`,
          );

          return completeNodeExecution({
            ...uploadResult,
            metadata: newMetadata,
          });
        });
      },
    });
  });
}
