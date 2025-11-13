/**
 * Flow execution event types and definitions.
 *
 * This module defines the event system used to monitor and track flow execution.
 * Events are emitted at various stages of flow and node execution, allowing
 * real-time monitoring, logging, and WebSocket updates to clients.
 *
 * @module flow/event
 * @see {@link FlowEvent} for the union of all event types
 */

import type { NodeType } from "./node";
import type { TypedOutput } from "./types/flow-types";

/**
 * Enumeration of all possible flow and node execution event types.
 *
 * Events follow a lifecycle pattern:
 * - Job level: JobStart → ... → JobEnd
 * - Flow level: FlowStart → ... → (FlowEnd | FlowError)
 * - Node level: NodeStart → ... → (NodeEnd | NodePause | NodeError)
 *
 * @example
 * ```typescript
 * // Listen for flow completion
 * if (event.eventType === EventType.FlowEnd) {
 *   console.log("Flow completed:", event.result);
 * }
 * ```
 */
export enum EventType {
  /** Emitted when a job starts execution */
  JobStart = "job-start",
  /** Emitted when a job completes (success or failure) */
  JobEnd = "job-end",
  /** Emitted when a flow begins execution */
  FlowStart = "flow-start",
  /** Emitted when a flow completes successfully */
  FlowEnd = "flow-end",
  /** Emitted when a flow encounters an error */
  FlowError = "flow-error",
  /** Emitted when a flow is paused by user request */
  FlowPause = "flow-pause",
  /** Emitted when a flow is cancelled by user request */
  FlowCancel = "flow-cancel",
  /** Emitted when a node starts processing */
  NodeStart = "node-start",
  /** Emitted when a node completes successfully */
  NodeEnd = "node-end",
  /** Emitted when a node pauses (waiting for additional data) */
  NodePause = "node-pause",
  /** Emitted when a paused node resumes execution */
  NodeResume = "node-resume",
  /** Emitted when a node encounters an error */
  NodeError = "node-error",
  /** Emitted for streaming node data (e.g., progress updates) */
  NodeStream = "node-stream",
  /** Emitted for node response data */
  NodeResponse = "node-response",
}

/**
 * Event emitted when a job starts execution.
 */
export type FlowEventJobStart = {
  jobId: string;
  eventType: EventType.JobStart;
};

/**
 * Event emitted when a job completes (either successfully or with failure).
 */
export type FlowEventJobEnd = {
  jobId: string;
  eventType: EventType.JobEnd;
};

/**
 * Event emitted when a flow begins execution.
 * This is the first event after JobStart in the execution lifecycle.
 */
export type FlowEventFlowStart = {
  jobId: string;
  flowId: string;
  eventType: EventType.FlowStart;
};

/**
 * Event emitted when a flow completes successfully.
 *
 * @property outputs - Array of typed outputs from all output nodes in the flow
 * @property result - Legacy field for backward compatibility (deprecated, use outputs instead)
 *
 * @remarks
 * The `outputs` field contains an array of TypedOutput objects, each with:
 * - nodeId: The specific node that produced the output
 * - nodeType: The registered type ID (e.g., "storage-output-v1")
 * - data: The actual output data
 * - timestamp: When the output was produced
 *
 * @example
 * ```typescript
 * // Handle flow completion with typed outputs
 * if (event.eventType === EventType.FlowEnd && event.outputs) {
 *   for (const output of event.outputs) {
 *     console.log(`${output.nodeId} (${output.nodeType}):`, output.data);
 *   }
 * }
 * ```
 */
export type FlowEventFlowEnd = {
  jobId: string;
  flowId: string;
  eventType: EventType.FlowEnd;
  outputs?: TypedOutput[]; // Typed outputs from all output nodes
  result?: unknown; // Legacy field (deprecated, use outputs instead)
};

/**
 * Event emitted when a flow encounters an unrecoverable error.
 *
 * @property error - Error message describing what went wrong
 */
export type FlowEventFlowError = {
  jobId: string;
  flowId: string;
  eventType: EventType.FlowError;
  error: string;
};

