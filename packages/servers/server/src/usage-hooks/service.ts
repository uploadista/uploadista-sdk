/**
 * Usage Hook Service
 *
 * Effect service for executing usage tracking hooks with timeout handling.
 */

import { Context, Effect, Layer } from "effect";
import type {
  FlowUsageContext,
  UploadUsageContext,
  UsageHookConfig,
  UsageHookResult,
} from "./types";
import { continueResult, DEFAULT_USAGE_HOOK_TIMEOUT } from "./types";

/**
 * Usage Hook Service
 *
 * Provides methods to execute usage hooks during upload and flow processing.
 * Handles timeout and error recovery gracefully.
 */
export class UsageHookService extends Context.Tag("UsageHookService")<
  UsageHookService,
  {
    /**
     * Execute onUploadStart hook if configured.
     * Returns continue result if no hook is configured or on error/timeout.
     */
    readonly onUploadStart: (
      ctx: UploadUsageContext,
    ) => Effect.Effect<UsageHookResult>;

    /**
     * Execute onUploadComplete hook if configured.
     * Errors are logged but swallowed (fire-and-forget).
     */
    readonly onUploadComplete: (ctx: UploadUsageContext) => Effect.Effect<void>;

    /**
     * Execute onFlowStart hook if configured.
     * Returns continue result if no hook is configured or on error/timeout.
     */
    readonly onFlowStart: (
      ctx: FlowUsageContext,
    ) => Effect.Effect<UsageHookResult>;

    /**
     * Execute onFlowComplete hook if configured.
     * Errors are logged but swallowed (fire-and-forget).
     */
    readonly onFlowComplete: (ctx: FlowUsageContext) => Effect.Effect<void>;
  }
>() {}

/**
 * Creates a UsageHookService Layer from configuration.
 *
 * @param config - Usage hook configuration with optional hooks and timeout
 * @returns Effect Layer providing UsageHookService
 */
export const UsageHookServiceLive = (
  config?: UsageHookConfig,
): Layer.Layer<UsageHookService> => {
  const hooks = config?.hooks;
  const timeout = config?.timeout ?? DEFAULT_USAGE_HOOK_TIMEOUT;

  return Layer.succeed(UsageHookService, {
    onUploadStart: (ctx: UploadUsageContext) => {
      if (!hooks?.onUploadStart) {
        return Effect.succeed(continueResult());
      }

      return hooks.onUploadStart(ctx).pipe(
        // Add timeout - proceed on timeout (fail-open)
        Effect.timeout(timeout),
        Effect.map((result) => result ?? continueResult()),
        // On any error, log and continue (fail-open for availability)
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `onUploadStart hook failed: ${error}. Proceeding with upload.`,
            );
            return continueResult();
          }),
        ),
      );
    },

    onUploadComplete: (ctx: UploadUsageContext) => {
      if (!hooks?.onUploadComplete) {
        return Effect.void;
      }

      return hooks.onUploadComplete(ctx).pipe(
        // Add timeout
        Effect.timeout(timeout),
        Effect.asVoid,
        // On any error, just log (fire-and-forget)
        Effect.catchAll((error) =>
          Effect.logWarning(
            `onUploadComplete hook failed: ${error}. Upload already completed.`,
          ),
        ),
      );
    },

    onFlowStart: (ctx: FlowUsageContext) => {
      if (!hooks?.onFlowStart) {
        return Effect.succeed(continueResult());
      }

      return hooks.onFlowStart(ctx).pipe(
        // Add timeout - proceed on timeout (fail-open)
        Effect.timeout(timeout),
        Effect.map((result) => result ?? continueResult()),
        // On any error, log and continue (fail-open for availability)
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logWarning(
              `onFlowStart hook failed: ${error}. Proceeding with flow.`,
            );
            return continueResult();
          }),
        ),
      );
    },

    onFlowComplete: (ctx: FlowUsageContext) => {
      if (!hooks?.onFlowComplete) {
        return Effect.void;
      }

      return hooks.onFlowComplete(ctx).pipe(
        // Add timeout
        Effect.timeout(timeout),
        Effect.asVoid,
        // On any error, just log (fire-and-forget)
        Effect.catchAll((error) =>
          Effect.logWarning(
            `onFlowComplete hook failed: ${error}. Flow already completed.`,
          ),
        ),
      );
    },
  });
};

/**
 * No-op implementation of UsageHookService.
 * All hooks are no-ops that return continue/void.
 * Used when no usage hooks are configured (default backward compatibility).
 */
export const NoUsageHookServiceLive: Layer.Layer<UsageHookService> =
  UsageHookServiceLive();
