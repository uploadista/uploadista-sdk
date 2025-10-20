import { Effect } from "effect";

// ============================================================================
// Flow Tracing Utilities
// ============================================================================

/**
 * Wrap an Effect with a flow operation span
 */
export const withFlowSpan =
  <A, E, R>(operation: string, attributes?: Record<string, unknown>) =>
  (effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`flow-${operation}`, {
        attributes: {
          "flow.operation": operation,
          ...attributes,
        },
      }),
    );

/**
 * Add flow context to the current span
 */
export const withFlowContext = (context: {
  flowId?: string;
  flowName?: string;
  jobId?: string;
  nodeCount?: number;
  storageId?: string;
}) =>
  Effect.annotateCurrentSpan({
    "flow.id": context.flowId ?? "unknown",
    "flow.name": context.flowName ?? "unknown",
    "flow.job_id": context.jobId ?? "unknown",
    "flow.node_count": context.nodeCount?.toString() ?? "0",
    "flow.storage_id": context.storageId ?? "unknown",
  });

/**
 * Add node context to the current span
 */
export const withNodeContext = (context: {
  nodeId: string;
  nodeType: string;
  nodeName?: string;
  flowId?: string;
  jobId?: string;
}) =>
  Effect.annotateCurrentSpan({
    "node.id": context.nodeId,
    "node.type": context.nodeType,
    "node.name": context.nodeName ?? "unknown",
    "node.flow_id": context.flowId ?? "unknown",
    "node.job_id": context.jobId ?? "unknown",
  });

/**
 * Add execution state context to the current span
 */
export const withExecutionContext = (context: {
  executionOrder?: string[];
  currentIndex?: number;
  totalNodes?: number;
  parallelCount?: number;
}) =>
  Effect.annotateCurrentSpan({
    "execution.order": context.executionOrder?.join(",") ?? "",
    "execution.current_index": context.currentIndex?.toString() ?? "0",
    "execution.total_nodes": context.totalNodes?.toString() ?? "0",
    "execution.parallel_count": context.parallelCount?.toString() ?? "0",
  });
