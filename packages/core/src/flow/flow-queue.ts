/**
 * Flow Queue Service — global flow-level concurrency control with DLQ retry loop.
 *
 * FlowQueueService sits above FlowEngine.runFlow() and manages a bounded pool of
 * simultaneous flow executions. When the queue is present in the Effect layer,
 * FlowEngine.runFlow() delegates to it instead of forking directly.
 *
 * Features:
 * - Configurable maxConcurrency (default: 4)
 * - Pluggable FlowQueueStore (default: in-memory)
 * - Background DLQ retry loop (when DeadLetterQueueService is also present)
 * - Optional service: existing deployments without it see unchanged behavior
 *
 * @module flow/flow-queue
 * @see {@link FlowQueueStore} for persistence backends
 * @see {@link DeadLetterQueueService} for the DLQ integration
 *
 * @example
 * ```typescript
 * // Minimal wiring — in-memory store, default config
 * const program = myEffect.pipe(
 *   Effect.provide(FlowQueueService.Default()),
 *   Effect.provide(flowEngineLayer),
 * );
 *
 * // With Redis store for persistence
 * const redisStore = new RedisFlowQueueStore({ redis });
 * const program = myEffect.pipe(
 *   Effect.provide(FlowQueueService.make({ maxConcurrency: 8 }, redisStore)),
 *   Effect.provide(flowEngineLayer),
 * );
 * ```
 */

import {
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  Ref,
  Schedule,
} from "effect";
import { UploadistaError } from "../errors";
import { FlowQueueKVStore, flowQueueKvStore } from "../types/kv-store";
import { DeadLetterQueueService } from "./dead-letter-queue";
import type { FlowEngineShape } from "./flow-engine";
// Import the FlowEngine tag lazily to avoid circular module graph issues.
// flow-engine.ts will import FlowQueueService for the optional check,
// and flow-queue.ts needs FlowEngine to dispatch items. We break the cycle
// by importing only the *class* (tag) from flow-engine at call time inside
// the Effect generator, where module evaluation is already complete.
import { FlowEngine } from "./flow-engine";
import { type FlowQueueStore, MemoryFlowQueueStore } from "./flow-queue-store";
import type { DeadLetterItem } from "./types/dead-letter-item";
import type { FlowJob } from "./types/flow-job";
import {
  DEFAULT_QUEUE_CONFIG,
  type FlowQueueConfig,
  type FlowQueueItem,
  type FlowQueueStats,
} from "./types/flow-queue-item";

/**
 * Context marker that signals the current Effect is running inside the
 * FlowQueueService worker dispatch loop.
 *
 * When this marker is present in the Effect context, FlowEngine.runFlow()
 * skips the FlowQueueService delegation and executes directly via forkDaemon.
 * This prevents infinite re-enqueue cycles when the worker calls runFlow.
 *
 * @internal
 */
export class FlowQueueDispatchMarker extends Context.Tag(
  "FlowQueueDispatchMarker",
)<FlowQueueDispatchMarker, true>() {}

/**
 * Shape of the FlowQueueService.
 *
 * All operations return Effect types for composable, type-safe error handling.
 */
export interface FlowQueueServiceShape {
  /**
   * Enqueue a flow for execution.
   *
   * Returns immediately with a FlowQueueItem in "pending" state.
   * The worker loop will dispatch the flow when a concurrency slot is available.
   *
   * @param params - Flow execution parameters
   * @returns The created queue item with status "pending"
   */
  enqueue(params: {
    flowId: string;
    storageId: string;
    input: unknown;
    clientId: string | null;
    dlqItemId?: string;
  }): Effect.Effect<FlowQueueItem, UploadistaError>;

  /**
   * Retrieve the current status of a queue item by ID.
   *
   * @param itemId - The queue item ID
   * @returns The queue item
   * @throws QUEUE_ITEM_NOT_FOUND if the ID is unknown
   */
  getStatus(itemId: string): Effect.Effect<FlowQueueItem, UploadistaError>;

  /**
   * Cancel a pending queue item before it starts executing.
   *
   * @param itemId - The queue item ID
   * @throws QUEUE_ITEM_ALREADY_RUNNING if the item is already running
   */
  cancel(itemId: string): Effect.Effect<void, UploadistaError>;

