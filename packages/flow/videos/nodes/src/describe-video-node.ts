import {
  createTransformNode,
  STORAGE_OUTPUT_TYPE_ID,
  VideoPlugin,
} from "@uploadista/core/flow";
import { Effect } from "effect";

/**
 * Creates a Describe Video metadata extraction node
 *
 * Extracts comprehensive metadata from the video file including duration,
 * resolution, codec, bitrate, and audio information. The metadata is stored
 * in the file context for downstream nodes while passing through the original bytes.
 *
 * @param id - Unique node identifier
 * @returns Effect that resolves to the configured node
 *
 * @example
 * ```typescript
 * const node = yield* createDescribeVideoNode("describe-1");
 * ```
 */
export function createDescribeVideoNode(
  id: string,
  options?: { keepOutput?: boolean },
) {
  return Effect.gen(function* () {
    const videoService = yield* VideoPlugin;

    return yield* createTransformNode({
      id,
      name: "Describe Video",
      description:
        "Extracts video metadata (duration, resolution, codec, etc.)",
      nodeTypeId: STORAGE_OUTPUT_TYPE_ID,
      keepOutput: options?.keepOutput,
      transform: (inputBytes, file) =>
        Effect.gen(function* () {
          // Extract metadata
          const metadata = yield* videoService.describe(inputBytes);

          // Store metadata in file context for downstream nodes
          return {
            bytes: inputBytes, // Pass through original bytes unchanged
            metadata: {
              ...file.metadata,
              videoInfo: metadata,
            },
          };
        }),
    });
  });
}
