import {
  createTransformNode,
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
 * @returns Effect that resolves to the configured node
 *
 * @example
 * ```typescript
 * const node = yield* createTranscodeNode("transcode-1", {
 *   format: "webm",
 *   codec: "vp9",
 *   videoBitrate: "1000k"
 * });
 * ```
 */
export function createTranscodeVideoNode(
  id: string,
  params: TranscodeVideoParams,
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    return yield* createTransformNode({
      id,
      name: "Transcode",
      description: "Converts video to specified format and codec",
      transform: (inputBytes, file) =>
        Effect.map(
          videoService.transcode(inputBytes, params),
          (transcodedBytes) => {
            // Update metadata if format changes
            const newType = formatToMimeType[params.format];
            const newExtension = formatToExtension[params.format];

            // Update file extension
            const fileName = file.metadata?.fileName;
            const newFileName =
              fileName && typeof fileName === "string"
                ? fileName.replace(/\.[^.]+$/, `.${newExtension}`)
                : undefined;

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
