/**
 * Core Flow Engine implementation using Effect-based DAG execution.
 *
 * This module implements the Flow Engine, which executes directed acyclic graphs (DAGs)
 * of processing nodes. It supports sequential execution with topological sorting,
 * conditional node execution, retry logic, and pausable flows.
 *
 * @module flow
 * @see {@link createFlowWithSchema} for creating new flows
 * @see {@link Flow} for the flow type definition
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: any is used to allow for dynamic types */

import { Effect, Stream } from "effect";
import { z } from "zod";

import { UploadistaError } from "../errors";
import { CircuitBreakerStoreService } from "../types/circuit-breaker-store";
import { UploadFileDataStores } from "../types/data-store";
import type { UploadFile } from "../types/upload-file";
import type { CircuitBreakerConfig } from "./circuit-breaker";
import { DistributedCircuitBreakerRegistry } from "./distributed-circuit-breaker";
import type { FlowEdge } from "./edge";
import { EventType } from "./event";
import { getNodeData } from "./node";
import { ParallelScheduler } from "./parallel-scheduler";
import { isUploadFile } from "./type-guards";
import type {
  FlowCircuitBreakerConfig,
  FlowConfig,
  FlowNode,
  FlowNodeData,
  TypedOutput,
} from "./types/flow-types";
import { FlowTypeValidator } from "./types/type-validator";

/**
 * Serialized flow data for storage and transport.
 * Contains the minimal information needed to reconstruct a flow.
 *
 * @property id - Unique flow identifier
 * @property name - Human-readable flow name
 * @property nodes - Array of node data (without execution logic)
 * @property edges - Connections between nodes defining data flow
 */
export type FlowData = {
  id: string;
  name: string;
  nodes: FlowNodeData[];
  edges: FlowEdge[];
};

/**
 * Extracts serializable flow data from a Flow instance.
 * Useful for storing flow definitions or sending them over the network.
 *
 * @template TRequirements - Effect requirements for the flow
 * @param flow - Flow instance to extract data from
 * @returns Serializable flow data without execution logic
 *
 * @example
 * ```typescript
 * const flowData = getFlowData(myFlow);
 * // Store in database or send to client
 * await db.flows.save(flowData);
 * ```
 */
export const getFlowData = <TRequirements>(
  flow: Flow<any, any, TRequirements>,
): FlowData => {
  return {
    id: flow.id,
    name: flow.name,
    nodes: flow.nodes.map(getNodeData),
    edges: flow.edges,
  };
};

/**
 * Result of a flow execution - either completed or paused.
 *
 * @template TOutput - Type of the flow's output data
 *
 * @remarks
 * Flows can pause when a node needs additional data (e.g., waiting for user input
 * or external service). The execution state allows resuming from where it paused.
 *
 * @example
 * ```typescript
 * const result = await Effect.runPromise(flow.run({ inputs, storageId, jobId }));
 *
 * if (result.type === "completed") {
 *   console.log("Flow completed:", result.result);
 * } else {
 *   console.log("Flow paused at node:", result.nodeId);
 *   // Can resume later with: flow.resume({ jobId, executionState: result.executionState, ... })
 * }
 * ```
 */
export type FlowExecutionResult<TOutput> =
  | {
      type: "completed";
      result: TOutput;
      outputs?: TypedOutput[]; // Typed outputs from all output nodes with registered types
    }
  | {
      type: "paused";
      nodeId: string;
      executionState: {
        executionOrder: string[];
        currentIndex: number;
        inputs: Record<string, unknown>;
      };
    };

/**
 * A Flow represents a directed acyclic graph (DAG) of processing nodes.
 *
 * Flows execute nodes in topological order, passing data between nodes through edges.
 * They support conditional execution, retry logic, pausable nodes, and event emission.
 *
 * @template TFlowInputSchema - Zod schema defining the shape of input data
 * @template TFlowOutputSchema - Zod schema defining the shape of output data
 * @template TRequirements - Effect requirements (services/contexts) needed by nodes
 *
 * @property id - Unique flow identifier
 * @property name - Human-readable flow name
 * @property nodes - Array of nodes in the flow
 * @property edges - Connections between nodes
 * @property inputSchema - Zod schema for validating flow inputs
 * @property outputSchema - Zod schema for validating flow outputs
 * @property onEvent - Optional callback for flow execution events
 * @property run - Executes the flow from the beginning
 * @property resume - Resumes a paused flow execution
 * @property validateTypes - Validates node type compatibility
 * @property validateInputs - Validates input data against schema
 * @property validateOutputs - Validates output data against schema
 *
 * @remarks
 * Flows are created using {@link createFlowWithSchema}. The Effect-based design
 * allows for composable error handling, resource management, and dependency injection.
 *
 * @example
 * ```typescript
 * const flow = yield* createFlowWithSchema({
 *   flowId: "image-pipeline",
 *   name: "Image Processing Pipeline",
 *   nodes: [inputNode, resizeNode, optimizeNode, storageNode],
 *   edges: [
 *     { source: "input", target: "resize" },
 *     { source: "resize", target: "optimize" },
 *     { source: "optimize", target: "storage" }
 *   ],
 *   inputSchema: z.object({ file: z.instanceof(File) }),
 *   outputSchema: uploadFileSchema
 * });
 *
 * const result = yield* flow.run({
 *   inputs: { input: { file: myFile } },
 *   storageId: "storage-1",
 *   jobId: "job-123"
 * });
 * ```
 */
