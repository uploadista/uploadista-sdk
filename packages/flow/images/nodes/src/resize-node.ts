import {
  createTransformNode,
  ImagePlugin,
  type ResizeParams,
} from "@uploadista/core/flow";
import { Effect } from "effect";

export function createResizeNode(
  id: string,
  { width, height, fit }: ResizeParams,
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    return yield* createTransformNode({
      id,
      name: "Resize",
      description: "Resizes an image to the specified dimensions",
      transform: (inputBytes) =>
        imageService.resize(inputBytes, { height, width, fit }),
    });
  });
}
