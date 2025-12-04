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

// ============================================================================
// Plugin Operation Tracing
// ============================================================================

/**
 * Operation domains for plugin-level tracing
 */
export type OperationDomain =
  | "image"
  | "video"
  | "document"
  | "ai"
  | "virus-scan"
  | "zip";

/**
 * Wrap an Effect with a plugin operation span
 *
 * @param domain - The operation domain (e.g., "image", "video", "document")
 * @param operation - The specific operation (e.g., "optimize", "transcode", "extract-text")
 * @param attributes - Optional span attributes with operation-specific details
 *
 * @example
 * ```typescript
 * // Image optimization span
 * withOperationSpan("image", "optimize", {
 *   "image.format": "webp",
 *   "image.quality": 80,
 * })(imageService.optimize(inputBytes, params))
 *
 * // Video transcoding span
 * withOperationSpan("video", "transcode", {
 *   "video.format": "mp4",
 *   "video.codec": "h264",
 * })(videoService.transcode(inputBytes, params))
 * ```
 */
export const withOperationSpan =
  <A, E, R>(
    domain: OperationDomain,
    operation: string,
    attributes?: Record<string, unknown>,
  ) =>
  (effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`${domain}-${operation}`, {
        attributes: {
          "operation.domain": domain,
          "operation.name": operation,
          ...attributes,
        },
      }),
    );

/**
 * Add operation context to the current span
 */
export const withOperationContext = (context: {
  domain: OperationDomain;
  operation: string;
  inputSize?: number;
  outputSize?: number;
}) =>
  Effect.annotateCurrentSpan({
    "operation.domain": context.domain,
    "operation.name": context.operation,
    "operation.input_size": context.inputSize?.toString() ?? "unknown",
    "operation.output_size": context.outputSize?.toString() ?? "unknown",
  });

// ============================================================================
// Circuit Breaker Tracing
// ============================================================================

/**
 * Circuit breaker state for tracing
 */
export type CircuitBreakerTracingState = "closed" | "open" | "half-open";

/**
 * Wrap an Effect with a circuit breaker evaluation span
 */
export const withCircuitBreakerSpan =
  <A, E, R>(
    nodeType: string,
    state: CircuitBreakerTracingState,
    attributes?: Record<string, unknown>,
  ) =>
  (effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`circuit-breaker-${nodeType}`, {
        attributes: {
          "circuit_breaker.node_type": nodeType,
          "circuit_breaker.state": state,
          ...attributes,
        },
      }),
    );

/**
 * Add circuit breaker context to the current span
 */
export const withCircuitBreakerContext = (context: {
  nodeType: string;
  state: CircuitBreakerTracingState;
  failureCount?: number;
  failureThreshold?: number;
  resetTimeout?: number;
  decision?: "allowed" | "rejected" | "fallback";
}) =>
  Effect.annotateCurrentSpan({
    "circuit_breaker.node_type": context.nodeType,
    "circuit_breaker.state": context.state,
    "circuit_breaker.failure_count": context.failureCount?.toString() ?? "0",
    "circuit_breaker.failure_threshold":
      context.failureThreshold?.toString() ?? "5",
    "circuit_breaker.reset_timeout":
      context.resetTimeout?.toString() ?? "30000",
    "circuit_breaker.decision": context.decision ?? "unknown",
  });

/**
 * Add a circuit breaker state change event to the current span
 */
export const annotateCircuitBreakerStateChange = (event: {
  nodeType: string;
  previousState: CircuitBreakerTracingState;
  newState: CircuitBreakerTracingState;
  failureCount?: number;
  timestamp?: number;
}) =>
  Effect.annotateCurrentSpan({
    "circuit_breaker.event": "state_change",
    "circuit_breaker.node_type": event.nodeType,
    "circuit_breaker.previous_state": event.previousState,
    "circuit_breaker.new_state": event.newState,
    "circuit_breaker.failure_count": event.failureCount?.toString() ?? "0",
    "circuit_breaker.timestamp":
      event.timestamp?.toString() ?? Date.now().toString(),
  });
