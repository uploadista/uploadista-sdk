import {
  completeNodeExecution,
  createFlowNode,
  NodeType,
  STORAGE_OUTPUT_TYPE_ID,
} from "@uploadista/core/flow";
import { type UploadFile, uploadFileSchema } from "@uploadista/core/types";
import { Effect } from "effect";

/**
 * Creates a passthrough node that acts as a data sink without transformation.
 *
 * This node is useful when you need to capture output at a specific point in the flow
 * without performing any transformation. The most common use case is after a
 * conditional routing node where one branch needs to output the file as-is.
 *
 * By default, `keepOutput` is set to `true`, making this node a sink that preserves
 * its output in the flow results even if it has outgoing edges.
 *
 * @param id - Unique identifier for the node
 * @param options - Optional configuration
 * @param options.keepOutput - Whether to preserve output in flow results (default: true)
 *
 * @example
 * ```typescript
 * // Use after conditional routing to output files that don't need processing
 * const conditionalNode = yield* createConditionalNode("is-image", {
 *   field: "mimeType",
 *   operator: "startsWith",
 *   value: "image/",
 * });
 *
 * // Images go to resize node, non-images go to passthrough (stored as-is)
 * const passthroughNode = yield* createPassthroughNode("store-as-is");
 *
 * // Connect conditional false edge to passthrough
 * flow.addEdge({ source: "is-image", target: "store-as-is", condition: false });
 * ```
 */
export function createPassthroughNode(
  id: string,
  options?: { keepOutput?: boolean },
) {
  const keepOutput = options?.keepOutput ?? true;

  return createFlowNode<UploadFile, UploadFile>({
    id,
    name: "Passthrough",
    description:
      "Passes file through without transformation, acting as an output sink",
    type: NodeType.process,
    nodeTypeId: "passthrough",
    inputSchema: uploadFileSchema,
    outputSchema: uploadFileSchema,
    keepOutput,
    outputTypeId: STORAGE_OUTPUT_TYPE_ID,
    run: ({ data }) => {
      // Simply pass through the data unchanged
      return Effect.succeed(completeNodeExecution(data));
    },
  });
}
