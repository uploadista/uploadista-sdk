import {
  createTransformNode,
  type FileNamingConfig,
  type ResizeVideoParams,
  STORAGE_OUTPUT_TYPE_ID,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a Resize video processing node
 *
 * Changes video resolution while optionally maintaining aspect ratio.
 *
 * @param id - Unique node identifier
 * @param params - Resize parameters
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${width}x${height}`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "video.mp4" -> "video-1280x720.mp4"
 * const node = yield* createVideoResizeNode("resize-1", {
 *   width: 1280,
 *   height: 720,
 *   aspectRatio: "keep",
 *   scaling: "bicubic"
 * }, {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createVideoResizeNode(
  id: string,
  params: ResizeVideoParams,
  options?: { keepOutput?: boolean; naming?: FileNamingConfig },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    // Build naming config with auto suffix for video resize
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          autoSuffix:
            options.naming.autoSuffix ??
            ((ctx) => `${ctx.width ?? params.width}x${ctx.height ?? params.height}`),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Resize Video",
      description: "Changes video resolution",
      nodeTypeId: "resize-video",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "resize-video",
      namingVars: { width: params.width, height: params.height },
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
