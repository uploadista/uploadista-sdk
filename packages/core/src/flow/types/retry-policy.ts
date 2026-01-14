/**
 * Retry policy types for the Dead Letter Queue.
 *
 * Defines configurable retry strategies including immediate, fixed delay,
 * and exponential backoff with jitter.
 *
 * @module flow/types/retry-policy
 * @see {@link DeadLetterQueueService} for DLQ operations
 */

/**
 * Immediate retry strategy - retry as soon as possible.
 *
 * Use for errors that are likely transient and may succeed on immediate retry.
 */
export interface ImmediateBackoff {
  type: "immediate";
}

/**
 * Fixed delay retry strategy - wait a fixed duration between retries.
 *
 * @property delayMs - Milliseconds to wait between retries
 *
 * @example
 * ```typescript
 * const fixedBackoff: FixedBackoff = {
 *   type: "fixed",
 *   delayMs: 5000 // Wait 5 seconds between retries
 * };
 * ```
 */
export interface FixedBackoff {
  type: "fixed";
  /** Milliseconds to wait between retries */
  delayMs: number;
}

/**
 * Exponential backoff retry strategy - progressively longer delays.
 *
 * Delay = min(initialDelayMs * (multiplier ^ retryCount), maxDelayMs)
 * With optional jitter to prevent thundering herd.
 *
 * @property initialDelayMs - Starting delay in milliseconds (e.g., 1000)
 * @property maxDelayMs - Maximum delay cap in milliseconds (e.g., 300000)
 * @property multiplier - Multiplication factor per retry (e.g., 2)
 * @property jitter - Add randomness to prevent thundering herd
 *
 * @example
 * ```typescript
 * const exponentialBackoff: ExponentialBackoff = {
 *   type: "exponential",
 *   initialDelayMs: 1000,   // Start with 1 second
 *   maxDelayMs: 300000,     // Cap at 5 minutes
 *   multiplier: 2,          // Double each time
 *   jitter: true            // Add randomness
 * };
 * // Delays: ~1s, ~2s, ~4s, ~8s, ..., capped at ~5min
 * ```
 */
export interface ExponentialBackoff {
  type: "exponential";
  /** Starting delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay cap in milliseconds */
  maxDelayMs: number;
  /** Multiplication factor per retry (e.g., 2 for doubling) */
  multiplier: number;
  /** Add randomness to prevent thundering herd */
  jitter: boolean;
}

/**
 * Union type for all backoff strategies.
 */
export type BackoffStrategy =
  | ImmediateBackoff
  | FixedBackoff
  | ExponentialBackoff;

/**
 * Configuration for automatic retry behavior.
 *
 * Defines how failed jobs should be retried, including backoff strategy,
 * max attempts, and error filtering.
 *
 * @property enabled - Whether automatic retry is enabled (default: true)
 * @property maxRetries - Maximum retry attempts (default: 3)
 * @property backoff - Backoff strategy configuration
 * @property retryableErrors - Only retry these error codes (default: all)
 * @property nonRetryableErrors - Never retry these error codes
 * @property ttlMs - Auto-delete items after this time (default: 7 days)
 *
 * @example
 * ```typescript
 * // Conservative retry policy for external APIs
 * const apiRetryPolicy: RetryPolicy = {
 *   enabled: true,
 *   maxRetries: 5,
 *   backoff: {
 *     type: "exponential",
 *     initialDelayMs: 1000,
 *     maxDelayMs: 60000,
 *     multiplier: 2,
 *     jitter: true
 *   },
 *   nonRetryableErrors: ["VALIDATION_ERROR", "AUTH_ERROR"],
 *   ttlMs: 604800000 // 7 days
 * };
 *
 * // Aggressive retry for transient failures
 * const transientRetryPolicy: RetryPolicy = {
 *   enabled: true,
 *   maxRetries: 3,
 *   backoff: { type: "immediate" },
 *   retryableErrors: ["NETWORK_ERROR", "TIMEOUT_ERROR"]
 * };
 *
 * // No automatic retry, manual intervention only
 * const manualPolicy: RetryPolicy = {
 *   enabled: false,
 *   maxRetries: 0,
 *   backoff: { type: "immediate" }
 * };
 * ```
 */
