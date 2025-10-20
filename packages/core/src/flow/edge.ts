import type { FlowEdge as EnhancedFlowEdge } from "./types/flow-types";

/**
 * Represents a connection between two nodes in a flow, defining the data flow direction.
 *
 * Edges connect the output of a source node to the input of a target node,
 * enabling data to flow through the processing pipeline in a directed acyclic graph (DAG).
 */
export type FlowEdge = EnhancedFlowEdge;

/**
 * Creates a flow edge connecting two nodes in a processing pipeline.
 *
 * Edges define how data flows between nodes. The data output from the source node
 * becomes the input for the target node. For nodes with multiple inputs/outputs,
 * ports can be specified to route data to specific connections.
 *
 * @param config - Edge configuration
 * @param config.source - ID of the source node (data originates here)
 * @param config.target - ID of the target node (data flows to here)
 * @param config.sourcePort - Optional port name on the source node for multi-output nodes
 * @param config.targetPort - Optional port name on the target node for multi-input nodes
 *
 * @returns A FlowEdge object representing the connection
 *
 * @example
 * ```typescript
 * // Simple edge connecting two nodes
 * const edge = createFlowEdge({
 *   source: "input-1",
 *   target: "process-1"
 * });
 *
 * // Edge with ports for multi-input/output nodes
 * const portEdge = createFlowEdge({
 *   source: "multiplex-1",
 *   target: "merge-1",
 *   sourcePort: "out-a",
 *   targetPort: "in-1"
 * });
 * ```
 */
export function createFlowEdge({
  source,
  target,
  sourcePort,
  targetPort,
}: {
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
}): FlowEdge {
  return {
    source,
    target,
    sourcePort,
    targetPort,
  };
}
