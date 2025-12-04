/**
 * Dead Letter Queue item types and definitions.
 *
 * A DeadLetterItem represents a failed flow job that has been captured
 * for later retry, debugging, or manual intervention.
 *
 * @module flow/types/dead-letter-item
 * @see {@link DeadLetterQueueService} for DLQ operations
 */

/**
 * Status of a Dead Letter Queue item.
 *
 * Item lifecycle: pending → retrying → (pending | exhausted | resolved)
 *
 * - `pending`: Awaiting retry (either scheduled or manual)
 * - `retrying`: Currently being retried
 * - `exhausted`: Max retries reached, requires manual intervention
 * - `resolved`: Successfully retried or manually resolved
 */
export type DeadLetterItemStatus =
  | "pending"
  | "retrying"
  | "exhausted"
  | "resolved";

/**
 * Error details captured when a flow job fails.
 *
 * Contains comprehensive error information for debugging and retry decisions.
 *
 * @property code - Error code (e.g., "FLOW_NODE_ERROR", "VALIDATION_ERROR")
 * @property message - Human-readable error message
 * @property nodeId - ID of the node that failed (if applicable)
 * @property stack - Stack trace (included in development mode)
 */
export interface DeadLetterError {
  /** Error code for categorization and retry filtering */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Node that failed (if applicable) */
  nodeId?: string;
  /** Stack trace (in dev mode only) */
  stack?: string;
}

/**
 * Record of a single retry attempt.
 *
 * @property attemptedAt - When the retry was attempted
 * @property error - Error message if the retry failed
 * @property durationMs - How long the retry took
 */
export interface DeadLetterRetryAttempt {
  /** When the retry was attempted */
  attemptedAt: Date;
  /** Error message if the retry failed */
  error: string;
  /** Duration of the retry attempt in milliseconds */
  durationMs: number;
}

/**
 * Represents a failed flow job captured in the Dead Letter Queue.
 *
 * Contains all information needed to debug, retry, or manually resolve
 * a failed flow execution.
 *
 * @property id - Unique DLQ item identifier
 * @property jobId - Original flow job ID that failed
 * @property flowId - Flow definition that was being executed
 * @property storageId - Target storage for the flow
 * @property clientId - Client who initiated the job
 * @property error - Comprehensive error details
 * @property inputs - Original inputs passed to the flow
 * @property nodeResults - Partial results from nodes that completed before failure
 * @property failedAtNodeId - Node where execution failed (if applicable)
 * @property retryCount - Number of retry attempts made
 * @property maxRetries - Maximum retries allowed from retry policy
 * @property nextRetryAt - Scheduled time for next automatic retry
 * @property retryHistory - History of all retry attempts
 * @property createdAt - When the item was added to DLQ
 * @property updatedAt - When the item was last modified
 * @property expiresAt - TTL for automatic cleanup
 * @property status - Current status of the DLQ item
 *
 * @example
 * ```typescript
 * const dlqItem: DeadLetterItem = {
 *   id: "dlq_abc123",
 *   jobId: "job_xyz789",
 *   flowId: "image-resize-pipeline",
 *   storageId: "s3-production",
 *   clientId: "client_456",
 *   error: {
 *     code: "FLOW_NODE_ERROR",
 *     message: "External service timeout",
 *     nodeId: "resize-node"
 *   },
 *   inputs: { input: { uploadId: "upload_123" } },
 *   nodeResults: { "input-node": { file: {...} } },
 *   failedAtNodeId: "resize-node",
 *   retryCount: 2,
 *   maxRetries: 3,
 *   nextRetryAt: new Date("2024-01-15T10:35:00Z"),
 *   retryHistory: [
 *     { attemptedAt: new Date("2024-01-15T10:30:00Z"), error: "Timeout", durationMs: 5000 },
 *     { attemptedAt: new Date("2024-01-15T10:32:00Z"), error: "Timeout", durationMs: 5000 }
 *   ],
 *   createdAt: new Date("2024-01-15T10:30:00Z"),
 *   updatedAt: new Date("2024-01-15T10:32:00Z"),
 *   expiresAt: new Date("2024-01-22T10:30:00Z"),
 *   status: "pending"
 * };
 * ```
 */
