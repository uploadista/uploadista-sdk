import { Context, Effect, Layer, Option, Runtime, Tracer } from "effect";
import type { z } from "zod";
import { UploadistaError } from "../errors";
import {
  createFlowWithSchema,
  EventType,
  type Flow,
  type FlowData,
  type FlowExecutionResult,
  getFlowData,
  runArgsSchema,
  type TypedOutput,
} from "../flow";
import type {
  EventEmitter,
  KvStore,
  UploadFile,
  WebSocketConnection,
} from "../types";
import type { FlowJobTraceContext } from "./types/flow-job";

/**
 * WaitUntil callback type for keeping background tasks alive.
 * Used in serverless environments like Cloudflare Workers to prevent
 * premature termination of background operations.
 *
 * @param promise - Promise representing the background task to keep alive
 */
export type WaitUntilCallback = (promise: Promise<unknown>) => void;

/**
 * Optional WaitUntil service for background task management.
 * When provided, allows flows to execute beyond the HTTP response lifecycle.
 *
 * In Cloudflare Workers, use `ctx.executionCtx.waitUntil()`.
 * In other environments, this can be undefined (flows execute normally with Effect.fork).
 *
 * This service uses Effect's optional service pattern. Access it via:
 * ```typescript
 * const waitUntil = yield* FlowWaitUntil.optional;
 * if (Option.isSome(waitUntil)) {
 *   // Use waitUntil.value
 * }
 * ```
 *
 * @see https://effect.website/docs/requirements-management/services/#optional-services
 */
export class FlowWaitUntil extends Context.Tag("FlowWaitUntil")<
  FlowWaitUntil,
  WaitUntilCallback
>() {
  static optional = Effect.serviceOption(FlowWaitUntil);
}

import { FlowEventEmitter, FlowJobKVStore } from "../types";
import { UploadServer } from "../upload";
import { DeadLetterQueueService } from "./dead-letter-queue";
import type { FlowEvent } from "./event";
import type { FlowJob } from "./types/flow-job";

/**
 * Flow provider interface that applications must implement.
 *
 * This interface defines how the FlowServer retrieves flow definitions.
 * Applications provide their own implementation to load flows from a database,
 * configuration files, or any other source.
 *
 * @template TRequirements - Additional Effect requirements for flow execution
 *
 * @property getFlow - Retrieves a flow definition by ID with authorization check
 *
 * @example
 * ```typescript
 * // Implement a flow provider from database
 * const dbFlowProvider: FlowProviderShape = {
 *   getFlow: (flowId, clientId) => Effect.gen(function* () {
 *     // Load flow from database
 *     const flowData = yield* db.getFlow(flowId);
 *
 *     // Check authorization
 *     if (flowData.ownerId !== clientId) {
 *       return yield* Effect.fail(
 *         UploadistaError.fromCode("FLOW_NOT_AUTHORIZED")
 *       );
 *     }
 *
 *     // Create flow instance
 *     return createFlow(flowData);
 *   })
 * };
 *
 * // Provide to FlowServer
 * const flowProviderLayer = Layer.succeed(FlowProvider, dbFlowProvider);
 * ```
 */
