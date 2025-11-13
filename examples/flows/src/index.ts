/**
 * @packageDocumentation
 * @module @uploadista/example-flows
 *
 * Example flow definitions for Uploadista SDK server examples
 *
 * This package provides a comprehensive library of example flows demonstrating
 * various node types and flow patterns. All flows are ready to use in server
 * examples and can be customized for specific use cases.
 *
 * ## Usage
 *
 * ### Direct Import
 * ```ts
 * import { optimizeFlow, resizeFlow } from '@uploadista/example-flows';
 *
 * const result = await executeFlow(optimizeFlow, imageFile);
 * ```
 *
 * ### Registry Pattern
 * ```ts
 * import { getFlow } from '@uploadista/example-flows';
 *
 * const flow = getFlow('optimize-flow');
 * const result = await executeFlow(flow, imageFile);
 * ```
 *
 * ## Available Flows
 *
 * ### Basic Image Flows
 * - `simpleFlow` - Minimal input → output flow
 * - `optimizeFlow` - Image compression and format conversion
 * - `resizeFlow` - Image dimension modification
 * - `transformFlow` - Image transformations (rotate, flip)
 *
 * ### Advanced Image Flows
 * - `describeImageFlow` - AI-powered image description
 * - `removeBackgroundFlow` - Background removal with AI
 *
 * ### Video Flows
 * - `transcodeVideoFlow` - Video format and codec conversion
 * - `trimVideoFlow` - Video time range extraction
 * - `thumbnailFlow` - Extract frame as thumbnail
 * - `resizeVideoFlow` - Video dimension modification
 * - `describeVideoFlow` - AI-powered video description
 *
 * ### Utility Flows
 * - `conditionalFlow` - Conditional routing based on file properties
 * - `mergeFlow` - Combine multiple inputs
 * - `multiplexFlow` - Parallel processing from single input
 * - `zipFlow` - Archive multiple files
 *
 * ### Complex Flows
 * - `imagePipelineFlow` - Multi-stage image processing
 * - `videoPipelineFlow` - Multi-stage video processing
 * - `conditionalImageFlow` - Conditional branching with processing
 * - `multiFormatFlow` - Generate multiple formats and zip
 */

export * from "./flows/advanced-image-flows";
// Re-export all flows by category
export * from "./flows/basic-image-flows";
export * from "./flows/complex-flows";
export * from "./flows/typed-flows";
export * from "./flows/utility-flows";
export * from "./flows/video-flows";

// Re-export registry functions and types
export { type FlowId, getAllFlowIds, getFlow } from "./registry";
