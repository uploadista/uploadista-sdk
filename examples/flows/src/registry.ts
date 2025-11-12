// Basic Image Flows

// Advanced Image Flows
import {
  describeImageFlow,
  removeBackgroundFlow,
} from "./flows/advanced-image-flows";
import {
  optimizeFlow,
  resizeFlow,
  simpleFlow,
  transformFlow,
} from "./flows/basic-image-flows";
// Complex Flows
import {
  conditionalImageFlow,
  imagePipelineFlow,
  multiFormatFlow,
  videoPipelineFlow,
} from "./flows/complex-flows";

// Utility Flows
import {
  conditionalFlow,
  mergeFlow,
  multiplexFlow,
  zipFlow,
} from "./flows/utility-flows";
// Video Flows
import {
  describeVideoFlow,
  resizeVideoFlow,
  thumbnailFlow,
  transcodeVideoFlow,
  trimVideoFlow,
} from "./flows/video-flows";

/**
 * Union type of all available flow IDs in the example-flows library
 */
export type FlowId =
  // Basic Image Flows
  | "simple-flow"
  | "optimize-flow"
  | "resize-flow"
  | "transform-flow"
  // Advanced Image Flows
  | "describe-image-flow"
  | "remove-background-flow"
  // Video Flows
  | "transcode-video-flow"
  | "trim-video-flow"
  | "thumbnail-flow"
  | "resize-video-flow"
  | "describe-video-flow"
  // Utility Flows
  | "conditional-flow"
  | "merge-flow"
  | "multiplex-flow"
  | "zip-flow"
  // Complex Flows
  | "image-pipeline-flow"
  | "video-pipeline-flow"
  | "conditional-image-flow"
  | "multi-format-flow";

/**
 * Registry function to retrieve a flow by its ID
 *
 * Returns the flow definition matching the provided flowId. If the flowId
 * is not found, returns the simpleFlow as a fallback.
 *
 * @param flowId - The unique identifier for the desired flow
 * @returns The flow definition
 *
 * @example
 * ```ts
 * import { getFlow } from '@uploadista/example-flows';
 *
 * // Get a specific flow by ID
 * const flow = getFlow('optimize-flow');
 *
 * // Use in a server endpoint
 * app.post('/upload/:flowId', (req, res) => {
 *   const flow = getFlow(req.params.flowId);
 *   const result = await executeFlow(flow, req.file);
 *   res.json(result);
 * });
 * ```
 */
export function getFlow(flowId: string): any {
  switch (flowId) {
    // Basic Image Flows
    case "simple-flow":
      return simpleFlow;
    case "optimize-flow":
      return optimizeFlow;
    case "resize-flow":
      return resizeFlow;
    case "transform-flow":
      return transformFlow;

    // Advanced Image Flows
    case "describe-image-flow":
      return describeImageFlow;
    case "remove-background-flow":
      return removeBackgroundFlow;

    // Video Flows
    case "transcode-video-flow":
      return transcodeVideoFlow;
    case "trim-video-flow":
      return trimVideoFlow;
    case "thumbnail-flow":
      return thumbnailFlow;
    case "resize-video-flow":
      return resizeVideoFlow;
    case "describe-video-flow":
      return describeVideoFlow;

    // Utility Flows
    case "conditional-flow":
      return conditionalFlow;
    case "merge-flow":
      return mergeFlow;
    case "multiplex-flow":
      return multiplexFlow;
    case "zip-flow":
      return zipFlow;

    // Complex Flows
    case "image-pipeline-flow":
      return imagePipelineFlow;
    case "video-pipeline-flow":
      return videoPipelineFlow;
    case "conditional-image-flow":
      return conditionalImageFlow;
    case "multi-format-flow":
      return multiFormatFlow;

    // Default fallback
    default:
      console.warn(`Unknown flowId "${flowId}", falling back to simple-flow`);
      return simpleFlow;
  }
}

/**
 * Get all available flow IDs
 *
 * @returns Array of all flow IDs in the registry
 *
 * @example
 * ```ts
 * import { getAllFlowIds } from '@uploadista/example-flows';
 *
 * const flowIds = getAllFlowIds();
 * console.log(flowIds); // ['simple-flow', 'optimize-flow', ...]
 * ```
 */
export function getAllFlowIds(): FlowId[] {
  return [
    // Basic Image Flows
    "simple-flow",
    "optimize-flow",
    "resize-flow",
    "transform-flow",
    // Advanced Image Flows
    "describe-image-flow",
    "remove-background-flow",
    // Video Flows
    "transcode-video-flow",
    "trim-video-flow",
    "thumbnail-flow",
    "resize-video-flow",
    "describe-video-flow",
    // Utility Flows
    "conditional-flow",
    "merge-flow",
    "multiplex-flow",
    "zip-flow",
    // Complex Flows
    "image-pipeline-flow",
    "video-pipeline-flow",
    "conditional-image-flow",
    "multi-format-flow",
  ];
}