/**
 * Event emitted when a flow is paused by user request.
 *
 * Unlike NodePause which occurs when a node needs more data,
 * this event is triggered by an explicit user action to pause the flow.
 */
export type FlowEventFlowPause = {
  jobId: string;
  flowId: string;
  eventType: EventType.FlowPause;
  pausedAt?: string; // nodeId where execution was paused
};

/**
 * Event emitted when a flow is cancelled by user request.
 *
 * Cancelled flows will clean up intermediate files and stop execution.
 */
export type FlowEventFlowCancel = {
  jobId: string;
  flowId: string;
  eventType: EventType.FlowCancel;
};

/**
 * Event emitted when a node begins processing.
 *
 * @property nodeName - Human-readable node name
 * @property nodeType - Type of node (input, transform, conditional, output, etc.)
 */
export type FlowEventNodeStart = {
  jobId: string;
  flowId: string;
  nodeId: string;
  eventType: EventType.NodeStart;
  nodeName: string;
  nodeType: NodeType;
};

/**
 * Event emitted when a node fails after all retry attempts.
 *
 * @property error - Error message from the failed execution
 * @property retryCount - Number of retry attempts made before giving up
 */
export type FlowEventNodeError = {
  jobId: string;
  flowId: string;
  nodeId: string;
  nodeName: string;
  eventType: EventType.NodeError;
  error: string;
  retryCount?: number; // Number of retries attempted before failure
};

/**
 * Event emitted when a node completes successfully.
 *
 * @property result - The typed output data produced by the node
 *
 * @remarks
 * For output nodes, the result will be a TypedOutput containing type information.
 * For other nodes, it may be untyped (nodeType will be undefined).
 */
export type FlowEventNodeEnd = {
  jobId: string;
  flowId: string;
  nodeId: string;
  eventType: EventType.NodeEnd;
  nodeName: string;
  result?: TypedOutput | unknown; // Typed output for output nodes, or untyped for others
};

/**
 * Event emitted when a node pauses execution, waiting for additional data.
 *
 * This typically occurs with input nodes that need more chunks or nodes
 * waiting for external services.
 *
 * @property partialData - Any partial result available before pausing
 */
export type FlowEventNodePause = {
  jobId: string;
  flowId: string;
  nodeId: string;
  eventType: EventType.NodePause;
  nodeName: string;
  partialData?: unknown; // Partial result from waiting node
};

/**
 * Event emitted when a paused node resumes execution.
 *
 * This occurs after providing the additional data needed by a paused node.
 */
export type FlowEventNodeResume = {
  jobId: string;
  flowId: string;
  nodeId: string;
  eventType: EventType.NodeResume;
  nodeName: string;
  nodeType: NodeType;
};

/**
 * Event emitted for node-specific response data.
 *
 * Used for streaming intermediate results or progress updates.
 */
export type FlowEventNodeResponse = {
  jobId: string;
  flowId: string;
  nodeId: string;
  eventType: EventType.NodeResponse;
  nodeName: string;
  data: unknown;
};

/**
 * Union of all possible flow execution events.
 *
 * This discriminated union allows type-safe event handling based on eventType.
 *
 * @example
 * ```typescript
 * function handleFlowEvent(event: FlowEvent) {
 *   switch (event.eventType) {
 *     case EventType.FlowStart:
 *       console.log("Flow started:", event.flowId);
 *       break;
 *     case EventType.NodeEnd:
 *       console.log("Node completed:", event.nodeName, event.result);
 *       break;
 *     case EventType.FlowError:
 *       console.error("Flow failed:", event.error);
 *       break;
 *     case EventType.FlowCancel:
 *       console.log("Flow cancelled:", event.flowId);
 *       break;
 *   }
 * }
 * ```
 */
export type FlowEvent =
  | FlowEventJobStart
  | FlowEventJobEnd
  | FlowEventFlowStart
  | FlowEventFlowEnd
  | FlowEventFlowError
  | FlowEventFlowPause
  | FlowEventFlowCancel
  | FlowEventNodeStart
  | FlowEventNodeEnd
  | FlowEventNodePause
  | FlowEventNodeResume
  | FlowEventNodeError;
