import { Metric, MetricBoundaries } from "effect";

// ============================================================================
// Flow Engine Metrics
// ============================================================================

/**
 * Flow engine metrics for tracking flow execution operations
 */
export const createFlowMetrics = () => ({
  // Counter metrics
  flowStartedTotal: Metric.counter("flow_started_total", {
    description: "Total number of flows started",
  }),

  flowCompletedTotal: Metric.counter("flow_completed_total", {
    description: "Total number of flows completed successfully",
  }),

  flowFailedTotal: Metric.counter("flow_failed_total", {
    description: "Total number of flows that failed",
  }),

  flowPausedTotal: Metric.counter("flow_paused_total", {
    description: "Total number of flows that were paused",
  }),

  flowResumedTotal: Metric.counter("flow_resumed_total", {
    description: "Total number of flows that were resumed",
  }),

  nodeExecutedTotal: Metric.counter("node_executed_total", {
    description: "Total number of nodes executed",
  }),

  nodeSuccessTotal: Metric.counter("node_success_total", {
    description: "Total number of nodes executed successfully",
  }),

  nodeFailedTotal: Metric.counter("node_failed_total", {
    description: "Total number of nodes that failed",
  }),

  nodeSkippedTotal: Metric.counter("node_skipped_total", {
    description: "Total number of nodes skipped (conditional)",
  }),

  // Histogram metrics
  flowDurationHistogram: Metric.histogram(
    "flow_duration_seconds",
    MetricBoundaries.exponential({
      start: 0.1, // 100ms
      factor: 2,
      count: 20, // Up to ~100 seconds
    }),
    "Duration of complete flow execution in seconds",
  ),

  nodeDurationHistogram: Metric.histogram(
    "node_duration_seconds",
    MetricBoundaries.exponential({
      start: 0.01, // 10ms
      factor: 2,
      count: 18, // Up to ~26 seconds
    }),
    "Duration of individual node execution in seconds",
  ),

  flowNodeCountHistogram: Metric.histogram(
    "flow_node_count",
    MetricBoundaries.linear({
      start: 1,
      width: 5,
      count: 20, // Up to 100 nodes
    }),
    "Number of nodes in a flow",
  ),

  parallelNodesHistogram: Metric.histogram(
    "parallel_nodes_count",
    MetricBoundaries.linear({
      start: 1,
      width: 2,
      count: 15, // Up to 30 parallel nodes
    }),
    "Number of nodes executed in parallel",
  ),

  // Gauge metrics
  activeFlowsGauge: Metric.gauge("active_flows", {
    description: "Number of currently active flows",
  }),

  activeNodesGauge: Metric.gauge("active_nodes", {
    description: "Number of currently executing nodes",
  }),

  pausedFlowsGauge: Metric.gauge("paused_flows", {
    description: "Number of currently paused flows",
  }),

  // Summary metrics for latency percentiles
  flowLatencySummary: Metric.summary({
    name: "flow_latency_seconds",
    maxAge: "10 minutes",
    maxSize: 1000,
    error: 0.01,
    quantiles: [0.5, 0.9, 0.95, 0.99],
    description: "Flow execution latency percentiles",
  }),

  nodeLatencySummary: Metric.summary({
    name: "node_latency_seconds",
    maxAge: "10 minutes",
    maxSize: 1000,
    error: 0.01,
    quantiles: [0.5, 0.9, 0.95, 0.99],
    description: "Node execution latency percentiles",
  }),

  // ============================================================================
  // Circuit Breaker Metrics
  // ============================================================================

  /** Total number of times circuit breakers opened */
  circuitBreakerOpenTotal: Metric.counter("circuit_breaker_open_total", {
    description: "Total number of times circuit breakers transitioned to open state",
  }),

  /** Total number of times circuit breakers closed */
  circuitBreakerCloseTotal: Metric.counter("circuit_breaker_close_total", {
    description: "Total number of times circuit breakers transitioned to closed state",
  }),

  /** Total number of requests rejected by open circuit breakers */
  circuitBreakerRejectedTotal: Metric.counter("circuit_breaker_rejected_total", {
    description: "Total number of requests rejected because circuit breaker is open",
  }),

  /** Total number of times circuit breakers transitioned to half-open */
  circuitBreakerHalfOpenTotal: Metric.counter("circuit_breaker_half_open_total", {
    description: "Total number of times circuit breakers transitioned to half-open state",
  }),

  /** Current state of circuit breakers (0=closed, 1=open, 2=half-open) */
  circuitBreakerStateGauge: Metric.gauge("circuit_breaker_state", {
    description: "Current circuit breaker state (0=closed, 1=open, 2=half-open)",
  }),

  /** Number of failures in circuit breaker sliding window */
  circuitBreakerFailuresGauge: Metric.gauge("circuit_breaker_failures", {
    description: "Number of failures currently in the circuit breaker sliding window",
  }),
});

/**
 * Type for flow metrics
 */
export type FlowMetrics = ReturnType<typeof createFlowMetrics>;

/**
 * Default flow metrics instance
 */
export const flowMetrics = createFlowMetrics();
