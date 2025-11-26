import {
  applyFileNaming,
  buildNamingContext,
  createTransformNode,
  type ExtractFrameVideoParams,
  type FileNamingConfig,
  getBaseName,
  STORAGE_OUTPUT_TYPE_ID,
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
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `thumb`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "video.mp4" -> "video-thumb.jpg"
 * const node = yield* createVideoThumbnailNode("thumbnail-1", {
 *   timestamp: 15,
 *   format: "jpeg",
 *   quality: 85
 * }, {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createVideoThumbnailNode(
  id: string,
  params: ExtractFrameVideoParams,
  options?: { keepOutput?: boolean; naming?: FileNamingConfig },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    const format = params.format || "jpeg";

    return yield* createTransformNode({
      id,
      name: "Generate Thumbnail",
      description: "Extracts a frame from video as an image",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      // Note: naming is handled in transform since format changes extension
      nodeType: "thumbnail",
      namingVars: { format },
      transform: (inputBytes, file) =>
        Effect.map(
          videoService.extractFrame(inputBytes, params),
          (imageBytes) => {
            // Map output to image MIME type and extension
            const mimeType = format === "png" ? "image/png" : "image/jpeg";
            const extension = format === "png" ? "png" : "jpg";

            // Get original fileName
            const fileName = file.metadata?.fileName;
            let newFileName: string | undefined;

            if (fileName && typeof fileName === "string") {
              // Apply naming if configured
              if (options?.naming) {
                const namingConfig: FileNamingConfig = {
                  ...options.naming,
                  autoSuffix: options.naming.autoSuffix ?? (() => "thumb"),
                };
                const namingContext = buildNamingContext(
                  file,
                  {
                    flowId: file.flow?.flowId ?? "",
                    jobId: file.flow?.jobId ?? "",
                    nodeId: id,
                    nodeType: "thumbnail",
                  },
                  { format },
                );
                // Apply naming to get base name with suffix
                const namedFile = applyFileNaming(file, namingContext, namingConfig);
                // Replace extension with image extension
                newFileName = `${getBaseName(namedFile)}.${extension}`;
              } else {
                // No naming config, just update extension
                newFileName = fileName.replace(/\.[^.]+$/, `.${extension}`);
              }
            }

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
