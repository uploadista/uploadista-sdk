import { UploadistaError } from "@uploadista/core/errors";
import {
  createTransformNode,
  type FileNamingConfig,
  STORAGE_OUTPUT_TYPE_ID,
  type TrimVideoParams,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a Trim video processing node
 *
 * Extracts a segment from the video by time range.
 *
 * @param id - Unique node identifier
 * @param params - Trim parameters
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `trimmed`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "video.mp4" -> "video-trimmed.mp4"
 * const node = yield* createTrimVideoNode("trim-1", {
 *   startTime: 10,
 *   endTime: 30
 * }, {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createTrimVideoNode(
  id: string,
  params: TrimVideoParams,
  options?: { keepOutput?: boolean; naming?: FileNamingConfig },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    // Validate params
    if (params.endTime !== undefined && params.endTime <= params.startTime) {
      return yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        body: "endTime must be greater than startTime",
        details: { params },
      }).toEffect();
    }

    if (
      params.duration !== undefined &&
      params.endTime !== undefined &&
      params.duration !== params.endTime - params.startTime
    ) {
      return yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        body: "Cannot specify both endTime and duration with conflicting values",
        details: { params },
      }).toEffect();
    }

    if (params.duration !== undefined && params.duration <= 0) {
      return yield* UploadistaError.fromCode("VALIDATION_ERROR", {
        body: "duration must be greater than 0",
        details: { params },
      }).toEffect();
    }

    // Build naming config with auto suffix for trim
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          autoSuffix: options.naming.autoSuffix ?? (() => "trimmed"),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Trim Video",
      description: "Extracts a segment from the video",
      nodeTypeId: "trim-video",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "trim",
      transform: (inputBytes, _file) =>
        Effect.map(videoService.trim(inputBytes, params), (trimmedBytes) => {
          // Pass through video bytes
          return {
            bytes: trimmedBytes,
          };
        }),
    });
  });
}