export interface DeadLetterItem {
  /** Unique DLQ item identifier */
  id: string;
  /** Original flow job ID that failed */
  jobId: string;
  /** Flow definition ID that was being executed */
  flowId: string;
  /** Target storage for the flow */
  storageId: string;
  /** Client who initiated the job (null for anonymous) */
  clientId: string | null;

  /** Comprehensive error details */
  error: DeadLetterError;

  /** Original inputs passed to the flow */
  inputs: Record<string, unknown>;
  /** Partial results from nodes that completed before failure */
  nodeResults: Record<string, unknown>;
  /** Node where execution failed (if applicable) */
  failedAtNodeId?: string;

  /** Number of retry attempts made */
  retryCount: number;
  /** Maximum retries allowed from retry policy */
  maxRetries: number;
  /** Scheduled time for next automatic retry */
  nextRetryAt?: Date;
  /** History of all retry attempts */
  retryHistory: DeadLetterRetryAttempt[];

  /** When the item was added to DLQ */
  createdAt: Date;
  /** When the item was last modified */
  updatedAt: Date;
  /** TTL for automatic cleanup */
  expiresAt?: Date;
  /** Current status of the DLQ item */
  status: DeadLetterItemStatus;
}

/**
 * Statistics about the Dead Letter Queue.
 *
 * Provides aggregate information for monitoring and alerting.
 *
 * @property totalItems - Total number of items in the DLQ
 * @property byStatus - Count of items by status
 * @property byFlow - Count of items by flow ID
 * @property oldestItem - Timestamp of the oldest item
 * @property averageRetryCount - Average number of retries across all items
 */
export interface DeadLetterQueueStats {
  /** Total number of items in the DLQ */
  totalItems: number;
  /** Count of items by status */
  byStatus: Record<DeadLetterItemStatus, number>;
  /** Count of items by flow ID */
  byFlow: Record<string, number>;
  /** Timestamp of the oldest item */
  oldestItem?: Date;
  /** Average number of retries across all items */
  averageRetryCount: number;
}

/**
 * Options for listing DLQ items.
 *
 * @property status - Filter by status
 * @property flowId - Filter by flow ID
 * @property clientId - Filter by client ID
 * @property limit - Maximum items to return (default: 50)
 * @property offset - Number of items to skip (default: 0)
 */
export interface DeadLetterListOptions {
  /** Filter by status */
  status?: DeadLetterItemStatus;
  /** Filter by flow ID */
  flowId?: string;
  /** Filter by client ID */
  clientId?: string;
  /** Maximum items to return (default: 50) */
  limit?: number;
  /** Number of items to skip for pagination (default: 0) */
  offset?: number;
}

/**
 * Result of a batch retry operation.
 *
 * @property retried - Number of items that were retried
 * @property succeeded - Number of retries that succeeded
 * @property failed - Number of retries that failed
 */
export interface DeadLetterRetryAllResult {
  /** Number of items that were retried */
  retried: number;
  /** Number of retries that succeeded */
  succeeded: number;
  /** Number of retries that failed */
  failed: number;
}

/**
 * Result of a cleanup operation.
 *
 * @property deleted - Number of items that were deleted
 */
export interface DeadLetterCleanupResult {
  /** Number of items that were deleted */
  deleted: number;
}

/**
 * Options for cleanup operation.
 *
 * @property olderThan - Delete items older than this date
 * @property status - Only delete items with this status
 */
export interface DeadLetterCleanupOptions {
  /** Delete items older than this date */
  olderThan?: Date;
  /** Only delete items with this status */
  status?: "exhausted" | "resolved";
}

/**
 * Result of processing scheduled retries.
 *
 * @property processed - Total items processed
 * @property succeeded - Number that succeeded
 * @property failed - Number that failed
 */
export interface DeadLetterProcessResult {
  /** Total items processed */
  processed: number;
  /** Number of successful retries */
  succeeded: number;
  /** Number of failed retries */
  failed: number;
}
