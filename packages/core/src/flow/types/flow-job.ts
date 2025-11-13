/**
 * Flow job tracking and state management types.
 *
 * A FlowJob represents a single execution instance of a flow, tracking its progress,
 * node results, and execution state. Jobs can be paused and resumed, making them
 * suitable for long-running or interactive flows.
 *
 * @module flow/types/flow-job
 * @see {@link FlowServer} for job management operations
 */

import type { TypedOutput } from "./flow-types";

// import type { FlowData } from "@/flow";

/**
 * Status of an individual node within a flow job.
 *
 * Node tasks follow this lifecycle:
 * started → pending → running → (completed | paused | failed)
 */
export type FlowJobTaskStatus =
  | "started"
  | "pending"
  | "running"
  | "completed"
  | "paused"
  | "failed";

/**
 * Represents a single node's execution within a flow job.
 *
 * Tasks track individual node execution, storing results, errors, and retry information.
 * They allow monitoring of which nodes have completed and accessing intermediate results.
 *
 * @property nodeId - Unique identifier of the node this task represents
 * @property status - Current execution status of the node
 * @property result - Node execution result data (can be partial data if paused, or complete data if finished)
 * @property error - Error message if the node failed
 * @property retryCount - Number of retry attempts made before success or final failure
 * @property createdAt - When the task was created
 * @property updatedAt - When the task was last updated
 *
 * @remarks
 * The result field can contain:
 * - Partial/intermediate data when status is "paused" (unknown type)
 * - Complete data when status is "completed" (could be TypedOutput for output nodes)
 * - undefined when status is "pending", "running", "started", or "failed"
 *
 * For type-safe access to final outputs, use FlowJob.result instead, which contains
 * the array of TypedOutput from all output nodes.
 */
export type FlowJobTask = {
  nodeId: string;
  status: FlowJobTaskStatus;
  result?: unknown; // Can be partial data (paused) or complete data (completed)
  error?: string; // Error message from failed execution
  retryCount?: number; // Number of retry attempts made
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Represents a flow execution job with full state tracking.
 *
 * Jobs are created when a flow is executed and track the entire execution lifecycle.
 * They store node results, handle paused states, and manage cleanup of intermediate files.
 *
 * @property id - Unique job identifier (UUID)
 * @property flowId - The flow being executed
 * @property storageId - Storage location for file outputs
 * @property clientId - Client that initiated the job (for authorization)
 * @property status - Overall job status
 * @property createdAt - When the job was created
 * @property updatedAt - When the job was last updated
 * @property tasks - Array of node execution tasks
 * @property error - Error message if the job failed
 * @property endedAt - When the job completed or failed
 * @property result - Array of typed outputs from all output nodes (only set when completed)
 * @property pausedAt - Node ID where execution is paused (if applicable)
 * @property executionState - State needed to resume a paused flow
 * @property intermediateFiles - File IDs to cleanup after completion
 *
 * @remarks
 * - Jobs can be paused at nodes that return `{ type: "waiting" }`
 * - Paused jobs store execution state and can be resumed with new data
 * - Intermediate files from non-output nodes are automatically cleaned up
 * - Tasks are updated as nodes progress through their lifecycle
 * - The result field now contains an array of TypedOutput for all output nodes
 *
 * @example
 * ```typescript
 * // Create and monitor a job
 * const job = yield* flowServer.runFlow({
 *   flowId: "image-pipeline",
 *   storageId: "storage-1",
 *   inputs: { input: myFile }
 * });
 *
 * // Poll for status
 * const status = yield* flowServer.getJobStatus(job.id);
 * if (status.status === "completed") {
 *   // Access typed outputs
 *   console.log("Outputs:", status.result);
 *   for (const output of status.result || []) {
 *     console.log(`${output.nodeId} (${output.nodeType}):`, output.data);
 *   }
 * } else if (status.status === "paused") {
 *   // Resume with additional data
 *   yield* flowServer.resumeFlow({
 *     jobId: job.id,
 *     nodeId: status.pausedAt,
 *     newData: additionalChunk
 *   });
 * }
 * ```
 */
export type FlowJob = {
  id: string;
  flowId: string;
  storageId: string;
  clientId: string | null;
  status: FlowJobStatus;
  createdAt: Date;
  updatedAt: Date;
  tasks: FlowJobTask[];
  error?: string;
  endedAt?: Date;
  // Array of typed outputs from all output nodes (only populated when completed)
  result?: TypedOutput[];
  // Paused execution state
  pausedAt?: string; // nodeId where execution is paused
  executionState?: {
    executionOrder: string[]; // Topological sort order
    currentIndex: number; // Where we are in execution
    inputs: Record<string, unknown>; // Original inputs
  };
  // Intermediate files to cleanup after flow completion
  intermediateFiles?: string[]; // UploadFile IDs from non-output nodes
};

/**
 * Overall status of a flow job.
 *
 * Job lifecycle: started → running → (completed | failed | cancelled)
 * Or with pauses: started → running → paused → running → (completed | failed | cancelled)
 * User actions: running → paused (via pauseFlow) or running → cancelled (via cancelFlow)
 */
export type FlowJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "started"
  | "paused"
  | "cancelled";
