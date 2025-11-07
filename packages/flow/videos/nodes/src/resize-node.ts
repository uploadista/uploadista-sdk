import {
  createTransformNode,
  VideoPlugin,
  type VideoResizeParams,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a Resize video processing node
 *
 * Changes video resolution while optionally maintaining aspect ratio.
 *
 * @param id - Unique node identifier
 * @param params - Resize parameters
 * @returns Effect that resolves to the configured node
 *
 * @example
 * ```typescript
 * const node = yield* createResizeNode("resize-1", {
 *   width: 1280,
 *   height: 720,
 *   aspectRatio: "keep",
 *   scaling: "bicubic"
 * });
 * ```
 */
export function createResizeNode(id: string, params: VideoResizeParams) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    return yield* createTransformNode({
      id,
      name: "Resize Video",
      description: "Changes video resolution",
      transform: (inputBytes, _file) =>
        Effect.map(videoService.resize(inputBytes, params), (resizedBytes) => {
          // Pass through video bytes (no metadata changes needed)
          return {
            bytes: resizedBytes,
          };
        }),
    });
  });
}
