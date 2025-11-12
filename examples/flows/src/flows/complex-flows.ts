import {
  createFlow,
  createInputNode,
  createStorageNode,
} from "@uploadista/core";
import {
  createDescribeImageNode,
  createOptimizeNode,
  createResizeNode,
} from "@uploadista/flow-images-nodes";
import {
  createConditionalNode,
  createMultiplexNode,
  createZipNode,
} from "@uploadista/flow-utility-nodes/nodes";
import {
  createTranscodeVideoNode,
  createTrimVideoNode,
  createVideoThumbnailNode,
} from "@uploadista/flow-videos-nodes";

/**
 * Image pipeline flow - multi-stage image processing with resize, optimize, and describe
 *
 * Nodes: input → resize → optimize → describe-image → output
 *
 * Configuration:
 * - Resize to 1200x900 cover
 * - Optimize to WebP quality 85
 * - Generate AI description
 *
 * Use case: Complete image processing pipeline that ensures proper dimensions,
 * optimal file size, and generates searchable metadata in a single flow.
 *
 * @example
 * ```ts
 * import { imagePipelineFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(imagePipelineFlow, rawImage);
 * // result.file = optimized 1200x900 WebP with AI-generated description
 * ```
 */
export const imagePipelineFlow = createFlow({
  flowId: "image-pipeline-flow",
  name: "Image Pipeline Flow",
  nodes: {
    input: createInputNode("input"),
    resize: createResizeNode("resize", {
      width: 1200,
      height: 900,
      fit: "cover",
    }),
    optimize: createOptimizeNode("optimize", {
      quality: 85,
      format: "webp",
    }),
    "describe-image": createDescribeImageNode("describe-image"),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "resize" },
    { source: "resize", target: "optimize" },
    { source: "optimize", target: "describe-image" },
    { source: "describe-image", target: "output" },
  ],
});

/**
 * Video pipeline flow - multi-stage video processing with trim, transcode, and thumbnail
 *
 * Nodes: input → trim → transcode → thumbnail → output
 *
 * Configuration:
 * - Trim to 0-60 seconds
 * - Transcode to WebM VP9
 * - Generate thumbnail at 5 seconds
 *
 * Use case: Process uploaded videos for web delivery by trimming length,
 * converting to efficient format, and generating preview thumbnail.
 *
 * @example
 * ```ts
 * import { videoPipelineFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(videoPipelineFlow, longVideo);
 * // result.file = 60-second WebM with thumbnail
 * ```
 */
export const videoPipelineFlow = createFlow({
  flowId: "video-pipeline-flow",
  name: "Video Pipeline Flow",
  nodes: {
    input: createInputNode("input"),
    trim: createTrimVideoNode("trim", {
      startTime: 0,
      endTime: 60,
    }),
    transcode: createTranscodeVideoNode("transcode", {
      format: "webm",
      codec: "vp9",
      videoBitrate: "1000k",
    }),
    thumbnail: createVideoThumbnailNode("thumbnail", {
      timestamp: 5,
      format: "jpeg",
      quality: 85,
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "trim" },
    { source: "trim", target: "transcode" },
    { source: "transcode", target: "thumbnail" },
    { source: "thumbnail", target: "output" },
  ],
});

/**
 * Conditional image flow - routes images based on size with different processing
 *
 * Nodes: input → conditional → [large: resize+optimize, small: optimize only] → outputs
 *
 * Configuration:
 * - Condition: file size > 2MB
 * - Large files: resize to 1600x1200, then optimize
 * - Small files: optimize directly without resizing
 *
 * Use case: Apply different processing strategies based on file characteristics,
 * optimizing resources by only resizing large files that need it.
 *
 * @example
 * ```ts
 * import { conditionalImageFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(conditionalImageFlow, image);
 * // Large images resized + optimized, small images only optimized
 * ```
 */
export const conditionalImageFlow = createFlow({
  flowId: "conditional-image-flow",
  name: "Conditional Image Flow",
  nodes: {
    input: createInputNode("input"),
    conditional: createConditionalNode("conditional", {
      field: "size",
      operator: "greaterThan",
      value: 2000000, // 2MB
    }),
    resize: createResizeNode("resize", {
      width: 1600,
      height: 1200,
      fit: "contain",
    }),
    "optimize-large": createOptimizeNode("optimize-large", {
      quality: 80,
      format: "webp",
    }),
    "optimize-small": createOptimizeNode("optimize-small", {
      quality: 85,
      format: "webp",
    }),
    "output-large": createStorageNode("output-large"),
    "output-small": createStorageNode("output-small"),
  },
  edges: [
    { source: "input", target: "conditional" },
    { source: "conditional", target: "resize" },
    { source: "resize", target: "optimize-large" },
    { source: "optimize-large", target: "output-large" },
    { source: "conditional", target: "optimize-small" },
    { source: "optimize-small", target: "output-small" },
  ],
});

/**
 * Multi-format flow - generates multiple output formats and zips them together
 *
 * Nodes: input → multiplex → [webp, jpeg, png] optimizations → zip → output
 *
 * Configuration:
 * - Creates three optimized versions: WebP (quality 80), JPEG (quality 85), PNG
 * - Zips all formats into a single archive
 *
 * Use case: Generate multiple format versions of an image for maximum compatibility,
 * useful for distributing assets that need to work across different platforms.
 *
 * @example
 * ```ts
 * import { multiFormatFlow } from '@uploadista/example-flows';
 * const result = await executeFlow(multiFormatFlow, sourceImage);
 * // result.file = ZIP archive with WebP, JPEG, and PNG versions
 * ```
 */
export const multiFormatFlow = createFlow({
  flowId: "multi-format-flow",
  name: "Multi-Format Flow",
  nodes: {
    input: createInputNode("input"),
    multiplex: createMultiplexNode("multiplex", {
      outputCount: 3,
      strategy: "copy",
    }),
    "optimize-webp": createOptimizeNode("optimize-webp", {
      quality: 80,
      format: "webp",
    }),
    "optimize-jpeg": createOptimizeNode("optimize-jpeg", {
      quality: 85,
      format: "jpeg",
    }),
    "optimize-png": createOptimizeNode("optimize-png", {
      quality: 90,
      format: "png",
    }),
    zip: createZipNode("zip", {
      zipName: "multi-format.zip",
      includeMetadata: false,
      inputCount: 3,
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "multiplex" },
    { source: "multiplex", target: "optimize-webp" },
    { source: "multiplex", target: "optimize-jpeg" },
    { source: "multiplex", target: "optimize-png" },
    { source: "optimize-webp", target: "zip" },
    { source: "optimize-jpeg", target: "zip" },
    { source: "optimize-png", target: "zip" },
    { source: "zip", target: "output" },
  ],
});
