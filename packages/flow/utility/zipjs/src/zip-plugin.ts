import { UploadistaError } from "@uploadista/core/errors";
import { ZipPlugin } from "@uploadista/core/flow";
import { withOperationSpan } from "@uploadista/observability";
import { Effect, Layer } from "effect";
import JSZip from "jszip";

export const zipJsPlugin = () => {
  return Layer.succeed(
    ZipPlugin,
    ZipPlugin.of({
      zip: (inputs, options) => {
        return Effect.gen(function* () {
          const { includeMetadata } = options;
          const zip = new JSZip();

          // Process all input files
          for (const input of inputs) {
            // Use metadata for filename if available, otherwise use id
            const fileName =
              input.metadata?.fileName ||
              input.metadata?.originalName ||
              input.id;

            zip.file(fileName.toString(), input.data);

            if (includeMetadata && input.metadata) {
              zip.file(
                `${fileName}.meta.json`,
                JSON.stringify(input.metadata, null, 2),
              );
            }
          }

          // Generate the zip file
          const zipBuffer = yield* Effect.tryPromise({
            try: () =>
              zip.generateAsync({
                type: "nodebuffer",
                compression: "DEFLATE",
                compressionOptions: {
                  level: 6, // Good balance between speed and compression
                },
              }),
            catch: (error) =>
              UploadistaError.fromCode("UNKNOWN_ERROR", {
                body: "Failed to generate zip file",
                cause: error,
              }),
          });

          // Convert to Uint8Array
          const zipBytes = new Uint8Array(
            zipBuffer.buffer,
            zipBuffer.byteOffset,
            zipBuffer.byteLength,
          );

          return zipBytes;
        }).pipe(
          withOperationSpan("zip", "create", {
            "zip.file_count": inputs.length,
            "zip.include_metadata": options.includeMetadata,
          }),
        );
      },
    }),
  );
};