  /**
   * List queue items, optionally filtered by status.
   *
   * @param options - Optional filter options
   * @returns Array of matching queue items
   */
  list(options?: {
    status?: FlowQueueItem["status"];
  }): Effect.Effect<FlowQueueItem[], UploadistaError>;

  /**
   * Get aggregate queue statistics for monitoring.
   *
   * @returns Current queue stats including counts and concurrency info
   */
  getStats(): Effect.Effect<FlowQueueStats, UploadistaError>;
}

/**
 * Build a FlowQueueStore implementation backed by a KvStore<FlowQueueItem>.
 *
 * Items are stored as typed JSON values. listByStatus scans the full key list
 * and filters in memory — acceptable for queue sizes up to a few thousand items.
 */
function makeKvStoreFlowQueueStore(
  kv: import("../types/kv-store").KvStore<FlowQueueItem>,
): FlowQueueStore {
  const parseDates = (item: FlowQueueItem): FlowQueueItem => ({
    ...item,
    enqueuedAt: new Date(item.enqueuedAt),
    startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
    completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
  });

  return {
    createItem: (item) => kv.set(item.id, item).pipe(Effect.map(() => item)),

    getItem: (id) =>
      kv.get(id).pipe(
        Effect.map((item) => parseDates(item)),
        Effect.catchAll(() => Effect.succeed(null as FlowQueueItem | null)),
      ),

    updateItem: (id, updates) =>
      Effect.gen(function* () {
        const existing = yield* kv.get(id).pipe(
          Effect.map(parseDates),
          Effect.mapError(() =>
            UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
              body: `Queue item ${id} not found`,
            }),
          ),
        );
        const updated: FlowQueueItem = { ...existing, ...updates };
        yield* kv.set(id, updated);
        return updated;
      }),

    listByStatus: (status) =>
      Effect.gen(function* () {
        if (!kv.list) return [];
        const keys = yield* kv.list();
        const items: FlowQueueItem[] = [];
        for (const key of keys) {
          const item = yield* kv.get(key).pipe(
            Effect.map((i) => parseDates(i) as FlowQueueItem | null),
            Effect.catchAll(() => Effect.succeed(null as FlowQueueItem | null)),
          );
          if (item && item.status === status) items.push(item);
        }
        if (status === "pending") {
          items.sort((a, b) => a.enqueuedAt.getTime() - b.enqueuedAt.getTime());
        }
        return items;
      }),

    deleteItem: (id) => kv.delete(id),
  };
}

/**
 * Effect-TS context tag for the FlowQueueService.
 *
 * Use `FlowQueueService.optional` to resolve it optionally — this is the
 * pattern used in FlowEngine to preserve backward compatibility.
 *
 * @example
 * ```typescript
 * // In FlowEngine.runFlow()
 * const queueOption = yield* FlowQueueService.optional;
 * if (Option.isSome(queueOption)) {
 *   return yield* queueOption.value.enqueue({ flowId, storageId, input, clientId });
 * }
 * // ... existing fork path
 *
 * // From application code
 * const queue = yield* FlowQueueService;
 * const item = yield* queue.enqueue({ flowId: "my-flow", storageId: "s3", input: {}, clientId: null });
 * ```
 */
export class FlowQueueService extends Context.Tag("FlowQueueService")<
  FlowQueueService,
  FlowQueueServiceShape