export interface RetryPolicy {
  /** Whether automatic retry is enabled (default: true) */
  enabled: boolean;
  /** Maximum retry attempts (default: 3) */
  maxRetries: number;
  /** Backoff strategy configuration */
  backoff: BackoffStrategy;
  /** Only retry these error codes. If undefined, retry all errors. */
  retryableErrors?: string[];
  /** Never retry these error codes. Takes precedence over retryableErrors. */
  nonRetryableErrors?: string[];
  /** Auto-delete items after this time in milliseconds (default: 7 days) */
  ttlMs?: number;
}

/**
 * Default retry policy values.
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  enabled: true,
  maxRetries: 3,
  backoff: {
    type: "exponential",
    initialDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    multiplier: 2,
    jitter: true,
  },
  ttlMs: 604800000, // 7 days
};

/**
 * Calculates the next retry delay based on the backoff strategy.
 *
 * @param backoff - The backoff strategy configuration
 * @param retryCount - Current retry attempt number (0-based)
 * @returns Delay in milliseconds before the next retry
 *
 * @example
 * ```typescript
 * const delay = calculateBackoffDelay(
 *   { type: "exponential", initialDelayMs: 1000, maxDelayMs: 60000, multiplier: 2, jitter: true },
 *   2 // Third attempt
 * );
 * // Returns approximately 4000ms (1000 * 2^2) with jitter
 * ```
 */
export function calculateBackoffDelay(
  backoff: BackoffStrategy,
  retryCount: number,
): number {
  switch (backoff.type) {
    case "immediate":
      return 0;

    case "fixed":
      return backoff.delayMs;

    case "exponential": {
      const baseDelay =
        backoff.initialDelayMs * backoff.multiplier ** retryCount;
      const cappedDelay = Math.min(baseDelay, backoff.maxDelayMs);

      if (backoff.jitter) {
        // Add random jitter: 0.5x to 1.5x of the calculated delay
        const jitterFactor = 0.5 + Math.random();
        return Math.floor(cappedDelay * jitterFactor);
      }

      return cappedDelay;
    }

    default:
      return 0;
  }
}

/**
 * Determines if an error should be retried based on the retry policy.
 *
 * @param errorCode - The error code to check
 * @param policy - The retry policy configuration
 * @returns true if the error should be retried
 *
 * @example
 * ```typescript
 * const policy: RetryPolicy = {
 *   enabled: true,
 *   maxRetries: 3,
 *   backoff: { type: "immediate" },
 *   nonRetryableErrors: ["VALIDATION_ERROR"]
 * };
 *
 * isErrorRetryable("NETWORK_ERROR", policy); // true
 * isErrorRetryable("VALIDATION_ERROR", policy); // false
 * ```
 */
export function isErrorRetryable(
  errorCode: string,
  policy: RetryPolicy,
): boolean {
  // Check if policy is enabled
  if (!policy.enabled) {
    return false;
  }

  // Non-retryable errors take precedence
  if (policy.nonRetryableErrors?.includes(errorCode)) {
    return false;
  }

  // If retryableErrors is specified, only those are retryable
  if (policy.retryableErrors && policy.retryableErrors.length > 0) {
    return policy.retryableErrors.includes(errorCode);
  }

  // By default, all errors are retryable
  return true;
}

/**
 * Calculates the expiration date for a DLQ item.
 *
 * @param createdAt - When the item was created
 * @param ttlMs - Time to live in milliseconds
 * @returns The expiration date, or undefined if no TTL
 */
export function calculateExpirationDate(
  createdAt: Date,
  ttlMs?: number,
): Date | undefined {
  if (ttlMs === undefined || ttlMs <= 0) {
    return undefined;
  }
  return new Date(createdAt.getTime() + ttlMs);
}