export type Flow<
  TFlowInputSchema extends z.ZodSchema<any>,
  TFlowOutputSchema extends z.ZodSchema<any>,
  TRequirements,
> = {
  id: string;
  name: string;
  nodes: FlowNode<any, any, UploadistaError>[];
  edges: FlowEdge[];
  inputSchema: TFlowInputSchema;
  outputSchema: TFlowOutputSchema;
  onEvent?: FlowConfig<
    TFlowInputSchema,
    TFlowOutputSchema,
    TRequirements
  >["onEvent"];
  checkJobStatus?: FlowConfig<
    TFlowInputSchema,
    TFlowOutputSchema,
    TRequirements
  >["checkJobStatus"];
  hooks?: FlowConfig<
    TFlowInputSchema,
    TFlowOutputSchema,
    TRequirements
  >["hooks"];
  run: (args: {
    inputs?: Record<string, z.infer<TFlowInputSchema>>;
    storageId: string;
    jobId: string;
    clientId: string | null;
  }) => Effect.Effect<
    FlowExecutionResult<Record<string, z.infer<TFlowOutputSchema>>>,
    UploadistaError,
    TRequirements | UploadFileDataStores
  >;
  resume: (args: {
    jobId: string;
    storageId: string;
    nodeResults: Record<string, unknown>; // Reconstructed from tasks
    executionState: {
      executionOrder: string[];
      currentIndex: number;
      inputs: Record<string, z.infer<TFlowInputSchema>>;
    };
    clientId: string | null;
  }) => Effect.Effect<
    FlowExecutionResult<Record<string, z.infer<TFlowOutputSchema>>>,
    UploadistaError,
    TRequirements | UploadFileDataStores
  >;
  validateTypes: () => { isValid: boolean; errors: string[] };
  validateInputs: (inputs: unknown) => { isValid: boolean; errors: string[] };
  validateOutputs: (outputs: unknown) => { isValid: boolean; errors: string[] };
};

/**
 * Creates a new Flow with Zod schema-based type validation.
 *
 * This is the primary way to create flows in Uploadista. It constructs a Flow
 * instance that validates inputs/outputs, executes nodes in topological order,
 * handles errors with retries, and emits events during execution.
 *
 * @template TFlowInputSchema - Zod schema for flow input validation
 * @template TFlowOutputSchema - Zod schema for flow output validation
 * @template TRequirements - Effect requirements/services needed by the flow
 * @template TNodeError - Union of possible errors from nodes
 * @template TNodeRequirements - Union of requirements from nodes
 *
 * @param config - Flow configuration object
 * @param config.flowId - Unique identifier for the flow
 * @param config.name - Human-readable flow name
 * @param config.nodes - Array of nodes (can be plain nodes or Effects resolving to nodes)
 * @param config.edges - Array of edges connecting nodes
 * @param config.inputSchema - Zod schema for validating inputs
 * @param config.outputSchema - Zod schema for validating outputs
 * @param config.typeChecker - Optional custom type compatibility checker
 * @param config.onEvent - Optional event callback for monitoring execution
 *
 * @returns Effect that resolves to a Flow instance
 *
 * @throws {UploadistaError} FLOW_CYCLE_ERROR if the graph contains cycles
 * @throws {UploadistaError} FLOW_NODE_NOT_FOUND if a node is referenced but missing
 * @throws {UploadistaError} FLOW_NODE_ERROR if node execution fails
 * @throws {UploadistaError} FLOW_OUTPUT_VALIDATION_ERROR if outputs don't match schema
 *
 * @remarks
 * - Nodes can be provided as plain objects or as Effects that resolve to nodes
 * - The flow performs topological sorting to determine execution order
 * - Conditional nodes are evaluated before execution
 * - Nodes can specify retry configuration with exponential backoff
 * - Pausable nodes can halt execution and resume later
 *
 * @example
 * ```typescript
 * const flow = yield* createFlowWithSchema({
 *   flowId: "image-upload",
 *   name: "Image Upload with Processing",
 *   nodes: [
 *     inputNode,
 *     yield* createResizeNode({ width: 1920, height: 1080 }),
 *     optimizeNode,
 *     storageNode
 *   ],
 *   edges: [
 *     { source: "input", target: "resize" },
 *     { source: "resize", target: "optimize" },
 *     { source: "optimize", target: "storage" }
 *   ],
 *   inputSchema: z.object({
 *     file: z.instanceof(File),
 *     metadata: z.record(z.string(), z.any()).optional()
 *   }),
 *   outputSchema: uploadFileSchema,
 *   onEvent: (event) => Effect.gen(function* () {
 *     console.log("Flow event:", event);
 *     return { eventId: event.jobId };
 *   })
 * });
 * ```
 *
 * @see {@link Flow} for the returned flow type
 * @see {@link FlowConfig} for configuration options
 */
export function createFlowWithSchema<
  TFlowInputSchema extends z.ZodSchema<any>,
  TFlowOutputSchema extends z.ZodSchema<any>,
  TRequirements = never,
  TNodeError = never,
  TNodeRequirements = never,
