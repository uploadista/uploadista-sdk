import { createFlow, createInputNode } from "@uploadista/core";
import {
  createDescribeImageNode,
  createRemoveBackgroundNode,
} from "@uploadista/flow-images-nodes";

/**
 * Image description flow - generates AI-powered descriptions of image content
 *
 * Nodes: input → describe-image (sink)
 *
 * Configuration:
 * - Uses AI vision models to analyze image content
 * - Generates detailed descriptions including objects, scenes, and context
 *
 * Use case: Automatically generate alt text for accessibility, create image
 * metadata for search, or provide content moderation insights. The describe-image
 * node is a sink (no outgoing edges), so the described file is automatically
 * persisted to target storage.
 *
 * Note: Requires AI service credentials (e.g., OpenAI, Replicate) to be configured.
 *
 * @example
 * ```ts
 * import { describeImageFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(describeImageFlow, imageFile);
 * // result.metadata.description = "A sunset over mountains with orange sky"
 * ```
 */
export const describeImageFlow = createFlow({
  flowId: "describe-image-flow",
  name: "Describe Image Flow",
  nodes: {
    input: createInputNode("input"),
    "describe-image": createDescribeImageNode("describe-image"),
  },
  edges: [{ source: "input", target: "describe-image" }],
});

/**
 * Background removal flow - removes backgrounds from images using AI
 *
 * Nodes: input → remove-background (sink)
 *
 * Configuration:
 * - Uses AI models to detect and remove image backgrounds
 * - Outputs transparent PNG with subject isolated
 *
 * Use case: Create product images for e-commerce, generate profile pictures
 * with transparent backgrounds, or prepare images for compositing. The
 * remove-background node is a sink (no outgoing edges), so the processed
 * file is automatically persisted to target storage.
 *
 * Note: Requires AI service credentials (e.g., remove.bg, Replicate) to be configured.
 *
 * @example
 * ```ts
 * import { removeBackgroundFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(removeBackgroundFlow, productPhoto);
 * // result.file = PNG with transparent background
 * ```
 */
export const removeBackgroundFlow = createFlow({
  flowId: "remove-background-flow",
  name: "Remove Background Flow",
  nodes: {
    input: createInputNode("input"),
    "remove-background": createRemoveBackgroundNode("remove-background"),
  },
  edges: [{ source: "input", target: "remove-background" }],
});
