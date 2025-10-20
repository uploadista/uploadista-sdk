import { Effect, Metric } from "effect";
import { createFlowMetrics } from "./metrics.js";

// ============================================================================
// Flow Error Classification
// ============================================================================

export type FlowErrorCategory =
  | "flow_validation_error"
  | "node_execution_error"
  | "node_not_found_error"
  | "flow_timeout_error"
  | "flow_cancelled_error"
  | "unknown_flow_error";

/**
 * Classify flow execution errors
 */
export const classifyFlowError = (error: unknown): FlowErrorCategory => {
  if (!error || typeof error !== "object") return "unknown_flow_error";

  const errorCode = "code" in error ? error.code : undefined;
  if (!errorCode) return "unknown_flow_error";

  // Flow-specific error codes
  switch (errorCode) {
    case "FLOW_VALIDATION_ERROR":
    case "FLOW_INVALID_INPUT":
    case "FLOW_INVALID_OUTPUT":
      return "flow_validation_error";
    case "FLOW_NODE_NOT_FOUND":
    case "FLOW_EDGE_INVALID":
      return "node_not_found_error";
    case "FLOW_NODE_EXECUTION_FAILED":
    case "FLOW_NODE_ERROR":
      return "node_execution_error";
    case "FLOW_TIMEOUT":
      return "flow_timeout_error";
    case "FLOW_CANCELLED":
    case "ABORTED":
      return "flow_cancelled_error";
    default:
      return "unknown_flow_error";
  }
};

/**
 * Track flow errors with classification
 */
export const trackFlowError = <E>(
  error: E,
): Effect.Effect<void, never, never> => {
  const metrics = createFlowMetrics();
  const category = classifyFlowError(error);

  return Effect.gen(function* () {
    // Increment total failed flows
    yield* Metric.increment(metrics.flowFailedTotal);

    // Log error with classification
    yield* Effect.logError("Flow execution failed").pipe(
      Effect.annotateLogs({
        "error.category": category,
        "error.message": String(error),
      }),
    );
  });
};

/**
 * Track node errors with classification
 */
export const trackNodeError = <E>(
  nodeId: string,
  nodeType: string,
  error: E,
): Effect.Effect<void, never, never> => {
  const metrics = createFlowMetrics();
  const category = classifyFlowError(error);

  return Effect.gen(function* () {
    // Increment node failed counter
    yield* Metric.increment(metrics.nodeFailedTotal);

    // Log error with node context
    yield* Effect.logError("Node execution failed").pipe(
      Effect.annotateLogs({
        "node.id": nodeId,
        "node.type": nodeType,
        "error.category": category,
        "error.message": String(error),
      }),
    );
  });
};
