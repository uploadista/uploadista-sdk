/**
 * Flow Queue item types and configuration.
 *
 * A FlowQueueItem represents a queued flow execution request, tracking its
 * lifecycle from pending → running → completed | failed.
 *
 * @module flow/types/flow-queue-item
 * @see {@link FlowQueueService} for queue operations
 */

/**
 * Status of a flow queue item.
 *
 * Item lifecycle: pending → running → completed | failed
 *
 * - `pending`: Waiting for a concurrency slot to become available
 * - `running`: Currently being executed by the flow engine
 * - `completed`: Flow execution finished successfully
 * - `failed`: Flow execution ended with an error
 */
export type FlowQueueItemStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

/**
 * Represents a single queued flow execution request.
 *
 * FlowQueueItems are created when a caller enqueues a flow for execution.
 * The worker loop picks up pending items, transitions them to running, and
 * dispatches them to FlowEngine. On completion or failure the item is updated.
 *
 * @property id - Unique queue item identifier (UUID)
 * @property flowId - The flow definition to execute
 * @property storageId - Target storage for flow outputs
 * @property input - Original input payload passed to the flow
 * @property clientId - Client who initiated the request (null for anonymous)
 * @property status - Current lifecycle status of the queue item
 * @property dlqItemId - Set when this item is a DLQ retry; links back to the DLQ item
 * @property enqueuedAt - When the item was added to the queue
 * @property startedAt - When the worker started executing this item
 * @property completedAt - When execution finished (success or failure)
 * @property error - Error message recorded if status is "failed"
 *
 * @example
 * ```typescript
 * const item: FlowQueueItem = {
 *   id: "q_abc123",
 *   flowId: "image-resize-pipeline",
 *   storageId: "s3-production",
 *   input: { input: { uploadId: "upload_xyz" } },
 *   clientId: "client_456",
 *   status: "pending",
 *   enqueuedAt: new Date(),
 * };
 * ```
 */
export interface FlowQueueItem {
  /** Unique queue item identifier (UUID) */
  id: string;
  /** The flow definition to execute */
  flowId: string;
  /** Target storage for flow outputs */
  storageId: string;
  /** Original input payload passed to the flow */
  input: unknown;
  /** Client who initiated the request (null for anonymous) */
  clientId: string | null;
  /** Current lifecycle status */
  status: FlowQueueItemStatus;
  /** Set when this is a DLQ retry; references the DLQ item for result correlation */
  dlqItemId?: string;
  /** When the item was added to the queue */
  enqueuedAt: Date;
  /** When the worker began executing this item */
  startedAt?: Date;
  /** When execution finished (success or failure) */
  completedAt?: Date;
  /** Error message if status is "failed" */
  error?: string;
}

/**
 * Aggregate statistics about the flow queue.
 *
 * Provides counts by status and concurrency information for monitoring.
 *
 * @property pending - Number of items waiting for a concurrency slot
 * @property running - Number of items currently being executed
 * @property completed - Number of items that finished successfully
 * @property failed - Number of items that ended with an error
 * @property maxConcurrency - Configured maximum simultaneous executions
 * @property currentConcurrency - Number of items currently running
 */
export interface FlowQueueStats {
  /** Number of items waiting for a concurrency slot */
  pending: number;
  /** Number of items currently being executed */
  running: number;
  /** Number of items that finished successfully */
  completed: number;
  /** Number of items that ended with an error */
  failed: number;
  /** Configured maximum simultaneous executions */
  maxConcurrency: number;
  /** Number of items currently running */
  currentConcurrency: number;
}

/**
 * Configuration options for the FlowQueueService.
 *
 * All fields are optional; defaults are applied via DEFAULT_QUEUE_CONFIG.
 *
 * @property maxConcurrency - Maximum number of simultaneously running flows (default: 4)
 * @property dlqRetryIntervalMs - How often the DLQ retry loop fires in milliseconds (default: 30_000)
 * @property dlqRetryBatchSize - Maximum DLQ items processed per retry loop tick (default: 10)
 *
 * @example
 * ```typescript
 * const config: FlowQueueConfig = {
 *   maxConcurrency: 8,
 *   dlqRetryIntervalMs: 60_000, // check every 60 seconds
 *   dlqRetryBatchSize: 5,
 * };
 * ```
 */
export interface FlowQueueConfig {
  /**
   * Maximum number of simultaneously running flows.
   * Flows beyond this limit remain pending until a slot opens.
   * @default 4
   */
  maxConcurrency?: number;
  /**
   * Interval in milliseconds between DLQ retry loop ticks.
   * Only relevant when DeadLetterQueueService is present.
   * @default 30_000
   */
  dlqRetryIntervalMs?: number;
  /**
   * Maximum number of DLQ items to re-enqueue per retry loop tick.
   * @default 10
   */
  dlqRetryBatchSize?: number;
}

/**
 * Default configuration values for FlowQueueService.
 *
 * Applied when specific config fields are omitted.
 */
export const DEFAULT_QUEUE_CONFIG: Required<FlowQueueConfig> = {
  maxConcurrency: 4,
  dlqRetryIntervalMs: 30_000,
  dlqRetryBatchSize: 10,
};
