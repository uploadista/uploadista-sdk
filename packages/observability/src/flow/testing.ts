import { Effect, Layer } from "effect";
import type { FlowObservabilityService } from "../core/layers.js";
import { FlowObservability } from "../core/layers.js";

// ============================================================================
// Test Flow Observability Layers
// ============================================================================

/**
 * Mock flow observability for testing
 */
export const makeTestFlowObservability = (): Layer.Layer<FlowObservability> => {
  const service: FlowObservabilityService = {
    serviceName: "test-flow-engine",
    enabled: true,
    metrics: {
      flowStarted: Effect.void,
      flowCompleted: Effect.void,
      flowFailed: Effect.void,
      nodeExecuted: Effect.void,
    },
  };
  return Layer.succeed(FlowObservability, service);
};

/**
 * Run an effect with test flow observability
 */
export const runWithTestFlowObservability = <A, E>(
  effect: Effect.Effect<A, E, FlowObservability>,
): Effect.Effect<A, E> => {
  return effect.pipe(Effect.provide(makeTestFlowObservability()));
};
