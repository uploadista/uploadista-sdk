import {
  applyFileNaming,
  buildNamingContext,
  createTransformNode,
  type FileNamingConfig,
  getBaseName,
  STORAGE_OUTPUT_TYPE_ID,
  type TranscodeVideoParams,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

// Map video format to MIME type
const formatToMimeType: Record<TranscodeVideoParams["format"], string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
};

// Map video format to file extension
const formatToExtension: Record<TranscodeVideoParams["format"], string> = {
  mp4: "mp4",
  webm: "webm",
  mov: "mov",
  avi: "avi",
};

/**
 * Creates a Transcode video processing node
 *
 * Converts video to specified format and codec, optionally adjusting bitrates.
 *
 * @param id - Unique node identifier
 * @param params - Transcode parameters
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${format}`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "video.mov" -> "video-webm.webm"
 * const node = yield* createTranscodeVideoNode("transcode-1", {
 *   format: "webm",
 *   codec: "vp9",
 *   videoBitrate: "1000k"
 * }, {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createTranscodeVideoNode(
  id: string,
  params: TranscodeVideoParams,
  options?: { keepOutput?: boolean; naming?: FileNamingConfig },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    return yield* createTransformNode({
      id,
      name: "Transcode",
      description: "Converts video to specified format and codec",
      nodeTypeId: "transcode-video",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      // Note: naming is handled in transform since format changes extension
      nodeType: "transcode",
      namingVars: { format: params.format },
      transform: (inputBytes, file) =>
        Effect.map(
          videoService.transcode(inputBytes, params),
          (transcodedBytes) => {
            // Update metadata if format changes
            const newType = formatToMimeType[params.format];
            const newExtension = formatToExtension[params.format];

            // Get original fileName
            const fileName = file.metadata?.fileName;
            let newFileName: string | undefined;

            if (fileName && typeof fileName === "string") {
              // Apply naming if configured
              if (options?.naming) {
                const namingConfig: FileNamingConfig = {
                  ...options.naming,
                  autoSuffix:
                    options.naming.autoSuffix ?? ((ctx) => ctx.format ?? params.format),
                };
                const namingContext = buildNamingContext(
                  file,
                  {
                    flowId: file.flow?.flowId ?? "",
                    jobId: file.flow?.jobId ?? "",
                    nodeId: id,
                    nodeType: "transcode",
                  },
                  { format: params.format },
                );
                // Apply naming to get base name with suffix
                const namedFile = applyFileNaming(file, namingContext, namingConfig);
                // Replace extension with new format extension
                newFileName = `${getBaseName(namedFile)}.${newExtension}`;
              } else {
                // No naming config, just update extension
                newFileName = fileName.replace(/\.[^.]+$/, `.${newExtension}`);
              }
            }

            return {
              bytes: transcodedBytes,
              type: newType,
              fileName: newFileName,
            };
          },
        ),
    });
  });
}
