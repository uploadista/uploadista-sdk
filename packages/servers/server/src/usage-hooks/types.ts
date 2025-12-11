/**
 * Usage Hook Types
 *
 * Types for lifecycle hooks that fire during upload and flow processing.
 * Used for usage tracking, quota enforcement, and billing integration.
 */

import type { Effect } from "effect";

// ============================================================================
// Usage Hook Result Types
// ============================================================================

/**
 * Result of a usage hook that can abort processing.
 * Used by onUploadStart and onFlowStart hooks.
 */
export type UsageHookResult =
  | { readonly action: "continue" }
  | {
      readonly action: "abort";
      readonly reason: string;
      readonly code?: string;
    };

/**
 * Helper to create a continue result.
 */
export const continueResult = (): UsageHookResult => ({ action: "continue" });

/**
 * Helper to create an abort result.
 */
export const abortResult = (
  reason: string,
  code?: string,
): UsageHookResult => ({
  action: "abort",
  reason,
  code,
});

// ============================================================================
// Usage Context Types
// ============================================================================

/**
 * Base metadata shared across all usage contexts.
 */
export interface BaseUsageMetadata {
  /** File size in bytes (if known) */
  fileSize?: number;
  /** MIME type of the file */
  mimeType?: string;
  /** Original file name */
  fileName?: string;
}

/**
 * Metadata specific to upload operations.
 */
export interface UploadUsageMetadata extends BaseUsageMetadata {
  /** Unique upload identifier */
  uploadId?: string;
  /** Duration of the upload in milliseconds */
  duration?: number;
}

/**
 * Metadata specific to flow operations.
 */
export interface FlowUsageMetadata extends BaseUsageMetadata {
  /** Flow identifier being executed */
  flowId?: string;
  /** Unique job identifier */
  jobId?: string;
  /** Number of nodes in the flow */
  nodeCount?: number;
  /** Total size of input files */
  inputFileSize?: number;
  /** Total size of output files (on complete) */
  outputSize?: number;
  /** Number of nodes that were executed (on complete) */
  nodesExecuted?: number;
  /** Duration of flow execution in milliseconds (on complete) */
  duration?: number;
  /** Flow completion status (on complete) */
  status?: "success" | "failed" | "cancelled";
}

/**
 * Context passed to usage hooks containing client and operation information.
 */
export interface UsageContext<
  TMetadata extends BaseUsageMetadata = BaseUsageMetadata,
> {
  /** Organization/client identifier */
  clientId: string;
  /** Type of operation */
  operation: "upload" | "flow";
  /** Operation-specific metadata */
  metadata: TMetadata;
}

/**
 * Upload-specific usage context.
 */
export type UploadUsageContext = UsageContext<UploadUsageMetadata>;

/**
 * Flow-specific usage context.
 */
export type FlowUsageContext = UsageContext<FlowUsageMetadata>;

// ============================================================================
// Usage Hook Function Types
// ============================================================================

/**
 * Hook called before upload processing begins.
 * Can return abort to reject the upload (e.g., quota exceeded).
 */
export type OnUploadStartHook = (
  ctx: UploadUsageContext,
) => Effect.Effect<UsageHookResult>;

/**
 * Hook called after upload completes successfully.
 * Used for recording usage. Errors are logged but don't fail the upload.
 */
export type OnUploadCompleteHook = (
  ctx: UploadUsageContext,
) => Effect.Effect<void>;

/**
 * Hook called before flow execution begins.
 * Can return abort to reject the flow (e.g., subscription expired).
 */
export type OnFlowStartHook = (
  ctx: FlowUsageContext,
) => Effect.Effect<UsageHookResult>;

/**
 * Hook called after flow completes (success, failure, or cancellation).
 * Used for recording usage. Errors are logged but don't fail the response.
 */
export type OnFlowCompleteHook = (ctx: FlowUsageContext) => Effect.Effect<void>;

// ============================================================================
// Usage Hooks Configuration
// ============================================================================

/**
 * Configuration for usage tracking hooks.
 * All hooks are optional - unconfigured hooks are no-ops.
 *
 * @example
 * ```typescript
 * const usageHooks: UsageHooks = {
 *   onUploadStart: (ctx) => Effect.gen(function* () {
 *     const hasQuota = yield* checkQuota(ctx.clientId, ctx.metadata.fileSize);
 *     if (!hasQuota) {
 *       return abortResult("Storage quota exceeded", "QUOTA_EXCEEDED");
 *     }
 *     return continueResult();
 *   }),
 *   onUploadComplete: (ctx) => Effect.gen(function* () {
 *     yield* recordUsage(ctx.clientId, ctx.metadata.fileSize);
 *   }),
 * };
 * ```
 */
export interface UsageHooks {
  /**
   * Called before upload processing begins.
   * Return abort to reject the upload.
   */
  onUploadStart?: OnUploadStartHook;

  /**
   * Called after upload completes successfully.
   * Errors are logged but don't fail the upload.
   */
  onUploadComplete?: OnUploadCompleteHook;

  /**
   * Called before flow execution begins.
   * Return abort to reject the flow.
   */
  onFlowStart?: OnFlowStartHook;

  /**
   * Called after flow completes (success, failure, or cancellation).
   * Errors are logged but don't fail the response.
   */
  onFlowComplete?: OnFlowCompleteHook;
}

/**
 * Configuration for the usage hook service.
 */
export interface UsageHookConfig {
  /**
   * The usage hooks to execute.
   */
  hooks?: UsageHooks;

  /**
   * Timeout for hook execution in milliseconds.
   * If a hook takes longer than this, it will be considered failed.
   * Default: 5000ms (5 seconds)
   */
  timeout?: number;
}

/**
 * Default timeout for usage hooks (5 seconds).
 */
export const DEFAULT_USAGE_HOOK_TIMEOUT = 5000;
