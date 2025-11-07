import { UploadistaError } from "@uploadista/core/errors";
import {
  createTransformNode,
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
 * @returns Effect that resolves to the configured node
 *
 * @example
 * ```typescript
 * const node = yield* createTrimNode("trim-1", {
 *   startTime: 10,
 *   endTime: 30
 * });
 *
 * // Or using duration
 * const node2 = yield* createTrimNode("trim-2", {
 *   startTime: 10,
 *   duration: 20
 * });
 * ```
 */
export function createTrimVideoNode(id: string, params: TrimVideoParams) {
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

    return yield* createTransformNode({
      id,
      name: "Trim Video",
      description: "Extracts a segment from the video",
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
