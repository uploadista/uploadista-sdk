import {
  createTransformNode,
  ImagePlugin,
  type OptimizeParams,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Map image format to MIME type
const formatToMimeType: Record<OptimizeParams["format"], string> = {
  jpeg: "image/jpeg",
  webp: "image/webp",
  png: "image/png",
  avif: "image/avif",
};

// Map image format to file extension
const formatToExtension: Record<OptimizeParams["format"], string> = {
  jpeg: "jpg",
  webp: "webp",
  png: "png",
  avif: "avif",
};

export function createOptimizeNode(
  id: string,
  { quality, format }: OptimizeParams,
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    return yield* createTransformNode({
      id,
      name: "Optimize",
      description: "Optimizes an image for web delivery",
      transform: (inputBytes, file) =>
        Effect.map(
          imageService.optimize(inputBytes, { quality, format }),
          (optimizedBytes) => {
            // Return bytes with updated metadata if format changes
            const newType = formatToMimeType[format];
            const newExtension = formatToExtension[format];

            // Update file extension if format changed
            const fileName = file.metadata?.fileName;
            const newFileName =
              fileName && typeof fileName === "string"
                ? fileName.replace(/\.[^.]+$/, `.${newExtension}`)
                : undefined;

            return {
              bytes: optimizedBytes,
              type: newType,
              fileName: newFileName,
            } as
              | Uint8Array
              | { bytes: Uint8Array; type: string; fileName?: string };
          },
        ),
    });
  });
}