export type FlowProviderShape<TRequirements = any> = {
  getFlow: (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<Flow<any, any, TRequirements>, UploadistaError>;
};

/**
 * Effect-TS context tag for the FlowProvider service.
 *
 * Applications must provide an implementation of FlowProviderShape
 * to enable the FlowServer to retrieve flow definitions.
 *
 * @example
 * ```typescript
 * // Access FlowProvider in an Effect
 * const effect = Effect.gen(function* () {
 *   const provider = yield* FlowProvider;
 *   const flow = yield* provider.getFlow("flow123", "client456");
 *   return flow;
 * });
 * ```
 */
export class FlowProvider extends Context.Tag("FlowProvider")<
  FlowProvider,
  FlowProviderShape<any>
>() {}

/**
 * FlowServer service interface.
 *
 * This is the core flow processing service that executes DAG-based file processing pipelines.
 * It manages flow execution, job tracking, node processing, pause/resume functionality,
 * and real-time event broadcasting.
 *
 * All operations return Effect types for composable, type-safe error handling.
 *
 * @property getFlow - Retrieves a flow definition by ID
 * @property getFlowData - Retrieves flow metadata (nodes, edges) without full flow instance
 * @property runFlow - Starts a new flow execution and returns immediately with job ID
 * @property resumeFlow - Resumes a paused flow with new data for a specific node
 * @property pauseFlow - Pauses a running flow (user-initiated pause)
 * @property cancelFlow - Cancels a running or paused flow and cleans up resources
 * @property getJobStatus - Retrieves current status and results of a flow job
 * @property subscribeToFlowEvents - Subscribes WebSocket to flow execution events
 * @property unsubscribeFromFlowEvents - Unsubscribes from flow events
 *
 * @example
 * ```typescript
 * // Execute a flow
 * const program = Effect.gen(function* () {
 *   const server = yield* FlowServer;
 *
 *   // Start flow execution (returns immediately)
 *   const job = yield* server.runFlow({
 *     flowId: "resize-optimize",
 *     storageId: "s3-production",
 *     clientId: "client123",
 *     inputs: {
 *       input_1: { uploadId: "upload_abc123" }
 *     }
 *   });
 *
 *   // Subscribe to events
 *   yield* server.subscribeToFlowEvents(job.id, websocket);
 *
 *   // Poll for status
 *   const status = yield* server.getJobStatus(job.id);
 *   console.log(status.status); // "running", "paused", "completed", "failed", or "cancelled"
 *
 *   // User can pause the flow
 *   yield* server.pauseFlow(job.id, "client123");
 *
 *   return job;
 * });
 *
 * // Resume a paused flow
 * const resume = Effect.gen(function* () {
 *   const server = yield* FlowServer;
 *
 *   // Flow paused waiting for user input at node "approval_1"
 *   const job = yield* server.resumeFlow({
 *     jobId: "job123",
 *     nodeId: "approval_1",
 *     newData: { approved: true },
 *     clientId: "client123"
 *   });
 *
 *   return job;
 * });
 *
 * // Cancel a flow
 * const cancel = Effect.gen(function* () {
 *   const server = yield* FlowServer;
 *
 *   // Cancel flow and cleanup intermediate files
 *   const job = yield* server.cancelFlow("job123", "client123");
 *
 *   return job;
 * });
 *
 * // Check flow structure before execution
 * const inspect = Effect.gen(function* () {
 *   const server = yield* FlowServer;
 *
 *   const flowData = yield* server.getFlowData("resize-optimize", "client123");
 *   console.log("Nodes:", flowData.nodes);
 *   console.log("Edges:", flowData.edges);
 *
 *   return flowData;
 * });
 * ```
 */
export type FlowServerShape = {
  getFlow: <TRequirements>(
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<Flow<any, any, TRequirements>, UploadistaError>;

  getFlowData: (
    flowId: string,
    clientId: string | null,
  ) => Effect.Effect<FlowData, UploadistaError>;

  runFlow: <TRequirements>({
    flowId,
    storageId,
    clientId,
    inputs,
  }: {
    flowId: string;
    storageId: string;
    clientId: string | null;
    inputs: any;
  }) => Effect.Effect<FlowJob, UploadistaError, TRequirements>;

  resumeFlow: <TRequirements>({
    jobId,
    nodeId,
    newData,
    clientId,
  }: {
    jobId: string;
    nodeId: string;
    newData: unknown;
    clientId: string | null;
  }) => Effect.Effect<FlowJob, UploadistaError, TRequirements>;

  pauseFlow: (
    jobId: string,
    clientId: string | null,
  ) => Effect.Effect<FlowJob, UploadistaError>;

  cancelFlow: (
    jobId: string,
    clientId: string | null,
  ) => Effect.Effect<FlowJob, UploadistaError>;

  getJobStatus: (jobId: string) => Effect.Effect<FlowJob, UploadistaError>;

  subscribeToFlowEvents: (
    jobId: string,
    connection: WebSocketConnection,
  ) => Effect.Effect<void, UploadistaError>;

  unsubscribeFromFlowEvents: (
    jobId: string,
  ) => Effect.Effect<void, UploadistaError>;
};

/**
 * Effect-TS context tag for the FlowServer service.
 *
 * Use this tag to access the FlowServer in an Effect context.
 * The server must be provided via a Layer or dependency injection.
 *
 * @example
 * ```typescript
 * // Access FlowServer in an Effect
 * const flowEffect = Effect.gen(function* () {
 *   const server = yield* FlowServer;
 *   const job = yield* server.runFlow({
 *     flowId: "my-flow",
 *     storageId: "s3",
 *     clientId: null,
 *     inputs: {}
 *   });
 *   return job;
 * });
 *
 * // Provide FlowServer layer
 * const program = flowEffect.pipe(
 *   Effect.provide(flowServer),
 *   Effect.provide(flowProviderLayer),
 *   Effect.provide(flowJobKvStore)
 * );
 * ```
 */
export class FlowServer extends Context.Tag("FlowServer")<
  FlowServer,
  FlowServerShape
>() {}

/**
 * Legacy configuration options for FlowServer.
 *
 * @deprecated Use Effect Layers and FlowProvider instead.
 * This type is kept for backward compatibility.
 *
 * @property getFlow - Function to retrieve flow definitions
 * @property kvStore - KV store for flow job metadata
 */
export type FlowServerOptions = {
  getFlow: <TRequirements>({
    flowId,
    storageId,
  }: {
    flowId: string;
    storageId: string;
  }) => Promise<Flow<any, any, TRequirements>>;
  kvStore: KvStore<FlowJob>;
};

const isResultUploadFile = (result: unknown): result is UploadFile => {
  return typeof result === "object" && result !== null && "id" in result;
};

// Helper to extract data from TypedOutput or return as-is
const extractResultData = (result: unknown): unknown => {
  if (
    typeof result === "object" &&
    result !== null &&
    "nodeId" in result &&
    "data" in result &&
    "timestamp" in result
  ) {
    // This looks like a TypedOutput, extract the data
    return (result as TypedOutput).data;
  }
  return result;
};

// Function to enhance a flow with event emission capabilities
function withFlowEvents<
  TFlowInputSchema extends z.ZodSchema<any>,
  TFlowOutputSchema extends z.ZodSchema<any>,
  TRequirements,
>(
  flow: Flow<TFlowInputSchema, TFlowOutputSchema, TRequirements>,
  eventEmitter: EventEmitter<FlowEvent>,
  kvStore: KvStore<FlowJob>,
): Flow<TFlowInputSchema, TFlowOutputSchema, TRequirements> {
  // Shared helper to create onEvent callback for a given jobId
  const createOnEventCallback = (executionJobId: string) => {
    // Helper to update job in KV store
    const updateJobInStore = (updates: Partial<FlowJob>) =>
      Effect.gen(function* () {
        const job = yield* kvStore.get(executionJobId);
        if (job) {
          yield* kvStore.set(executionJobId, {
            ...job,
            ...updates,
            updatedAt: new Date(),
          });
        }
      });

    // Create the onEvent callback that calls original onEvent, emits to eventEmitter, and updates job
    return (event: FlowEvent) =>
      Effect.gen(function* () {
        // Call the original onEvent from the flow if it exists
        // Catch errors to prevent them from blocking flow execution
        if (flow.onEvent) {
          yield* Effect.catchAll(flow.onEvent(event), (error) => {
            // Log the error but don't fail the flow
            Effect.logError("Original onEvent failed", error);
            return Effect.succeed({ eventId: null });
          });
        }

        // Emit event
        yield* eventEmitter.emit(executionJobId, event);

        Effect.logInfo(
          `Updating job ${executionJobId} with event ${event.eventType}`,
        );

        // Update job based on event type
        switch (event.eventType) {
          case EventType.FlowStart:
            yield* updateJobInStore({ status: "running" });
            break;

          case EventType.FlowEnd:
            // Store typed outputs in job for client access
            yield* Effect.gen(function* () {
              const job = yield* kvStore.get(executionJobId);
              if (job && event.outputs) {
                yield* kvStore.set(executionJobId, {
                  ...job,
                  result: event.outputs, // Store typed outputs array
                  updatedAt: new Date(),
                });
              }
            });
            break;

          case EventType.FlowError:
            yield* updateJobInStore({
              status: "failed",
              error: event.error,
            });
            break;

          case EventType.NodeStart:
            yield* Effect.gen(function* () {
              const job = yield* kvStore.get(executionJobId);
              if (job) {
                const existingTask = job.tasks.find(
                  (t) => t.nodeId === event.nodeId,
                );
                const updatedTasks = existingTask
                  ? job.tasks.map((t) =>
                      t.nodeId === event.nodeId
                        ? {
                            ...t,
                            status: "running" as const,
                            updatedAt: new Date(),
                          }
                        : t,
                    )
                  : [
                      ...job.tasks,
                      {
                        nodeId: event.nodeId,
                        status: "running" as const,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      },
                    ];

                yield* kvStore.set(executionJobId, {
                  ...job,
                  tasks: updatedTasks,
                  updatedAt: new Date(),
                });
              }
            });
            break;

          case EventType.NodePause:
            yield* Effect.gen(function* () {
              const job = yield* kvStore.get(executionJobId);
              if (job) {
                const existingTask = job.tasks.find(
                  (t) => t.nodeId === event.nodeId,
                );
                const updatedTasks = existingTask
                  ? job.tasks.map((t) =>
                      t.nodeId === event.nodeId
                        ? {
                            ...t,
                            status: "paused" as const,
                            result: event.partialData,
                            updatedAt: new Date(),
                          }
                        : t,
                    )
                  : [
                      ...job.tasks,
                      {
                        nodeId: event.nodeId,
                        status: "paused" as const,
                        result: event.partialData,
                        createdAt: new Date(),
                        updatedAt: new Date(),
                      },
                    ];

                yield* kvStore.set(executionJobId, {
                  ...job,
                  tasks: updatedTasks,
                  updatedAt: new Date(),
                });
              }
            });
            break;

          case EventType.NodeResume:
            yield* Effect.gen(function* () {
              const job = yield* kvStore.get(executionJobId);
              if (job) {
                const updatedTasks = job.tasks.map((t) =>
                  t.nodeId === event.nodeId
                    ? {
                        ...t,
                        status: "running" as const,
                        updatedAt: new Date(),
                      }
                    : t,
                );

                yield* kvStore.set(executionJobId, {
                  ...job,
                  tasks: updatedTasks,
                  updatedAt: new Date(),
                });
              }
            });
            break;

          case EventType.NodeEnd:
            yield* Effect.gen(function* () {
              const job = yield* kvStore.get(executionJobId);
              if (job) {
                const updatedTasks = job.tasks.map((t) =>
                  t.nodeId === event.nodeId
                    ? {
                        ...t,
                        status: "completed" as const,
                        result: event.result,
                        updatedAt: new Date(),
                      }
                    : t,
                );

                // Track intermediate files for cleanup
                // Check if result is an UploadFile based on topology (sink vs non-sink) and keepOutput flag
                // A sink node is one with no outgoing edges
                const isSinkNode = !flow.edges.some(
                  (edge) => edge.source === event.nodeId,
                );
                // Find the node to check if it has keepOutput enabled
                const node = flow.nodes.find((n: any) => n.id === event.nodeId);
                const hasKeepOutput = node?.keepOutput === true;

                const result = event.result;
                // Extract data from TypedOutput if present
                const resultData = extractResultData(result);

                let intermediateFiles = job.intermediateFiles || [];

                // Node should preserve output if: it's a sink OR has keepOutput enabled
                const shouldPreserveOutput = isSinkNode || hasKeepOutput;

                if (
                  shouldPreserveOutput &&
                  isResultUploadFile(resultData) &&
                  resultData.id
                ) {
                  // If this node should preserve output and it returns a file that was an intermediate file,
                  // remove it from the intermediate files list (it's now a final output)
                  intermediateFiles = intermediateFiles.filter(
                    (fileId) => fileId !== resultData.id,
                  );

                  // Log when files are preserved due to keepOutput
                  if (hasKeepOutput && !isSinkNode) {
                    Effect.logInfo(
                      `Preserving output from node ${event.nodeId} due to keepOutput flag`,
                    );
                  }
                } else if (
                  !shouldPreserveOutput &&
                  isResultUploadFile(resultData) &&
                  resultData.id
                ) {
                  // Only add to intermediate files if it's not a sink and doesn't have keepOutput
                  if (!intermediateFiles.includes(resultData.id)) {
                    intermediateFiles.push(resultData.id);
                  }
                }

                yield* kvStore.set(executionJobId, {
                  ...job,
                  tasks: updatedTasks,
                  intermediateFiles,
                  updatedAt: new Date(),
                });
              }
            });
            break;

          case EventType.NodeError:
            yield* Effect.gen(function* () {
              const job = yield* kvStore.get(executionJobId);
              if (job) {
                const updatedTasks = job.tasks.map((t) =>
                  t.nodeId === event.nodeId
                    ? {
                        ...t,
                        status: "failed" as const,
                        error: event.error,
                        retryCount: event.retryCount,
                        updatedAt: new Date(),
                      }
                    : t,
                );

                yield* kvStore.set(executionJobId, {
                  ...job,
                  tasks: updatedTasks,
                  error: event.error,
                  updatedAt: new Date(),
                });
              }
            });
            break;
        }

        return { eventId: executionJobId };
      });
  };

  // Create checkJobStatus callback that reads from KV store
  const createCheckJobStatusCallback = (executionJobId: string) => {
    return (jobId: string) =>
      Effect.gen(function* () {
        const job = yield* kvStore.get(jobId);
        if (!job) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
              cause: `Job ${jobId} not found`,
            }),
          );
        }
        // Return only the statuses we care about for flow control
        if (job.status === "paused") return "paused" as const;
        if (job.status === "cancelled") return "cancelled" as const;
        return "running" as const;
      });
  };

  return {
    ...flow,
    run: (args: {
      inputs?: Record<string, z.infer<TFlowInputSchema>>;
      storageId: string;
      jobId?: string;
      clientId: string | null;
    }) => {
      return Effect.gen(function* () {
        // Use provided jobId or generate a new one
        const executionJobId = args.jobId || crypto.randomUUID();

        const onEventCallback = createOnEventCallback(executionJobId);
        const checkJobStatusCallback =
          createCheckJobStatusCallback(executionJobId);

        // Create a new flow with the same configuration but with onEvent callback
        const flowWithEvents = yield* createFlowWithSchema({
          flowId: flow.id,
          name: flow.name,
          nodes: flow.nodes,
          edges: flow.edges,
          inputSchema: flow.inputSchema,
          outputSchema: flow.outputSchema,
          onEvent: onEventCallback,
          checkJobStatus: checkJobStatusCallback,
        });

        // Run the enhanced flow with consistent jobId
        const result = yield* flowWithEvents.run({
          ...args,
          jobId: executionJobId,
          clientId: args.clientId,
        });

        // Return the result directly (can be completed or paused)
        return result;
      });
    },
    resume: (args: {
      jobId: string;
      storageId: string;
      nodeResults: Record<string, unknown>;
      executionState: {
        executionOrder: string[];
        currentIndex: number;
        inputs: Record<string, z.infer<TFlowInputSchema>>;
      };
      clientId: string | null;
    }) => {
      return Effect.gen(function* () {
        const executionJobId = args.jobId;

        const onEventCallback = createOnEventCallback(executionJobId);
        const checkJobStatusCallback =
          createCheckJobStatusCallback(executionJobId);

        // Create a new flow with the same configuration but with onEvent callback
        const flowWithEvents = yield* createFlowWithSchema({
          flowId: flow.id,
          name: flow.name,
          nodes: flow.nodes,
          edges: flow.edges,
          inputSchema: flow.inputSchema,
          outputSchema: flow.outputSchema,
          onEvent: onEventCallback,
          checkJobStatus: checkJobStatusCallback,
        });

        // Resume the enhanced flow
        const result = yield* flowWithEvents.resume(args);

        // Return the result directly (can be completed or paused)
        return result;
      });
    },
  };
}

