import {
  createTransformNode,
  type FileNamingConfig,
  ImagePlugin,
  type ResizeParams,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a resize node that resizes images to specified dimensions.
 *
 * @param id - Unique node identifier
 * @param params - Resize parameters (width, height, fit)
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to keep output in flow results
 * @param options.naming - File naming configuration (auto suffix: `${width}x${height}`)
 *
 * @example
 * ```typescript
 * // With auto-naming: "photo.jpg" -> "photo-800x600.jpg"
 * const resize = yield* createResizeNode("resize-1", { width: 800, height: 600 }, {
 *   naming: { mode: "auto" }
 * });
 * ```
 */
export function createResizeNode(
  id: string,
  { width, height, fit }: ResizeParams,
  options?: { keepOutput?: boolean; naming?: FileNamingConfig },
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    // Build naming config with auto suffix for resize
    const namingConfig: FileNamingConfig | undefined = options?.naming
      ? {
          ...options.naming,
          // Provide default auto suffix generator for resize nodes
          autoSuffix:
            options.naming.autoSuffix ??
            ((ctx) => `${ctx.width ?? width}x${ctx.height ?? height}`),
        }
      : undefined;

    return yield* createTransformNode({
      id,
      name: "Resize",
      description: "Resizes an image to the specified dimensions",
      outputTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      naming: namingConfig,
      nodeType: "resize",
      namingVars: { width, height },
      transform: (inputBytes) =>
        imageService.resize(inputBytes, { height, width, fit }),
    });
  });
}