>(
  config: FlowConfig<
    TFlowInputSchema,
    TFlowOutputSchema,
    TNodeError,
    TNodeRequirements
  >,
): Effect.Effect<
  Flow<TFlowInputSchema, TFlowOutputSchema, TRequirements>,
  TNodeError,
  TNodeRequirements
> {
  return Effect.gen(function* () {
    // Resolve nodes - handle mixed arrays of pure nodes and Effect nodes
    const resolvedNodes: Array<FlowNode<any, any, UploadistaError>> =
      yield* Effect.all(
        config.nodes.map((node) =>
          Effect.isEffect(node)
            ? (node as Effect.Effect<
                FlowNode<any, any, UploadistaError>,
                TNodeError,
                TNodeRequirements
              >)
            : Effect.succeed(node as FlowNode<any, any, UploadistaError>),
        ),
      );

    const {
      flowId,
      name,
      onEvent,
      checkJobStatus,
      edges,
      inputSchema,
      outputSchema,
      typeChecker,
      circuitBreaker: circuitBreakerConfig,
    } = config;
    const nodes = resolvedNodes;
    const typeValidator = new FlowTypeValidator(typeChecker);

    /**
     * Gets the circuit breaker config for a specific node.
     * Priority: node config > flow nodeTypeOverrides > flow defaults
     */
    const getCircuitBreakerConfigForNode = (
      node: FlowNode<any, any, UploadistaError>,
    ): CircuitBreakerConfig | undefined => {
      // Get node-level config from the resolved node
      const nodeConfig = node.circuitBreaker as
        | FlowCircuitBreakerConfig
        | undefined;

      // Get flow-level config for this node type (using nodeTypeId for stable identification)
      const flowNodeTypeConfig = node.nodeTypeId
        ? circuitBreakerConfig?.nodeTypeOverrides?.[node.nodeTypeId]
        : undefined;

      // Get flow defaults
      const flowDefaults = circuitBreakerConfig?.defaults;

      // If nothing is configured, return undefined (circuit breaker disabled)
      if (!nodeConfig && !flowNodeTypeConfig && !flowDefaults) {
        return undefined;
      }

      // Merge configs with priority: node > nodeTypeOverrides > defaults
      return {
        ...flowDefaults,
        ...flowNodeTypeConfig,
        ...nodeConfig,
      } as CircuitBreakerConfig;
    };

    // Build adjacency list for topological sorting
    const buildGraph = () => {
      const graph: Record<string, string[]> = {};
      const inDegree: Record<string, number> = {};
      const reverseGraph: Record<string, string[]> = {};

      // Initialize
      nodes.forEach((node: any) => {
        graph[node.id] = [];
        reverseGraph[node.id] = [];
        inDegree[node.id] = 0;
      });

      // Build edges
      edges.forEach((edge: any) => {
        graph[edge.source]?.push(edge.target);
        reverseGraph[edge.target]?.push(edge.source);
        inDegree[edge.target] = (inDegree[edge.target] || 0) + 1;
      });

      return { graph, reverseGraph, inDegree };
    };

    // Topological sort to determine execution order
    const topologicalSort = () => {
      const { graph, inDegree } = buildGraph();
      const queue: string[] = [];
      const result: string[] = [];

      // Add nodes with no incoming edges
      Object.keys(inDegree).forEach((nodeId) => {
        if (inDegree[nodeId] === 0) {
          queue.push(nodeId);
        }
      });

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          throw new Error("No current node found");
        }
        result.push(current);

        graph[current]?.forEach((neighbor: any) => {
          inDegree[neighbor] = (inDegree[neighbor] || 0) - 1;
          if (inDegree[neighbor] === 0) {
            queue.push(neighbor);
          }
        });
      }

      return result;
    };

    // Evaluate condition for conditional nodes using Effect
    const evaluateCondition = (
      node: FlowNode<any, any, UploadistaError>,
      data: unknown,
    ): Effect.Effect<boolean, never> => {
      if (!node.condition) return Effect.succeed(true);

      const { field, operator, value } = node.condition;
      const dataRecord = data as Record<string, unknown>;
      const metadata = dataRecord?.metadata as
        | Record<string, unknown>
        | undefined;
      const fieldValue = metadata?.[field] || dataRecord?.[field];

      const result = (() => {
        switch (operator) {
          case "equals":
            return fieldValue === value;
          case "notEquals":
            return fieldValue !== value;
          case "greaterThan":
            return Number(fieldValue) > Number(value);
          case "lessThan":
            return Number(fieldValue) < Number(value);
          case "contains":
            return String(fieldValue).includes(String(value));
          case "startsWith":
            return String(fieldValue).startsWith(String(value));
          default:
            return true;
        }
      })();

      return Effect.succeed(result);
    };

    // Get all inputs for a node
    const getNodeInputs = (
      nodeId: string,
      nodeResults: Map<string, unknown>,
    ) => {
      const { reverseGraph } = buildGraph();
      const incomingNodes = reverseGraph[nodeId] || [];
      const inputs: Record<string, unknown> = {};

      incomingNodes.forEach((sourceNodeId: any) => {
        const result = nodeResults.get(sourceNodeId);
        if (result !== undefined) {
          inputs[sourceNodeId] = result;
        }
      });

      return inputs;
    };

    // Map flow inputs to input nodes
    const mapFlowInputsToNodes = (
      flowInputs: Record<string, z.infer<TFlowInputSchema>>,
    ) => {
      const inputNodes = nodes.filter((node: any) => node.type === "input");
      const mappedInputs: Record<string, z.infer<TFlowInputSchema>> = {};

      inputNodes.forEach((node: any) => {
        if (
          flowInputs &&
          typeof flowInputs === "object" &&
          node.id in flowInputs
        ) {
          mappedInputs[node.id] = inputSchema.parse(flowInputs[node.id]);
        }
      });

      return mappedInputs;
    };

    // Utility to detect sink nodes (nodes with no outgoing edges)
    const isSink = (nodeId: string): boolean => {
      return !edges.some((edge) => edge.source === nodeId);
    };

    // Utility to check if a node should be included in outputs
    // Includes both sink nodes (topology-based) and nodes with keepOutput flag
    const shouldIncludeInOutputs = (nodeId: string): boolean => {
      const node = nodes.find((n: any) => n.id === nodeId);
      return isSink(nodeId) || node?.keepOutput === true;
    };

    // Collect outputs from sink nodes (nodes with no outgoing edges) and nodes with keepOutput
    const collectFlowOutputs = (
      nodeResults: Map<string, unknown>,
    ): Record<string, z.infer<TFlowInputSchema>> => {
      const outputNodes = nodes.filter((node: any) =>
        shouldIncludeInOutputs(node.id),
      );
      const flowOutputs: Record<string, unknown> = {};

      outputNodes.forEach((node: any) => {
        const result = nodeResults.get(node.id);
        if (result !== undefined) {
          flowOutputs[node.id] = result;
        }
      });

      return flowOutputs as Record<string, z.infer<TFlowInputSchema>>;
    };

    // Collect typed outputs from sink nodes and keepOutput nodes with metadata
    const collectTypedOutputs = (
      nodeResults: Map<string, unknown>,
      nodeTypesMap: Map<string, string>,
    ): TypedOutput[] => {
      const outputNodes = nodes.filter((node: any) =>
        shouldIncludeInOutputs(node.id),
      );
      const typedOutputs: TypedOutput[] = [];

      outputNodes.forEach((node: any) => {
        const result = nodeResults.get(node.id);
        if (result !== undefined) {
          // Get the outputTypeId from the node types map (set from node execution results)
          const outputTypeId = nodeTypesMap.get(node.id);

          // Create TypedOutput with metadata
          typedOutputs.push({
            nodeId: node.id,
            nodeType: outputTypeId,
            data: result,
            timestamp: new Date().toISOString(),
          });
        }
      });

      return typedOutputs;
    };

    // Transfer an UploadFile from one storage to another
    const transferFileToTargetStorage = (
      file: UploadFile,
      targetStorageId: string,
      clientId: string | null,
    ): Effect.Effect<UploadFile, UploadistaError, UploadFileDataStores> => {
      return Effect.gen(function* () {
        // If file is already in target storage, no transfer needed
        if (file.storage.id === targetStorageId) {
          return file;
        }

        // Get source and target data stores
        const dataStores = yield* UploadFileDataStores;
        const sourceDataStore = yield* dataStores.getDataStore(
          file.storage.id,
          clientId,
        );
        const targetDataStore = yield* dataStores.getDataStore(
          targetStorageId,
          clientId,
        );

        // Read file from source storage
        const fileData = yield* sourceDataStore.read(file.id);

        // Create stream from file data
        const dataStream = Stream.make(fileData);

        // Create new file record in target storage
        const transferredFile: UploadFile = {
          ...file,
          storage: {
            id: targetStorageId,
            type: file.storage.type, // Keep same type for now
          },
        };

        const createdFile = yield* targetDataStore.create(transferredFile);

        // Write file data to target storage
        yield* targetDataStore.write(
          {
            file_id: createdFile.id,
            stream: dataStream,
            offset: 0,
          },
          {},
        );

        return createdFile;
      });
    };

    // Execute a single node using Effect
    const executeNode = (
      nodeId: string,
      storageId: string,
      nodeInputs: Record<string, z.infer<TFlowInputSchema>>,
      nodeResults: Map<string, unknown>,
      nodeMap: Map<string, FlowNode<any, any, UploadistaError>>,
      jobId: string,
      clientId: string | null,
      circuitBreakerRegistry: DistributedCircuitBreakerRegistry | null,
    ): Effect.Effect<
      {
        nodeId: string;
        result: unknown;
        success: boolean;
        waiting: boolean;
        nodeType?: string;
      },
      UploadistaError,
      UploadFileDataStores
    > => {
      return Effect.gen(function* () {
        const node = nodeMap.get(nodeId);
        if (!node) {
          return yield* UploadistaError.fromCode(
            "FLOW_NODE_NOT_FOUND",
          ).toEffect();
        }

        // Check job status before executing node
        if (checkJobStatus) {
          const status = yield* checkJobStatus(jobId);
          if (status === "paused") {
            // Flow was paused by user - stop execution gracefully
            return yield* UploadistaError.fromCode("FLOW_PAUSED", {
              cause: `Flow ${flowId} was paused by user at job ${jobId}`,
            }).toEffect();
          }
          if (status === "cancelled") {
            // Flow was cancelled by user - stop execution
            return yield* UploadistaError.fromCode("FLOW_CANCELLED", {
              cause: `Flow ${flowId} was cancelled by user at job ${jobId}`,
            }).toEffect();
          }
        }

        // Emit NodeStart event if provided
        if (onEvent) {
          yield* onEvent({
            jobId,
            flowId,
            nodeId,
            eventType: EventType.NodeStart,
            nodeName: node.name,
            nodeType: node.type,
          });
        }

        // Get retry configuration
        const maxRetries = node.retry?.maxRetries ?? 0;
        const baseDelay = node.retry?.retryDelay ?? 1000;
        const useExponentialBackoff = node.retry?.exponentialBackoff ?? true;

        // Get circuit breaker configuration for this node
        const cbConfig = getCircuitBreakerConfigForNode(node);
        const circuitBreaker =
          cbConfig?.enabled && node.nodeTypeId && circuitBreakerRegistry
            ? circuitBreakerRegistry.getOrCreate(node.nodeTypeId, cbConfig)
            : null;

        // Check circuit breaker before attempting execution
        if (circuitBreaker) {
          const {
            allowed,
            state: cbState,
            failureCount: cbFailureCount,
          } = yield* circuitBreaker.allowRequest();

          if (!allowed) {
            const fallback = circuitBreaker.getFallback();

            yield* Effect.logWarning(
              `Circuit breaker OPEN for node type "${node.nodeTypeId}" - applying fallback`,
            );

            // Handle fallback based on configuration
            if (fallback.type === "skip") {
              // Skip the node but continue flow execution
              if (onEvent) {
                yield* onEvent({
                  jobId,
                  flowId,
                  nodeId,
                  eventType: EventType.NodeEnd,
                  nodeName: node.name,
                });
              }

              // For skip fallback, we need to pass through some value
              // Get the first input as pass-through data
              const passThruInput = nodeInputs[nodeId];
              return {
                nodeId,
                result: passThruInput,
                success: true,
                waiting: false,
              };
            }

            if (fallback.type === "default") {
              // Return configured default value
              if (onEvent) {
                yield* onEvent({
                  jobId,
                  flowId,
                  nodeId,
                  eventType: EventType.NodeEnd,
                  nodeName: node.name,
                  result: fallback.value,
                });
              }
              return {
                nodeId,
                result: fallback.value,
                success: true,
                waiting: false,
              };
            }

            // Default: fail immediately
            return yield* UploadistaError.fromCode("CIRCUIT_BREAKER_OPEN", {
              body: `Circuit breaker is open for node type "${node.name}"`,
              details: {
                nodeType: node.name,
                nodeId,
                state: cbState,
                failureCount: cbFailureCount,
              },
            }).toEffect();
          }
        }

        let retryCount = 0;
        let lastError: UploadistaError | null = null;

        // Retry loop
        while (retryCount <= maxRetries) {
          try {
            // Prepare input data for the node
            let nodeInput: unknown;
            let nodeInputsForExecution: Record<string, unknown> = {};

            if (node.type === "input") {
              // For input nodes, use the mapped flow input
              nodeInput = nodeInputs[nodeId];
              if (nodeInput === undefined) {
                yield* Effect.logError(
                  `Input node ${nodeId} has no input data`,
                );
                return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                  cause: new Error(`Input node ${nodeId} has no input data`),
                }).toEffect();
              }
            } else {
              // Get all inputs for the node
              nodeInputsForExecution = getNodeInputs(nodeId, nodeResults);

              if (Object.keys(nodeInputsForExecution).length === 0) {
                yield* Effect.logError(`Node ${nodeId} has no input data`);
                return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                  cause: new Error(`Node ${nodeId} has no input data`),
                }).toEffect();
              }

              // For single input nodes, use the first input
              if (!node.multiInput) {
                const firstInputKey = Object.keys(nodeInputsForExecution)[0];
                if (!firstInputKey) {
                  return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
                    cause: new Error(`Node ${nodeId} has no input data`),
                  }).toEffect();
                }
                nodeInput = nodeInputsForExecution[firstInputKey];
              } else {
                // For multi-input nodes, pass all inputs
                nodeInput = nodeInputsForExecution;
              }
            }

            // Check condition for conditional nodes
            if (node.type === "conditional") {
              const conditionResult = yield* evaluateCondition(node, nodeInput);
              if (!conditionResult) {
                // Skip this node - return success but no result
                if (onEvent) {
                  yield* onEvent({
                    jobId,
                    flowId,
                    nodeId,
                    eventType: EventType.NodeEnd,
                    nodeName: node.name,
                  });
                }
                return {
                  nodeId,
                  result: nodeInput,
                  success: true,
                  waiting: false,
                };
              }
            }

            // Execute the node
            const executionResult = yield* node.run({
              data: nodeInput,
              inputs: nodeInputsForExecution,
              jobId,
              flowId,
              storageId,
              clientId,
            });

            // Handle execution result
            if (executionResult.type === "waiting") {
              // Node is waiting for more data - pause execution
              const result = executionResult.partialData;

              // Emit NodePause event with partial data result
              if (onEvent) {
                yield* onEvent({
                  jobId,
                  flowId,
                  nodeId,
                  eventType: EventType.NodePause,
                  nodeName: node.name,
                  partialData: result,
                });
              }

              return {
                nodeId,
                result,
                success: true,
                waiting: true,
                nodeType: executionResult.nodeType,
              };
            }

            // Node completed successfully
            let result = executionResult.data;

            // Auto-persistence and hooks for sink nodes and nodes with keepOutput
            if (shouldIncludeInOutputs(nodeId)) {
              // If result is an UploadFile, transfer to target storage if needed
              if (isUploadFile(result) && result.storage.id !== storageId) {
                yield* Effect.logDebug(
                  `Auto-persisting output node ${nodeId} output from ${result.storage.id} to ${storageId}`,
                );
                result = yield* transferFileToTargetStorage(
                  result,
                  storageId,
                  clientId,
                );
              }

              // Call onNodeOutput hook if provided (for all sink outputs)
              if (config.hooks?.onNodeOutput) {
                yield* Effect.logDebug(
                  `Calling onNodeOutput hook for sink node ${nodeId}`,
                );
                const hookResult = config.hooks.onNodeOutput({
                  output: result,
                  nodeId,
                  flowId,
                  jobId,
                  storageId,
                  clientId,
                });

                // Support both Effect and Promise
                result = yield* (Effect.isEffect(hookResult)
                  ? hookResult
                  : Effect.promise(() => hookResult as Promise<unknown>));
              }
            }

            // Record success with circuit breaker
            if (circuitBreaker) {
              yield* circuitBreaker.recordSuccess();
            }

            // Emit NodeEnd event with result
            if (onEvent) {
              yield* onEvent({
                jobId,
                flowId,
                nodeId,
                eventType: EventType.NodeEnd,
                nodeName: node.name,
                result,
              });
            }

            return {
              nodeId,
              result,
              success: true,
              waiting: false,
              nodeType: executionResult.nodeType,
            };
          } catch (error) {
            // Store the error
            lastError =
              error instanceof UploadistaError
                ? error
                : UploadistaError.fromCode("FLOW_NODE_ERROR", { cause: error });

            // Record failure with circuit breaker (on each retry attempt)
            if (circuitBreaker) {
              yield* circuitBreaker.recordFailure(lastError.body);
            }

            // Check if we should retry
            if (retryCount < maxRetries) {
              retryCount++;

              // Calculate delay with exponential backoff if enabled
              const delay = useExponentialBackoff
                ? baseDelay * 2 ** (retryCount - 1)
                : baseDelay;

              // Log retry attempt
              yield* Effect.logWarning(
                `Node ${nodeId} (${node.name}) failed, retrying (${retryCount}/${maxRetries}) after ${delay}ms`,
              );

              // Wait before retrying
              yield* Effect.sleep(delay);

              // Continue to next iteration of retry loop
              continue;
            }

            // No more retries - emit final error event
            if (onEvent) {
              yield* onEvent({
                jobId,
                flowId,
                nodeId,
                eventType: EventType.NodeError,
                nodeName: node.name,
                error: lastError.body,
                retryCount,
              });
            }

            return yield* lastError.toEffect();
          }
        }

        // If we get here, all retries failed
        if (lastError) {
          return yield* lastError.toEffect();
        }

        // Should never reach here
        return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
          cause: new Error("Unexpected error in retry loop"),
        }).toEffect();
      }).pipe(
        // Wrap node execution in a span for distributed tracing
        // Note: We get node info from the nodeMap since we're outside the Effect.gen scope
        (() => {
          const node = nodeMap.get(nodeId);
          return Effect.withSpan(`node-${node?.type ?? "unknown"}`, {
            attributes: {
              "node.id": nodeId,
              "node.type": node?.type ?? "unknown",
              "node.name": node?.name ?? "unknown",
              "flow.id": flowId,
              "flow.job_id": jobId,
            },
          });
        })(),
      );
    };

    // Internal execution function that can start fresh or resume
    const executeFlow = ({
      inputs,
      storageId,
      jobId,
      resumeFrom,
      clientId,
    }: {
      inputs?: Record<string, z.infer<TFlowInputSchema>>;
      storageId: string;
      jobId: string;
      resumeFrom?: {
        executionOrder: string[];
        nodeResults: Map<string, unknown>;
        currentIndex: number;
      };
      clientId: string | null;
    }): Effect.Effect<
      | {
          type: "completed";
          result: Record<string, z.infer<TFlowOutputSchema>>;
          outputs?: TypedOutput[];
        }
      | {
          type: "paused";
          nodeId: string;
          executionState: {
            executionOrder: string[];
            currentIndex: number;
            inputs: Record<string, z.infer<TFlowInputSchema>>;
          };
        },
      UploadistaError,
      UploadFileDataStores
    > => {
      return Effect.gen(function* () {
        // Get circuit breaker store from context (optional - if not provided, circuit breakers are disabled)
        const circuitBreakerStore = yield* Effect.serviceOption(
          CircuitBreakerStoreService,
        );
        const circuitBreakerRegistry = circuitBreakerStore._tag === "Some"
          ? new DistributedCircuitBreakerRegistry(circuitBreakerStore.value)
          : null;

        // Emit FlowStart event only if starting fresh
        if (!resumeFrom && onEvent) {
          yield* onEvent({
            jobId,
            eventType: EventType.FlowStart,
            flowId,
          });
        }

        // Map flow inputs to input nodes
        const nodeInputs = mapFlowInputsToNodes(inputs || {});

        // Get execution order and results - either fresh or from resume state
        let executionOrder: string[];
        let nodeResults: Map<string, unknown>;
        let startIndex: number;

        if (resumeFrom) {
          // Resume from saved state
          executionOrder = resumeFrom.executionOrder;
          nodeResults = resumeFrom.nodeResults;
          startIndex = resumeFrom.currentIndex;
        } else {
          // Start fresh
          executionOrder = topologicalSort();
          nodeResults = new Map<string, unknown>();
          startIndex = 0;
        }

        // Track nodeTypes for typed outputs
        const nodeTypes = new Map<string, string>();

        // If resuming, restore any nodeTypes from previous execution
        if (resumeFrom) {
          // nodeTypes would need to be restored from job state if implementing pause/resume
          // For now, fresh starts only track types going forward
        }

        // Check for cycles
        if (executionOrder.length !== nodes.length) {
          return yield* UploadistaError.fromCode("FLOW_CYCLE_ERROR").toEffect();
        }

        // Create node map for quick lookup
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));

        // Determine execution strategy
        const useParallelExecution = config.parallelExecution?.enabled ?? false;

        if (useParallelExecution) {
          // Parallel execution using execution levels
          yield* Effect.logDebug(
            `Flow ${flowId}: Executing in parallel mode (maxConcurrency: ${config.parallelExecution?.maxConcurrency ?? 4})`,
          );

          const scheduler = new ParallelScheduler({
            maxConcurrency: config.parallelExecution?.maxConcurrency ?? 4,
          });

          // Get execution levels
          const executionLevels = scheduler.groupNodesByExecutionLevel(
            nodes,
            edges,
          );

          yield* Effect.logDebug(
            `Flow ${flowId}: Grouped nodes into ${executionLevels.length} execution levels`,
          );

          // Build reverse graph for dependency checking
          const reverseGraph: Record<string, string[]> = {};
          nodes.forEach((node) => {
            reverseGraph[node.id] = [];
          });
          edges.forEach((edge) => {
            reverseGraph[edge.target]?.push(edge.source);
          });

          // Execute each level sequentially, but nodes within level in parallel
          for (const level of executionLevels) {
            yield* Effect.logDebug(
              `Flow ${flowId}: Executing level ${level.level} with nodes: ${level.nodes.join(", ")}`,
            );

            // Create executor functions for all nodes in this level
            const nodeExecutors = level.nodes.map(
              (nodeId) => () =>
                Effect.gen(function* () {
                  // Emit NodeResume event if we're resuming from a paused state at this node
                  if (
                    resumeFrom &&
                    nodeId === resumeFrom.executionOrder[startIndex] &&
                    onEvent
                  ) {
                    const node = nodeMap.get(nodeId);
                    if (node) {
                      yield* onEvent({
                        jobId,
                        flowId,
                        nodeId,
                        eventType: EventType.NodeResume,
                        nodeName: node.name,
                        nodeType: node.type,
                      });
                    }
                  }

                  const nodeResult = yield* executeNode(
                    nodeId,
                    storageId,
                    nodeInputs,
                    nodeResults,
                    nodeMap,
                    jobId,
                    clientId,
                    circuitBreakerRegistry,
                  );

                  return { nodeId, nodeResult };
                }),
            );

            // Execute all nodes in this level in parallel
            const levelResults =
              yield* scheduler.executeNodesInParallel(nodeExecutors);

            // Process results and check for waiting nodes
            for (const { nodeId, nodeResult } of levelResults) {
              if (nodeResult.waiting) {
                // Node is waiting - pause execution and return state
                if (nodeResult.result !== undefined) {
                  nodeResults.set(nodeId, nodeResult.result);
                  if (nodeResult.nodeType) {
                    nodeTypes.set(nodeId, nodeResult.nodeType);
                  }
                }

                return {
                  type: "paused" as const,
                  nodeId,
                  executionState: {
                    executionOrder,
                    currentIndex: executionOrder.indexOf(nodeId),
                    inputs: nodeInputs,
                  },
                };
              }

              if (nodeResult.success) {
                nodeResults.set(nodeId, nodeResult.result);
                if (nodeResult.nodeType) {
                  nodeTypes.set(nodeId, nodeResult.nodeType);
                }
              }
            }
          }
        } else {
          // Sequential execution (original behavior)
          yield* Effect.logDebug(
            `Flow ${flowId}: Executing in sequential mode`,
          );

          for (let i = startIndex; i < executionOrder.length; i++) {
            const nodeId = executionOrder[i];
            if (!nodeId) {
              return yield* UploadistaError.fromCode(
                "FLOW_NODE_NOT_FOUND",
              ).toEffect();
            }

            // Emit NodeResume event if we're resuming from a paused state at this node
            if (resumeFrom && i === startIndex && onEvent) {
              const node = nodeMap.get(nodeId);
              if (node) {
                yield* onEvent({
                  jobId,
                  flowId,
                  nodeId,
                  eventType: EventType.NodeResume,
                  nodeName: node.name,
                  nodeType: node.type,
                });
              }
            }

            const nodeResult = yield* executeNode(
              nodeId,
              storageId,
              nodeInputs,
              nodeResults,
              nodeMap,
              jobId,
              clientId,
              circuitBreakerRegistry,
            );

            if (nodeResult.waiting) {
              // Node is waiting - pause execution and return state
              if (nodeResult.result !== undefined) {
                nodeResults.set(nodeResult.nodeId, nodeResult.result);
                if (nodeResult.nodeType) {
                  nodeTypes.set(nodeResult.nodeId, nodeResult.nodeType);
                }
              }

              return {
                type: "paused" as const,
                nodeId: nodeResult.nodeId,
                executionState: {
                  executionOrder,
                  currentIndex: i, // Stay at current index to re-execute this node on resume
                  inputs: nodeInputs,
                },
              };
            }

            if (nodeResult.success) {
              nodeResults.set(nodeResult.nodeId, nodeResult.result);
              if (nodeResult.nodeType) {
                nodeTypes.set(nodeResult.nodeId, nodeResult.nodeType);
              }
            }
          }
        }

        // All nodes completed - collect outputs
        const finalResult = collectFlowOutputs(nodeResults);
        const typedOutputs = collectTypedOutputs(nodeResults, nodeTypes);

        const finalResultSchema = z.record(z.string(), outputSchema);

        // Validate the final result against the output schema
        const parseResult = finalResultSchema.safeParse(finalResult);
        if (!parseResult.success) {
          const validationError = `Flow output validation failed: ${parseResult.error.message}. Expected outputs: ${JSON.stringify(Object.keys(collectFlowOutputs(nodeResults)))}. Output nodes (sinks + keepOutput): ${nodes
            .filter((n: any) => shouldIncludeInOutputs(n.id))
            .map((n: any) => n.id)
            .join(", ")}`;

          // Emit FlowError event for validation failure
          if (onEvent) {
            yield* onEvent({
              jobId,
              eventType: EventType.FlowError,
              flowId,
              error: validationError,
            });
          }
          return yield* UploadistaError.fromCode(
            "FLOW_OUTPUT_VALIDATION_ERROR",
            {
              body: validationError,
              cause: parseResult.error,
            },
          ).toEffect();
        }
        const validatedResult = parseResult.data;

        // Emit FlowEnd event with typed outputs
        if (onEvent) {
          yield* onEvent({
            jobId,
            eventType: EventType.FlowEnd,
            flowId,
            outputs: typedOutputs,
            result: validatedResult, // Keep for backward compatibility
          });
        }

        return {
          type: "completed" as const,
          result: validatedResult,
          outputs: typedOutputs,
        };
      });
    };

    const run = ({
      inputs,
      storageId,
      jobId,
      clientId,
    }: {
      inputs?: Record<string, z.infer<TFlowInputSchema>>;
      storageId: string;
      jobId: string;
      clientId: string | null;
    }): Effect.Effect<
      | {
          type: "completed";
          result: Record<string, z.infer<TFlowOutputSchema>>;
          outputs?: TypedOutput[];
        }
      | {
          type: "paused";
          nodeId: string;
          executionState: {
            executionOrder: string[];
            currentIndex: number;
            inputs: Record<string, z.infer<TFlowInputSchema>>;
          };
        },
      UploadistaError,
      TRequirements | UploadFileDataStores
    > => {
      return executeFlow({ inputs, storageId, jobId, clientId });
    };

    const resume = ({
      jobId,
      storageId,
      nodeResults,
      executionState,
      clientId,
    }: {
      jobId: string;
      storageId: string;
      nodeResults: Record<string, unknown>;
      executionState: {
        executionOrder: string[];
        currentIndex: number;
        inputs: Record<string, z.infer<TFlowInputSchema>>;
      };
      clientId: string | null;
    }): Effect.Effect<
      | {
          type: "completed";
          result: Record<string, z.infer<TFlowOutputSchema>>;
          outputs?: TypedOutput[];
        }
      | {
          type: "paused";
          nodeId: string;
          executionState: {
            executionOrder: string[];
            currentIndex: number;
            inputs: Record<string, z.infer<TFlowInputSchema>>;
          };
        },
      UploadistaError,
      TRequirements | UploadFileDataStores
    > => {
      return executeFlow({
        inputs: executionState.inputs,
        storageId,
        jobId,
        resumeFrom: {
          executionOrder: executionState.executionOrder,
          nodeResults: new Map(Object.entries(nodeResults)),
          currentIndex: executionState.currentIndex,
        },
        clientId,
      });
    };

    const validateTypes = () => {
      // Convert FlowNode to FlowNode for validation
      const compatibleNodes = nodes as FlowNode<any, any>[];
      return typeValidator.validateFlow(compatibleNodes, edges);
    };

    const validateInputs = (inputs: unknown) => {
      return typeValidator.validateData(inputs, inputSchema);
    };

    const validateOutputs = (outputs: unknown) => {
      return typeValidator.validateData(outputs, outputSchema);
    };

    return {
      id: flowId,
      name,
      nodes,
      edges,
      inputSchema,
      outputSchema,
      onEvent,
      checkJobStatus,
      hooks: config.hooks,
      run,
      resume,
      validateTypes,
      validateInputs,
      validateOutputs,
    };
  });
}
