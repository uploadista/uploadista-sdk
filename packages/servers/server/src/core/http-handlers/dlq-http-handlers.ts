import { DeadLetterQueueService } from "@uploadista/core/flow";
import { Effect } from "effect";
import { PERMISSIONS } from "../../permissions/types";
import { AuthContextService } from "../../service";
import type {
  DlqCleanupRequest,
  DlqCleanupResponse,
  DlqDeleteRequest,
  DlqDeleteResponse,
  DlqGetRequest,
  DlqGetResponse,
  DlqListRequest,
  DlqListResponse,
  DlqResolveRequest,
  DlqResolveResponse,
  DlqRetryAllRequest,
  DlqRetryAllResponse,
  DlqRetryRequest,
  DlqRetryResponse,
  DlqStatsRequest,
  DlqStatsResponse,
} from "../routes";

/**
 * Handle GET /api/dlq - List DLQ items
 */
export const handleDlqList = (req: DlqListRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for reading DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_READ);

    const dlq = yield* DeadLetterQueueService;
    const result = yield* dlq.list(req.options);

    return {
      type: "dlq-list",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: result,
    } satisfies DlqListResponse;
  });

/**
 * Handle GET /api/dlq/:itemId - Get a specific DLQ item
 */
export const handleDlqGet = (req: DlqGetRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for reading DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_READ);

    const dlq = yield* DeadLetterQueueService;
    const item = yield* dlq.get(req.itemId);

    return {
      type: "dlq-get",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: item,
    } satisfies DlqGetResponse;
  });

/**
 * Handle POST /api/dlq/:itemId/retry - Retry a specific DLQ item
 */
export const handleDlqRetry = (req: DlqRetryRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for writing to DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_WRITE);

    const dlq = yield* DeadLetterQueueService;

    // Mark item as retrying
    yield* dlq.markRetrying(req.itemId);

    // TODO: Implement actual retry logic by re-executing the flow
    // This would require access to FlowServer and the original job context
    // For now, we just mark it as retrying and return success
    // The actual retry would be handled by a background scheduler

    return {
      type: "dlq-retry",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true },
    } satisfies DlqRetryResponse;
  });

/**
 * Handle POST /api/dlq/retry-all - Retry all matching DLQ items
 */
export const handleDlqRetryAll = (req: DlqRetryAllRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for writing to DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_WRITE);

    const dlq = yield* DeadLetterQueueService;

    // List items matching the filter
    const { items } = yield* dlq.list({
      status: req.options?.status,
      flowId: req.options?.flowId,
    });

    let succeeded = 0;
    let failed = 0;

    // Mark each item for retry
    for (const item of items) {
      const result = yield* Effect.either(dlq.markRetrying(item.id));
      if (result._tag === "Right") {
        succeeded++;
      } else {
        failed++;
      }
    }

    return {
      type: "dlq-retry-all",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        retried: items.length,
        succeeded,
        failed,
      },
    } satisfies DlqRetryAllResponse;
  });

/**
 * Handle DELETE /api/dlq/:itemId - Delete a DLQ item
 */
export const handleDlqDelete = (req: DlqDeleteRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for writing to DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_WRITE);

    const dlq = yield* DeadLetterQueueService;
    yield* dlq.delete(req.itemId);

    return {
      type: "dlq-delete",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: { success: true },
    } satisfies DlqDeleteResponse;
  });

/**
 * Handle POST /api/dlq/:itemId/resolve - Manually resolve a DLQ item
 */
export const handleDlqResolve = (req: DlqResolveRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for writing to DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_WRITE);

    const dlq = yield* DeadLetterQueueService;
    const item = yield* dlq.markResolved(req.itemId);

    return {
      type: "dlq-resolve",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: item,
    } satisfies DlqResolveResponse;
  });

/**
 * Handle POST /api/dlq/cleanup - Cleanup old DLQ items
 */
export const handleDlqCleanup = (req: DlqCleanupRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for writing to DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_WRITE);

    const dlq = yield* DeadLetterQueueService;
    const result = yield* dlq.cleanup(req.options);

    return {
      type: "dlq-cleanup",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: result,
    } satisfies DlqCleanupResponse;
  });

/**
 * Handle GET /api/dlq/stats - Get DLQ statistics
 */
export const handleDlqStats = (_req: DlqStatsRequest) =>
  Effect.gen(function* () {
    const authService = yield* AuthContextService;

    // Check permission for reading DLQ
    yield* authService.requirePermission(PERMISSIONS.ENGINE.DLQ_READ);

    const dlq = yield* DeadLetterQueueService;
    const stats = yield* dlq.getStats();

    return {
      type: "dlq-stats",
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: stats,
    } satisfies DlqStatsResponse;
  });
