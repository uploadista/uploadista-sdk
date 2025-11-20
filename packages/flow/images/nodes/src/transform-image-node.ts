import {
  createTransformNode,
  ImagePlugin,
  STORAGE_OUTPUT_TYPE_ID,
  type TransformImageParams,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Apply a chain of transformations to an image by reducing over the transformations array.
 * Each transformation receives the output of the previous transformation as input.
 *
 * @param imageService - The image plugin service to use for transformations
 * @param inputBytes - The input image bytes
 * @param transformations - Array of transformations to apply in sequence
 * @returns Effect that resolves to the final transformed image bytes
 */
function applyTransformationChain(
  imageService: ReturnType<typeof ImagePlugin.of>,
  inputBytes: Uint8Array,
  transformations: TransformImageParams["transformations"],
) {
  return Effect.reduce(transformations, inputBytes, (bytes, transformation) =>
    imageService.transform(bytes, transformation),
  );
}

/**
 * Creates a transform image node that applies multiple transformations sequentially.
 *
 * This node enables complex image processing workflows by chaining multiple transformations
 * together. Each transformation is applied to the output of the previous transformation,
 * allowing for powerful image manipulation pipelines.
 *
 * Supported transformations include:
 * - Basic: resize, blur, rotate, flip
 * - Filters: grayscale, sepia, brightness, contrast
 * - Effects: sharpen
 * - Advanced: watermark, logo, text
 *
 * Note: Watermark and logo transformations require imagePath to be a valid URL.
 * Images will be fetched from the provided URL during transformation.
 *
 * @param id - Unique identifier for this node
 * @param params - Parameters including the transformations array
 * @returns Effect that resolves to a transform node
 *
 * @example
 * ```typescript
 * const node = createTransformImageNode("transform-1", {
 *   transformations: [
 *     { type: 'resize', width: 800, height: 600, fit: 'cover' },
 *     { type: 'brightness', value: 20 },
 *     {
 *       type: 'watermark',
 *       imagePath: 'https://cdn.example.com/watermark.png',
 *       position: 'bottom-right',
 *       opacity: 0.5
 *     }
 *   ]
 * });
 * ```
 */
export function createTransformImageNode(
  id: string,
  { transformations }: TransformImageParams,
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    return yield* createTransformNode({
      id,
      name: "Transform Image",
      description: `Apply ${transformations.length} transformation${transformations.length === 1 ? "" : "s"} to the image`,
      nodeTypeId: STORAGE_OUTPUT_TYPE_ID,
      transform: (inputBytes) =>
        applyTransformationChain(imageService, inputBytes, transformations),
    });
  });
}
