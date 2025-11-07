import {
  createTransformNode,
  type ExtractFrameVideoParams,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a Thumbnail generation node
 *
 * Extracts a single frame from the video as an image (JPEG or PNG).
 *
 * @param id - Unique node identifier
 * @param params - Frame extraction parameters
 * @returns Effect that resolves to the configured node
 *
 * @example
 * ```typescript
 * const node = yield* createThumbnailNode("thumbnail-1", {
 *   timestamp: 15,
 *   format: "jpeg",
 *   quality: 85
 * });
 * ```
 */
export function createVideoThumbnailNode(
  id: string,
  params: ExtractFrameVideoParams,
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    const format = params.format || "jpeg";

    return yield* createTransformNode({
      id,
      name: "Generate Thumbnail",
      description: "Extracts a frame from video as an image",
      transform: (inputBytes, file) =>
        Effect.map(
          videoService.extractFrame(inputBytes, params),
          (imageBytes) => {
            // Map output to image MIME type and extension
            const mimeType = format === "png" ? "image/png" : "image/jpeg";
            const extension = format === "png" ? "png" : "jpg";

            // Update file extension
            const fileName = file.metadata?.fileName;
            const newFileName =
              fileName && typeof fileName === "string"
                ? fileName.replace(/\.[^.]+$/, `.${extension}`)
                : undefined;

            return {
              bytes: imageBytes,
              type: mimeType,
              fileName: newFileName,
            };
          },
        ),
    });
  });
}
