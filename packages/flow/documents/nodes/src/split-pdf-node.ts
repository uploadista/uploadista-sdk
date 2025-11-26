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

export type SplitPdfNodeParams = {
  mode: "range" | "individual";
  startPage?: number;
  endPage?: number;
  keepOutput?: boolean;
  /**
   * Optional file naming configuration.
   * Auto suffix: `page-${pageNumber}` for individual mode, `pages-${start}-${end}` for range mode
   */
  naming?: FileNamingConfig;
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

            // Generate output filename
            let outputFileName = `${getBaseName(metadata?.fileName as string || "document")}-page-1.pdf`;
            if (params.naming) {
              const namingConfig: FileNamingConfig = {
                ...params.naming,
                autoSuffix: params.naming.autoSuffix ?? ((ctx) => `page-${ctx.pageNumber ?? 1}`),
              };
              const namingContext = buildNamingContext(
                file,
                { flowId, jobId, nodeId: id, nodeType: "split-pdf" },
                { pageNumber: 1 },
              );
              const namedFile = applyFileNaming(file, namingContext, namingConfig);
              outputFileName = `${getBaseName(namedFile)}.pdf`;
            }

            // Upload the split PDF back to the upload server
            const uploadResult = yield* uploadServer.upload(
              {
                storageId: file.storage.id,
                size: pdfBytes.byteLength,
                type: "application/pdf",
                fileName: outputFileName,
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

          // Generate output filename for range mode
          let rangeOutputFileName = `${getBaseName(metadata?.fileName as string || "document")}-pages-${params.startPage}-${params.endPage}.pdf`;
          if (params.naming) {
            const namingConfig: FileNamingConfig = {
              ...params.naming,
              autoSuffix: params.naming.autoSuffix ?? ((ctx) => `pages-${params.startPage}-${params.endPage}`),
            };
            const namingContext = buildNamingContext(
              file,
              { flowId, jobId, nodeId: id, nodeType: "split-pdf" },
              { startPage: params.startPage, endPage: params.endPage },
            );
            const namedFile = applyFileNaming(file, namingContext, namingConfig);
            rangeOutputFileName = `${getBaseName(namedFile)}.pdf`;
          }

          // Upload the split PDF back to the upload server
          const uploadResult = yield* uploadServer.upload(
            {
              storageId: file.storage.id,
              size: pdfBytes.byteLength,
              type: "application/pdf",
              fileName: rangeOutputFileName,
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