// Core FlowServer implementation
export function createFlowServer() {
  return Effect.gen(function* () {
    const flowProvider = yield* FlowProvider;
    const eventEmitter = yield* FlowEventEmitter;
    const kvStore = yield* FlowJobKVStore;
    const uploadServer = yield* UploadServer;
    const dlqOption = yield* DeadLetterQueueService.optional;

    const updateJob = (jobId: string, updates: Partial<FlowJob>) =>
      Effect.gen(function* () {
        const job = yield* kvStore.get(jobId);
        if (!job) {
          return yield* Effect.fail(
            UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
              cause: `Job ${jobId} not found`,
            }),
          );
        }
        return yield* kvStore.set(jobId, { ...job, ...updates });
      });

    // Helper function to cleanup intermediate files
    const cleanupIntermediateFiles = (jobId: string, clientId: string | null) =>
      Effect.gen(function* () {
        const job = yield* kvStore.get(jobId);
        if (
          !job ||
          !job.intermediateFiles ||
          job.intermediateFiles.length === 0
        ) {
          return;
        }

        yield* Effect.logInfo(
          `Cleaning up ${job.intermediateFiles.length} intermediate files for job ${jobId}`,
        );

        // Delete each intermediate file
        yield* Effect.all(
          job.intermediateFiles.map((fileId) =>
            Effect.gen(function* () {
              yield* uploadServer.delete(fileId, clientId);
              yield* Effect.logDebug(`Deleted intermediate file ${fileId}`);
            }).pipe(
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  yield* Effect.logWarning(
                    `Failed to delete intermediate file ${fileId}: ${error}`,
                  );
                  return Effect.succeed(undefined);
                }),
              ),
            ),
          ),
          { concurrency: 5 },
        );

        // Clear the intermediateFiles array
        yield* updateJob(jobId, {
          intermediateFiles: [],
        });
      });

    // Helper function to add failed job to Dead Letter Queue
    const addToDeadLetterQueue = (
      jobId: string,
      error: UploadistaError,
    ) =>
      Effect.gen(function* () {
        if (Option.isNone(dlqOption)) {
          // DLQ not configured, skip
          yield* Effect.logDebug(
            `[FlowServer] DLQ not configured, skipping for job: ${jobId}`,
          );
          return;
        }

        const dlq = dlqOption.value;

        // Get the job to add to DLQ
        const job = yield* Effect.catchAll(kvStore.get(jobId), () =>
          Effect.succeed(null as FlowJob | null),
        );

        if (!job) {
          yield* Effect.logWarning(
            `[FlowServer] Job ${jobId} not found when adding to DLQ`,
          );
          return;
        }

        // Add to DLQ
        yield* Effect.catchAll(dlq.add(job, error), (dlqError) =>
          Effect.gen(function* () {
            yield* Effect.logError(
              `[FlowServer] Failed to add job ${jobId} to DLQ`,
              dlqError,
            );
            return Effect.succeed(undefined);
          }),
        );

        yield* Effect.logInfo(
          `[FlowServer] Added job ${jobId} to Dead Letter Queue`,
        );
      });

    /**
     * Captures the current Effect trace context for distributed tracing.
     * Uses Effect's `currentSpan` which properly integrates with @effect/opentelemetry.
     */
    const captureTraceContextEffect: Effect.Effect<
      FlowJobTraceContext | undefined
    > = Effect.gen(function* () {
      const spanOption = yield* Effect.currentSpan.pipe(Effect.option);
      return Option.match(spanOption, {
        onNone: () => undefined,
        onSome: (span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          traceFlags: span.sampled ? 1 : 0,
        }),
      });
    });

    // Helper function to execute flow in background
    const executeFlowInBackground = ({
      jobId,
      flow,
      storageId,
      clientId,
      inputs,
    }: {
      jobId: string;
      flow: Flow<any, any, any>;
      storageId: string;
      clientId: string | null;
      inputs: Record<string, any>;
    }) =>
      Effect.gen(function* () {
        console.log(
          `[FlowServer] executeFlowInBackground started for job: ${jobId}`,
        );

        // Capture the parent "flow" span's trace context FIRST
        // This allows flow-execution-resume to be a sibling of flow-execution
        // under the same parent "flow" span
        const traceContext = yield* captureTraceContextEffect;

        // Update job status to running and store trace context
        yield* updateJob(jobId, {
          status: "running",
          traceContext,
        });

        // Now run the actual flow execution inside a child span
        const result = yield* Effect.gen(function* () {
          console.log(`[FlowServer] Creating flowWithEvents for job: ${jobId}`);
          const flowWithEvents = withFlowEvents(flow, eventEmitter, kvStore);

          console.log(`[FlowServer] Running flow for job: ${jobId}`);
          // Run the flow with the consistent jobId
          const flowResult = yield* flowWithEvents.run({
            inputs,
            storageId,
            jobId,
            clientId,
          });

          console.log(
            `[FlowServer] Flow completed for job: ${jobId}, result type: ${flowResult.type}`,
          );

          // Handle result based on type
          if (flowResult.type === "paused") {
            // Update job as paused (node results are in tasks, not executionState)
            yield* updateJob(jobId, {
              status: "paused",
              pausedAt: flowResult.nodeId,
              executionState: flowResult.executionState,
              updatedAt: new Date(),
            });
          } else {
            // Update job as completed
            // Note: result field is already set by FlowEnd event handler with TypedOutput[]
            yield* updateJob(jobId, {
              status: "completed",
              updatedAt: new Date(),
              endedAt: new Date(),
            });

            // Cleanup intermediate files
            yield* cleanupIntermediateFiles(jobId, clientId);
          }

          return flowResult;
        }).pipe(
          // flow-execution is a CHILD span of the parent "flow" span
          Effect.withSpan("flow-execution", {
            attributes: {
              "flow.id": flow.id,
              "flow.name": flow.name,
              "flow.job_id": jobId,
              "flow.storage_id": storageId,
              "flow.node_count": flow.nodes.length,
            },
          }),
        );

        return result;
      }).pipe(
        // Parent "flow" span wraps the entire flow lifecycle
        // flow-execution and flow-execution-resume will be children of this span
        Effect.withSpan("flow", {
          attributes: {
            "flow.id": flow.id,
            "flow.name": flow.name,
            "flow.job_id": jobId,
            "flow.storage_id": storageId,
            "flow.node_count": flow.nodes.length,
          },
        }),
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* Effect.logError("Flow execution failed", error);

            // Convert error to a proper message
            const errorMessage =
              error instanceof UploadistaError ? error.body : String(error);

            yield* Effect.logInfo(
              `Updating job ${jobId} to failed status with error: ${errorMessage}`,
            );

            // Update job as failed - do this FIRST before cleanup
            yield* updateJob(jobId, {
              status: "failed",
              error: errorMessage,
              updatedAt: new Date(),
            }).pipe(
              Effect.catchAll((updateError) =>
                Effect.gen(function* () {
                  yield* Effect.logError(
                    `Failed to update job ${jobId}`,
                    updateError,
                  );
                  return Effect.succeed(undefined);
                }),
              ),
            );

            // Emit FlowError event to notify client via WebSocket
            const job = yield* kvStore.get(jobId);
            if (job) {
              yield* eventEmitter
                .emit(jobId, {
                  jobId,
                  eventType: EventType.FlowError,
                  flowId: job.flowId,
                  error: errorMessage,
                })
                .pipe(
                  Effect.catchAll((emitError) =>
                    Effect.gen(function* () {
                      yield* Effect.logError(
                        `Failed to emit FlowError event for job ${jobId}`,
                        emitError,
                      );
                      return Effect.succeed(undefined);
                    }),
                  ),
                );
            }

            // Also call flow's onEvent callback to update external databases (like uploadista-cloud)
            if (flow.onEvent) {
              yield* flow
                .onEvent({
                  jobId,
                  eventType: EventType.FlowError,
                  flowId: flow.id,
                  error: errorMessage,
                })
                .pipe(
                  Effect.catchAll((onEventError) =>
                    Effect.gen(function* () {
                      yield* Effect.logError(
                        `Failed to call flow.onEvent for FlowError event for job ${jobId}`,
                        onEventError,
                      );
                      return Effect.succeed({ eventId: null });
                    }),
                  ),
                );
            }

            // Cleanup intermediate files even on failure (don't let this fail the error handling)
            yield* cleanupIntermediateFiles(jobId, clientId).pipe(
              Effect.catchAll((cleanupError) =>
                Effect.gen(function* () {
                  yield* Effect.logWarning(
                    `Failed to cleanup intermediate files for job ${jobId}`,
                    cleanupError,
                  );
                  return Effect.succeed(undefined);
                }),
              ),
            );

            // Add failed job to Dead Letter Queue for retry/debugging
            const uploadistaError =
              error instanceof UploadistaError
                ? error
                : new UploadistaError({
                    code: "UNKNOWN_ERROR",
                    status: 500,
                    body: String(error),
                    cause: error,
                  });
            yield* addToDeadLetterQueue(jobId, uploadistaError);

            throw error;
          }),
        ),
      );

    return {
      getFlow: (flowId, clientId) =>
        Effect.gen(function* () {
          const flow = yield* flowProvider.getFlow(flowId, clientId);
          return flow;
        }),

      getFlowData: (flowId, clientId) =>
        Effect.gen(function* () {
          const flow = yield* flowProvider.getFlow(flowId, clientId);
          return getFlowData(flow);
        }),

      runFlow: ({
        flowId,
        storageId,
        clientId,
        inputs,
      }: {
        flowId: string;
        storageId: string;
        clientId: string | null;
        inputs: unknown;
      }) =>
        Effect.gen(function* () {
          const waitUntil = yield* FlowWaitUntil.optional;

          const parsedParams = yield* Effect.try({
            try: () => runArgsSchema.parse({ inputs }),
            catch: (error) =>
              UploadistaError.fromCode("FLOW_INPUT_VALIDATION_ERROR", {
                cause: error,
              }),
          });

          // Generate a unique jobId
          const jobId = crypto.randomUUID();
          const createdAt = new Date();

          // Store initial job metadata
          const job: FlowJob = {
            id: jobId,
            flowId,
            storageId,
            clientId,
            status: "started",
            createdAt,
            updatedAt: createdAt,
            tasks: [],
          };

          yield* kvStore.set(jobId, job);

          // Get the flow and start background execution
          const flow = yield* flowProvider.getFlow(flowId, clientId);

          console.log(
            `[FlowServer] About to fork flow execution for job: ${jobId}`,
          );

          // Execute flow in background
          // If waitUntil is provided (Cloudflare Workers), use it to keep execution alive
          // Otherwise, use Effect.fork for standard environments
          const flowEffect = executeFlowInBackground({
            jobId,
            flow,
            storageId,
            clientId,
            inputs: parsedParams.inputs,
          }).pipe(
            Effect.tapErrorCause((cause) =>
              Effect.logError("Flow execution failed", cause),
            ),
          ) as Effect.Effect<
            FlowExecutionResult<Record<string, any>>,
            UploadistaError,
            never
          >;

          if (Option.isSome(waitUntil)) {
            // Cloudflare Workers: Use waitUntil to keep execution alive
            console.log(`[FlowServer] Using waitUntil for job: ${jobId}`);
            // Get the current runtime to run the effect as a promise
            const runtime = yield* Effect.runtime();
            const runnable = Runtime.runPromise(runtime);
            const promise = runnable(flowEffect);
            waitUntil.value(promise);
          } else {
            // Standard environments: Fork normally
            console.log(
              `[FlowServer] Using Effect.forkDaemon for job: ${jobId}`,
            );
            yield* Effect.forkDaemon(flowEffect);
          }

          console.log(`[FlowServer] Flow execution started for job: ${jobId}`);

          // Return immediately with jobId
          return job;
        }),

      getJobStatus: (jobId: string) =>
        Effect.gen(function* () {
          const job = yield* kvStore.get(jobId);
          if (!job) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found`,
              }),
            );
          }

          return job;
        }),

      resumeFlow: ({
        jobId,
        nodeId,
        newData,
        clientId,
      }: {
        jobId: string;
        nodeId: string;
        newData: unknown;
        clientId: string | null;
      }) =>
        Effect.gen(function* () {
          const waitUntil = yield* FlowWaitUntil.optional;

          // Get the current job
          const job = yield* kvStore.get(jobId);
          if (!job) {
            console.error("Job not found");
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found`,
              }),
            );
          }

          // Verify job is paused
          if (job.status !== "paused") {
            console.error("Job is not paused");
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_ERROR", {
                cause: `Job ${jobId} is not paused (status: ${job.status})`,
              }),
            );
          }

          // Verify it's paused at the expected node
          if (job.pausedAt !== nodeId) {
            console.error("Job is not paused at the expected node");
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_ERROR", {
                cause: `Job ${jobId} is paused at node ${job.pausedAt}, not ${nodeId}`,
              }),
            );
          }

          // Verify we have execution state
          if (!job.executionState) {
            console.error("Job has no execution state");
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_ERROR", {
                cause: `Job ${jobId} has no execution state`,
              }),
            );
          }

          // Reconstruct nodeResults from tasks
          const nodeResults = job.tasks.reduce(
            (acc, task) => {
              if (task.result !== undefined) {
                acc[task.nodeId] = task.result;
              }
              return acc;
            },
            {} as Record<string, unknown>,
          );

          // Update with new data
          const updatedNodeResults = {
            ...nodeResults,
            [nodeId]: newData,
          };

          const updatedInputs = {
            ...job.executionState.inputs,
            [nodeId]: newData,
          };

          // Update job status to running BEFORE forking background execution
          // This ensures the status is updated synchronously before events start firing
          yield* updateJob(jobId, {
            status: "running",
          });

          // Get the flow
          const flow = yield* flowProvider.getFlow(job.flowId, job.clientId);

          // Create external span from stored trace context if available
          // This links resumed flow to the original flow execution trace
          const parentSpan = job.traceContext
            ? Tracer.externalSpan({
                traceId: job.traceContext.traceId,
                spanId: job.traceContext.spanId,
                sampled: job.traceContext.traceFlags === 1,
              })
            : undefined;

          // Helper to resume flow in background
          const resumeFlowInBackground = Effect.gen(function* () {
            const flowWithEvents = withFlowEvents(flow, eventEmitter, kvStore);

            if (!job.executionState) {
              return yield* Effect.fail(
                UploadistaError.fromCode("FLOW_JOB_ERROR", {
                  cause: `Job ${jobId} has no execution state`,
                }),
              );
            }

            // Resume the flow with updated state
            const result = yield* flowWithEvents.resume({
              jobId,
              storageId: job.storageId,
              nodeResults: updatedNodeResults,
              executionState: {
                ...job.executionState,
                inputs: updatedInputs,
              },
              clientId: job.clientId,
            });

            // Handle result based on type
            if (result.type === "paused") {
              // Update job as paused again (node results are in tasks, not executionState)
              yield* updateJob(jobId, {
                status: "paused",
                pausedAt: result.nodeId,
                executionState: result.executionState,
                updatedAt: new Date(),
              });
            } else {
              // Update job as completed
              // Note: result field is already set by FlowEnd event handler with TypedOutput[]
              yield* updateJob(jobId, {
                status: "completed",
                pausedAt: undefined,
                executionState: undefined,
                updatedAt: new Date(),
                endedAt: new Date(),
              });

              // Cleanup intermediate files
              yield* cleanupIntermediateFiles(jobId, clientId);
            }

            return result;
          }).pipe(
            // Wrap resumed flow execution in a span for distributed tracing
            // Pass parent directly to link to original flow execution
            Effect.withSpan("flow-execution-resume", {
              attributes: {
                "flow.id": flow.id,
                "flow.name": flow.name,
                "flow.job_id": jobId,
                "flow.storage_id": job.storageId,
                "flow.resumed_from_node": nodeId,
              },
              parent: parentSpan,
            }),
          );

          const resumeFlowInBackgroundWithErrorHandling = resumeFlowInBackground.pipe(
            Effect.catchAll((error) =>
              Effect.gen(function* () {
                yield* Effect.logError("Flow resume failed", error);

                // Convert error to a proper message
                const errorMessage =
                  error instanceof UploadistaError ? error.body : String(error);

                yield* Effect.logInfo(
                  `Updating job ${jobId} to failed status with error: ${errorMessage}`,
                );

                // Update job as failed - do this FIRST before cleanup
                yield* updateJob(jobId, {
                  status: "failed",
                  error: errorMessage,
                  updatedAt: new Date(),
                }).pipe(
                  Effect.catchAll((updateError) =>
                    Effect.gen(function* () {
                      yield* Effect.logError(
                        `Failed to update job ${jobId}`,
                        updateError,
                      );
                      return Effect.succeed(undefined);
                    }),
                  ),
                );

                // Emit FlowError event to notify client
                const currentJob = yield* kvStore.get(jobId);
                if (currentJob) {
                  yield* eventEmitter
                    .emit(jobId, {
                      jobId,
                      eventType: EventType.FlowError,
                      flowId: currentJob.flowId,
                      error: errorMessage,
                    })
                    .pipe(
                      Effect.catchAll((emitError) =>
                        Effect.gen(function* () {
                          yield* Effect.logError(
                            `Failed to emit FlowError event for job ${jobId}`,
                            emitError,
                          );
                          return Effect.succeed(undefined);
                        }),
                      ),
                    );
                }

                // Cleanup intermediate files even on failure (don't let this fail the error handling)
                yield* cleanupIntermediateFiles(jobId, clientId).pipe(
                  Effect.catchAll((cleanupError) =>
                    Effect.gen(function* () {
                      yield* Effect.logWarning(
                        `Failed to cleanup intermediate files for job ${jobId}`,
                        cleanupError,
                      );
                      return Effect.succeed(undefined);
                    }),
                  ),
                );

                // Add failed job to Dead Letter Queue for retry/debugging
                const uploadistaError =
                  error instanceof UploadistaError
                    ? error
                    : new UploadistaError({
                        code: "UNKNOWN_ERROR",
                        status: 500,
                        body: String(error),
                        cause: error,
                      });
                yield* addToDeadLetterQueue(jobId, uploadistaError);

                throw error;
              }),
            ),
          );

          // Fork the resume execution to run in background
          // Use waitUntil if available (Cloudflare Workers), otherwise fork normally
          const resumeEffect = resumeFlowInBackgroundWithErrorHandling.pipe(
            Effect.tapErrorCause((cause) =>
              Effect.logError("Flow resume failed", cause),
            ),
          ) as Effect.Effect<
            FlowExecutionResult<Record<string, unknown>>,
            UploadistaError,
            never
          >;

          if (Option.isSome(waitUntil)) {
            // Cloudflare Workers: Use waitUntil to keep execution alive
            console.log(
              `[FlowServer] Using waitUntil for resume job: ${jobId}`,
            );
            const runtime = yield* Effect.runtime();
            const runnable = Runtime.runPromise(runtime);
            const promise = runnable(resumeEffect);
            waitUntil.value(promise);
          } else {
            // Standard environments: Fork normally as daemon
            console.log(
              `[FlowServer] Using Effect.forkDaemon for resume job: ${jobId}`,
            );
            yield* Effect.forkDaemon(resumeEffect);
          }

          // Return immediately with updated job
          const updatedJob = yield* kvStore.get(jobId);
          if (!updatedJob) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found after update`,
              }),
            );
          }
          return updatedJob;
        }),

      pauseFlow: (jobId: string, clientId: string | null) =>
        Effect.gen(function* () {
          // Get the current job
          const job = yield* kvStore.get(jobId);
          if (!job) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found`,
              }),
            );
          }

          // Verify authorization if clientId is provided
          if (clientId !== null && job.clientId !== clientId) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_NOT_AUTHORIZED", {
                cause: `Client ${clientId} is not authorized to pause job ${jobId}`,
              }),
            );
          }

          // Verify job can be paused (must be running)
          if (job.status !== "running") {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_ERROR", {
                cause: `Job ${jobId} cannot be paused (current status: ${job.status})`,
              }),
            );
          }

          // Find the currently running node (if any)
          const runningTask = job.tasks.find((t) => t.status === "running");
          const pausedAtNode = runningTask?.nodeId;

          // Update job status to paused
          yield* updateJob(jobId, {
            status: "paused",
            pausedAt: pausedAtNode,
            updatedAt: new Date(),
          });

          // Emit FlowPause event
          yield* eventEmitter.emit(jobId, {
            jobId,
            flowId: job.flowId,
            eventType: EventType.FlowPause,
            pausedAt: pausedAtNode,
          });

          // Return updated job
          const updatedJob = yield* kvStore.get(jobId);
          if (!updatedJob) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found after pause`,
              }),
            );
          }
          return updatedJob;
        }),

      cancelFlow: (jobId: string, clientId: string | null) =>
        Effect.gen(function* () {
          // Get the current job
          const job = yield* kvStore.get(jobId);
          if (!job) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found`,
              }),
            );
          }

          // Verify authorization if clientId is provided
          if (clientId !== null && job.clientId !== clientId) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_NOT_AUTHORIZED", {
                cause: `Client ${clientId} is not authorized to cancel job ${jobId}`,
              }),
            );
          }

          // Verify job can be cancelled (must be running or paused)
          if (
            job.status !== "running" &&
            job.status !== "paused" &&
            job.status !== "started"
          ) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_ERROR", {
                cause: `Job ${jobId} cannot be cancelled (current status: ${job.status})`,
              }),
            );
          }

          // Update job status to cancelled
          yield* updateJob(jobId, {
            status: "cancelled",
            updatedAt: new Date(),
            endedAt: new Date(),
          });

          // Emit FlowCancel event
          yield* eventEmitter.emit(jobId, {
            jobId,
            flowId: job.flowId,
            eventType: EventType.FlowCancel,
          });

          // Cleanup intermediate files
          yield* cleanupIntermediateFiles(jobId, clientId);

          // Return updated job
          const updatedJob = yield* kvStore.get(jobId);
          if (!updatedJob) {
            return yield* Effect.fail(
              UploadistaError.fromCode("FLOW_JOB_NOT_FOUND", {
                cause: `Job ${jobId} not found after cancellation`,
              }),
            );
          }
          return updatedJob;
        }),

      subscribeToFlowEvents: (jobId: string, connection: WebSocketConnection) =>
        Effect.gen(function* () {
          yield* eventEmitter.subscribe(jobId, connection);
        }),

      unsubscribeFromFlowEvents: (jobId: string) =>
        Effect.gen(function* () {
          yield* eventEmitter.unsubscribe(jobId);
        }),
    } satisfies FlowServerShape;
  });
}

// Export the FlowServer layer with job store dependency
export const flowServer = Layer.effect(FlowServer, createFlowServer());
export type FlowServerLayer = typeof flowServer;
