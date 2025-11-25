import { createFlow, createInputNode } from "@uploadista/core";
import {
  createOptimizeNode,
  createResizeNode,
  createTransformImageNode,
} from "@uploadista/flow-images-nodes";

/**
 * Simple flow - demonstrates the minimal viable flow structure
 *
 * Nodes: input (sink)
 *
 * Use case: Basic file upload without any processing. This is the simplest
 * possible flow that accepts a file and stores it directly. The input node
 * is a sink (no outgoing edges), so the file is automatically persisted to
 * target storage.
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
  },
  edges: [],
});

/**
 * Image optimization flow - compresses and converts images to WebP format
 *
 * Nodes: input → optimize (sink)
 *
 * Configuration:
 * - Quality: 80 (good balance between size and visual quality)
 * - Format: webp (modern format with excellent compression)
 *
 * Use case: Optimize uploaded images for web delivery, reducing bandwidth
 * and improving page load times. The optimize node is a sink, so the optimized
 * file is automatically persisted to target storage.
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
  },
  edges: [{ source: "input", target: "optimize" }],
});

/**
 * Image resize flow - resizes images to specified dimensions
 *
 * Nodes: input → resize (sink)
 *
 * Configuration:
 * - Width: 800px
 * - Height: 600px
 * - Fit: cover (maintains aspect ratio, crops if necessary)
 *
 * Use case: Create thumbnails or ensure images fit specific dimensions for
 * consistent display in galleries or listings. The resize node is a sink,
 * so the resized file is automatically persisted to target storage.
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
  },
  edges: [{ source: "input", target: "resize" }],
});

/**
 * Image transformation flow - applies transformations like rotation and flipping
 *
 * Nodes: input → transform (sink)
 *
 * Configuration:
 * - Rotate: 90 degrees
 * - Flip: horizontal
 *
 * Use case: Apply basic image transformations such as rotation, flipping,
 * or other manipulations to correct orientation or create variations. The
 * transform node is a sink, so the transformed file is automatically persisted
 * to target storage.
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
  },
  edges: [{ source: "input", target: "transform" }],
});
