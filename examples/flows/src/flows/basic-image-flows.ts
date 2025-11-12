import {
  createFlow,
  createInputNode,
  createStorageNode,
} from "@uploadista/core";
import {
  createOptimizeNode,
  createResizeNode,
  createTransformImageNode,
} from "@uploadista/flow-images-nodes";

/**
 * Simple flow - demonstrates the minimal viable flow structure
 *
 * Nodes: input → output
 *
 * Use case: Basic file upload without any processing. This is the simplest
 * possible flow that accepts a file and stores it directly.
 *
 * @example
 * ```ts
 * import { simpleFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(simpleFlow, file);
 * ```
 */
export const simpleFlow = createFlow({
  flowId: "simple-flow",
  name: "Simple Flow",
  nodes: {
    input: createInputNode("input"),
    output: createStorageNode("output"),
  },
  edges: [{ source: "input", target: "output" }],
});

/**
 * Image optimization flow - compresses and converts images to WebP format
 *
 * Nodes: input → optimize → output
 *
 * Configuration:
 * - Quality: 80 (good balance between size and visual quality)
 * - Format: webp (modern format with excellent compression)
 *
 * Use case: Optimize uploaded images for web delivery, reducing bandwidth
 * and improving page load times.
 *
 * @example
 * ```ts
 * import { optimizeFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(optimizeFlow, imageFile);
 * ```
 */
export const optimizeFlow = createFlow({
  flowId: "optimize-flow",
  name: "Optimize Flow",
  nodes: {
    input: createInputNode("input"),
    optimize: createOptimizeNode("optimize", {
      quality: 80,
      format: "webp",
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "optimize" },
    { source: "optimize", target: "output" },
  ],
});

/**
 * Image resize flow - resizes images to specified dimensions
 *
 * Nodes: input → resize → output
 *
 * Configuration:
 * - Width: 800px
 * - Height: 600px
 * - Fit: cover (maintains aspect ratio, crops if necessary)
 *
 * Use case: Create thumbnails or ensure images fit specific dimensions for
 * consistent display in galleries or listings.
 *
 * @example
 * ```ts
 * import { resizeFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(resizeFlow, largeImage);
 * ```
 */
export const resizeFlow = createFlow({
  flowId: "resize-flow",
  name: "Resize Flow",
  nodes: {
    input: createInputNode("input"),
    resize: createResizeNode("resize", {
      width: 800,
      height: 600,
      fit: "cover",
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "resize" },
    { source: "resize", target: "output" },
  ],
});

/**
 * Image transformation flow - applies transformations like rotation and flipping
 *
 * Nodes: input → transform → output
 *
 * Configuration:
 * - Rotate: 90 degrees
 * - Flip: horizontal
 *
 * Use case: Apply basic image transformations such as rotation, flipping,
 * or other manipulations to correct orientation or create variations.
 *
 * @example
 * ```ts
 * import { transformFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(transformFlow, imageFile);
 * ```
 */
export const transformFlow = createFlow({
  flowId: "transform-flow",
  name: "Transform Flow",
  nodes: {
    input: createInputNode("input"),
    transform: createTransformImageNode("transform", {
      transformations: [
        { type: "rotate", angle: 90 },
        { type: "flip", direction: "horizontal" },
      ],
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "transform" },
    { source: "transform", target: "output" },
  ],
});
