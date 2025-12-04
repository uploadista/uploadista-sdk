/**
 * OpenTelemetry trace context types for distributed tracing.
 *
 * These types enable trace context propagation across HTTP requests,
 * allowing spans from multiple requests to be grouped under a single trace.
 *
 * @module observability/core/types
 */

/**
 * Trace context for distributed tracing.
 *
 * This structure holds the essential OpenTelemetry trace context that needs
 * to be persisted and propagated across requests to maintain trace continuity.
 *
 * @property traceId - 128-bit unique identifier for the entire trace (32 hex chars)
 * @property spanId - 64-bit unique identifier for the parent span (16 hex chars)
 * @property traceFlags - Sampling decision (1 = sampled, 0 = not sampled)
 *
 * @example
 * ```typescript
 * // Store trace context with upload metadata
 * const traceContext: TraceContext = {
 *   traceId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
 *   spanId: "a1b2c3d4e5f6a1b2",
 *   traceFlags: 1
 * };
 *
 * // Later, restore context to link spans
 * if (uploadFile.traceContext) {
 *   yield* withParentContext(uploadFile.traceContext)(
 *     Effect.withSpan("upload-chunk", { ... })(chunkEffect)
 *   );
 * }
 * ```
 */
export type TraceContext = {
  /** 128-bit trace identifier (32 hex characters) */
  traceId: string;
  /** 64-bit span identifier (16 hex characters) */
  spanId: string;
  /** Trace flags (1 = sampled) */
  traceFlags: number;
};