>() {
  /**
   * Access the FlowQueueService optionally.
   * Returns Option.none() if the service is not present in the layer.
   *
   * Use this in FlowEngine to remain backward-compatible.
   */
  static readonly optional = Effect.serviceOption(FlowQueueService);

  /**
   * Create a FlowQueueService Layer using the default in-memory store.
   *
   * @param config - Optional configuration overrides
   * @returns A Layer providing FlowQueueService
   */
  static Default(
    config?: FlowQueueConfig,
  ): Layer.Layer<FlowQueueService, never, FlowEngine> {
    return FlowQueueService.make(config ?? {}, new MemoryFlowQueueStore());
  }

  /**
   * Create a FlowQueueService Layer with a custom store.
   *
   * @param config - Configuration (maxConcurrency, dlqRetryIntervalMs, dlqRetryBatchSize)
   * @param store - The FlowQueueStore implementation to use
   * @returns A Layer providing FlowQueueService
   */
  static make(
    config: FlowQueueConfig,
    store: FlowQueueStore,
  ): Layer.Layer<FlowQueueService, never, FlowEngine> {
    return Layer.effect(
      FlowQueueService,
      createFlowQueueService(config, store),
    );
  }

  /**
   * Create a FlowQueueService Layer backed by the application's BaseKvStoreService.
   *
   * Items are persisted under the "uploadista:queue-item:" key prefix, using the
   * same KV store already configured for the server (Redis, Cloudflare KV, etc.).
   * This is the recommended factory for most deployments — no separate store
   * dependency is needed beyond the kvStore already wired at server level.
   *
   * @param config - Optional queue configuration (maxConcurrency, retry intervals…)
   * @returns A Layer providing FlowQueueService, requiring FlowEngine and BaseKvStoreService
   *
   * @example
   * ```typescript
   * // In createUploadistaServer — flowQueue: true uses this automatically
   * FlowQueueService.fromKvStore({ maxConcurrency: 8 })
   *   .pipe(Layer.provide(flowEngineLayer), Layer.provide(kvStore))
   * ```
   */
  static fromKvStore(
    config: FlowQueueConfig = {},
  ): Layer.Layer<FlowQueueService, never, FlowEngine | FlowQueueKVStore> {
    return Layer.effect(
      FlowQueueService,
      Effect.gen(function* () {
        const kvStore = yield* FlowQueueKVStore;
        const store = makeKvStoreFlowQueueStore(kvStore);
        return yield* createFlowQueueService(config, store);
      }),
    );
  }

  /**
   * Shorthand for fromKvStore — creates the full layer including the KV store
   * sub-layer, requiring only FlowEngine and BaseKvStoreService.
   */
  static fromBaseKvStore(
    config: FlowQueueConfig = {},
  ): Layer.Layer<
    FlowQueueService,
    never,
    FlowEngine | import("../types/kv-store").BaseKvStoreService
  > {
    return FlowQueueService.fromKvStore(config).pipe(
      Layer.provide(flowQueueKvStore),
    );
  }
}

/**
 * Creates the FlowQueueService implementation.
 *
 * Internal factory used by FlowQueueService.Default and FlowQueueService.make.
 * Starts the worker loop and optionally the DLQ retry loop as daemon fibers.
 */
