import {
  createTransformNode,
  ImagePlugin,
  type ResizeParams,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { Effect } from "effect";

export function createResizeNode(
  id: string,
  { width, height, fit }: ResizeParams,
  options?: { keepOutput?: boolean },
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    return yield* createTransformNode({
      id,
      name: "Resize",
      description: "Resizes an image to the specified dimensions",
      nodeTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      transform: (inputBytes) =>
        imageService.resize(inputBytes, { height, width, fit }),
    });
  });
}
