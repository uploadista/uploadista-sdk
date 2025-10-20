import { Effect, Layer, Metric } from "effect";
import {
  FlowObservability,
  makeFlowObservabilityLayer,
} from "../core/layers.js";
import { createFlowMetrics, type FlowMetrics } from "./metrics.js";

// ============================================================================
// Flow Observability Layer Implementation
// ============================================================================

/**
 * Create a live flow observability layer with full metrics
 */
export const makeFlowObservabilityLive = (
  serviceName = "uploadista-flow-engine",
): Layer.Layer<FlowObservability> => {
  const metrics = createFlowMetrics();

  return Layer.succeed(FlowObservability, {
    serviceName,
    enabled: true,
    metrics: {
      flowStarted: Metric.increment(metrics.flowStartedTotal),
      flowCompleted: Metric.increment(metrics.flowCompletedTotal),
      flowFailed: Metric.increment(metrics.flowFailedTotal),
      nodeExecuted: Metric.increment(metrics.nodeExecutedTotal),
    },
  });
};

/**
 * Default live flow observability layer
 */
export const FlowObservabilityLive = makeFlowObservabilityLive();

/**
 * No-op flow observability layer (for testing or disabled observability)
 */
export const FlowObservabilityDisabled = makeFlowObservabilityLayer(false);

/**
 * Helper to get flow metrics from context
 */
export const getFlowMetrics = Effect.gen(function* () {
  const obs = yield* FlowObservability;
  return obs.metrics;
});

/**
 * Helper to track flow duration
 */
export const withFlowDuration = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const metrics = createFlowMetrics();
  return Effect.gen(function* () {
    const startTime = Date.now();
    const result = yield* effect;
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    yield* Metric.update(metrics.flowDurationHistogram, duration);
    yield* Metric.update(metrics.flowLatencySummary, duration);
    return result;
  }).pipe(Effect.withSpan("flow-execution"));
};

/**
 * Helper to track node duration
 */
export const withNodeDuration = <A, E, R>(
  nodeId: string,
  nodeType: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const metrics = createFlowMetrics();
  return Effect.gen(function* () {
    const startTime = Date.now();
    const result = yield* effect;
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    yield* Metric.update(metrics.nodeDurationHistogram, duration);
    yield* Metric.update(metrics.nodeLatencySummary, duration);
    return result;
  }).pipe(
    Effect.withSpan(`node-${nodeType}`, {
      attributes: {
        "node.id": nodeId,
        "node.type": nodeType,
      },
    }),
  );
};

/**
 * Helper to track active flows
 */
export const trackActiveFlow = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const metrics = createFlowMetrics();
  return Effect.gen(function* () {
    // Increment active flows
    yield* Metric.increment(metrics.activeFlowsGauge);

    // Use acquireUseRelease for proper cleanup
    return yield* Effect.acquireUseRelease(
      Effect.void,
      () => effect,
      () => Metric.set(metrics.activeFlowsGauge, -1),
    );
  });
};

/**
 * Helper to track active nodes
 */
export const trackActiveNode = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const metrics = createFlowMetrics();
  return Effect.gen(function* () {
    // Increment active nodes
    yield* Metric.increment(metrics.activeNodesGauge);

    // Use acquireUseRelease for proper cleanup
    return yield* Effect.acquireUseRelease(
      Effect.void,
      () => effect,
      () => Metric.set(metrics.activeNodesGauge, -1),
    );
  });
};