function createFlowQueueService(
  config: FlowQueueConfig,
  store: FlowQueueStore,
): Effect.Effect<FlowQueueServiceShape, never, FlowEngine> {
  return Effect.gen(function* () {
    const resolved = { ...DEFAULT_QUEUE_CONFIG, ...config };
    const { maxConcurrency, dlqRetryIntervalMs, dlqRetryBatchSize } = resolved;

    // Ref tracking the number of currently running flows
    const concurrencyRef = yield* Ref.make(0);

    // Get the FlowEngine from the context (required dependency)
    const flowEngine: FlowEngineShape = yield* FlowEngine;

    // Get optional DLQ service
    const dlqOption = yield* DeadLetterQueueService.optional;

    /**
     * Generate a unique queue item ID.
     */
    const generateId = (): string => `q_${crypto.randomUUID()}`;

    /**
     * Dispatch a single pending item: transition it to "running" and invoke FlowEngine.
     * When the flow finishes (success or failure), update the item status.
     * If the item has a dlqItemId, correlate the result back to the DLQ.
     */
    const dispatchItem = (item: FlowQueueItem): Effect.Effect<void, never> => {
      const startedAt = Date.now();

      // Mark as running and increment concurrency counter
      const setup = Effect.gen(function* () {
        yield* Effect.catchAll(
          store.updateItem(item.id, {
            status: "running",
            startedAt: new Date(),
          }),
          (err) =>
            Effect.logError("FlowQueue: failed to mark item running", err),
        );
        yield* Ref.update(concurrencyRef, (n) => n + 1);
      });

      // Execute the flow, catch all errors, update item status.
      // We provide FlowQueueDispatchMarker into the runFlow call so that
      // FlowEngine.runFlow skips the queue delegation and uses the direct
      // forkDaemon path, preventing infinite re-enqueue cycles.
      //
      // runFlow<TRequirements> infers TRequirements=unknown at this generic
      // call site; we assert never here because the FlowEngine service instance
      // already holds all its required context — no additional requirements are
      // propagated to the caller.
      const runFlowEffect = (
        flowEngine.runFlow({
          flowId: item.flowId,
          storageId: item.storageId,
          clientId: item.clientId,
          inputs: item.input,
          // Reuse the queue item ID as the flow job ID so clients polling
          // /jobs/{id}/status get results without a separate ID mapping.
          jobId: item.id,
        }) as Effect.Effect<FlowJob, UploadistaError, never>
      ).pipe(Effect.provideService(FlowQueueDispatchMarker, true));

      const execute = runFlowEffect.pipe(
        Effect.andThen(() =>
          Effect.gen(function* () {
            // Mark as completed
            yield* Effect.catchAll(
              store.updateItem(item.id, {
                status: "completed",
                completedAt: new Date(),
              }),
              (err) =>
                Effect.logError(
                  "FlowQueue: failed to mark item completed",
                  err,
                ),
            );

            // DLQ correlation — success
            if (item.dlqItemId && Option.isSome(dlqOption)) {
              yield* Effect.catchAll(
                dlqOption.value.markResolved(item.dlqItemId),
                (err) =>
                  Effect.logError(
                    "FlowQueue: failed to mark DLQ item resolved",
                    err,
                  ),
              );
            }
          }),
        ),
        Effect.catchAll((err) =>
          Effect.gen(function* () {
            const errorMsg =
              err instanceof UploadistaError ? err.body : String(err);

            // Mark as failed
            yield* Effect.catchAll(
              store.updateItem(item.id, {
                status: "failed",
                completedAt: new Date(),
                error: errorMsg,
              }),
              (storeErr) =>
                Effect.logError(
                  "FlowQueue: failed to mark item failed",
                  storeErr,
                ),
            );

            // DLQ correlation — failure
            if (item.dlqItemId && Option.isSome(dlqOption)) {
              const durationMs = Date.now() - startedAt;
              yield* Effect.catchAll(
                dlqOption.value.recordRetryFailure(
                  item.dlqItemId,
                  errorMsg,
                  durationMs,
                ),
                (dlqErr) =>
                  Effect.logError(
                    "FlowQueue: failed to record DLQ retry failure",
                    dlqErr,
                  ),
              );
            }
          }),
        ),
      );

      // Always decrement concurrency, even on unexpected failures
      const release = Ref.update(concurrencyRef, (n) => Math.max(0, n - 1));

      return setup.pipe(
        Effect.andThen(() => execute.pipe(Effect.ensuring(release))),
        Effect.catchAllCause((cause) =>
          Effect.logError("FlowQueue: unexpected error in dispatchItem", cause),
        ),
      );
    };

    /**
     * Worker tick: claim up to (maxConcurrency - current) pending items and
     * dispatch each as a daemon fiber so the tick returns immediately.
     */
    const workerTick = Effect.gen(function* () {
      const current = yield* Ref.get(concurrencyRef);
      const available = maxConcurrency - current;

      if (available <= 0) {
        return;
      }

      const pending = yield* Effect.catchAll(
        store.listByStatus("pending"),
        () => Effect.succeed([] as FlowQueueItem[]),
      );

      const toDispatch = pending.slice(0, available);

      for (const item of toDispatch) {
        yield* Effect.forkDaemon(dispatchItem(item));
      }
    });

    /**
     * Background worker loop: poll every 500ms for pending items.
     */
    yield* Effect.forkDaemon(
      workerTick.pipe(
        Effect.repeat(Schedule.spaced(Duration.millis(500))),
        Effect.catchAllCause((cause) =>
          Effect.logError("FlowQueue: worker loop crashed", cause),
        ),
      ),
    );

    /**
     * DLQ retry loop: when DeadLetterQueueService is present, poll on the
     * configured interval and re-enqueue items that are due for retry.
     */
    if (Option.isSome(dlqOption)) {
      const dlq = dlqOption.value;

      const dlqRetryTick = Effect.gen(function* () {
        const items = yield* Effect.catchAll(
          dlq.getScheduledRetries(dlqRetryBatchSize),
          (err) =>
            Effect.logError(
              "FlowQueue: failed to fetch DLQ scheduled retries",
              err,
            ).pipe(Effect.as([] as DeadLetterItem[])),
        );

        for (const dlqItem of items) {
          // Mark as retrying before enqueuing to prevent duplicate dispatch
          yield* Effect.catchAll(dlq.markRetrying(dlqItem.id), (err) =>
            Effect.logError("FlowQueue: failed to mark DLQ item retrying", err),
          );

          // Create queue item for the retry
          const queueItem: FlowQueueItem = {
            id: generateId(),
            flowId: dlqItem.flowId,
            storageId: dlqItem.storageId,
            input: dlqItem.inputs,
            clientId: dlqItem.clientId,
            status: "pending",
            dlqItemId: dlqItem.id,
            enqueuedAt: new Date(),
          };

          yield* Effect.catchAll(store.createItem(queueItem), (err) =>
            Effect.logError("FlowQueue: failed to enqueue DLQ retry item", err),
          );
        }
      });

      yield* Effect.forkDaemon(
        // Wait one interval before the first tick
        Effect.sleep(Duration.millis(dlqRetryIntervalMs)).pipe(
          Effect.andThen(
            dlqRetryTick.pipe(
              Effect.repeat(
                Schedule.spaced(Duration.millis(dlqRetryIntervalMs)),
              ),
            ),
          ),
          Effect.catchAllCause((cause) =>
            Effect.logError("FlowQueue: DLQ retry loop crashed", cause),
          ),
        ),
      );
    }

    /**
     * Service implementation.
     */
    const service: FlowQueueServiceShape = {
      enqueue: ({ flowId, storageId, input, clientId, dlqItemId }) =>
        Effect.gen(function* () {
          const item: FlowQueueItem = {
            id: generateId(),
            flowId,
            storageId,
            input,
            clientId,
            status: "pending",
            dlqItemId,
            enqueuedAt: new Date(),
          };
          return yield* store.createItem(item);
        }),

      getStatus: (itemId) =>
        Effect.gen(function* () {
          const item = yield* store.getItem(itemId);
          if (!item) {
            return yield* Effect.fail(
              UploadistaError.fromCode("QUEUE_ITEM_NOT_FOUND"),
            );
          }
          return item;
        }),

      cancel: (itemId) =>
        Effect.gen(function* () {
          const item = yield* store.getItem(itemId);
          if (!item) {
            return yield* Effect.fail(
              UploadistaError.fromCode("QUEUE_ITEM_NOT_FOUND"),
            );
          }
          if (item.status === "running") {
            return yield* Effect.fail(
              UploadistaError.fromCode("QUEUE_ITEM_ALREADY_RUNNING"),
            );
          }
          if (item.status === "pending") {
            yield* store.deleteItem(itemId);
          }
          // completed/failed items: no-op (already done)
        }),

      list: (options) =>
        Effect.gen(function* () {
          if (options?.status) {
            return yield* store.listByStatus(options.status);
          }
          // Return all statuses combined
          const [pending, running, completed, failed] = yield* Effect.all([
            store.listByStatus("pending"),
            store.listByStatus("running"),
            store.listByStatus("completed"),
            store.listByStatus("failed"),
          ]);
          return [...pending, ...running, ...completed, ...failed];
        }),

      getStats: () =>
        Effect.gen(function* () {
          const [pending, running, completed, failed] = yield* Effect.all([
            store.listByStatus("pending"),
            store.listByStatus("running"),
            store.listByStatus("completed"),
            store.listByStatus("failed"),
          ]);
          const currentConcurrency = yield* Ref.get(concurrencyRef);
          return {
            pending: pending.length,
            running: running.length,
            completed: completed.length,
            failed: failed.length,
            maxConcurrency,
            currentConcurrency,
          } satisfies FlowQueueStats;
        }),
    };

    return service;
  });
}
