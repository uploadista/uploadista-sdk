/**
 * Core flow type definitions and node specifications.
 *
 * This module defines the fundamental types for the Flow Engine, including node
 * definitions, execution results, edges, and configuration. These types form the
 * foundation of the DAG processing system.
 *
 * @module flow/types/flow-types
 * @see {@link FlowNode} for node specification
 * @see {@link FlowConfig} for flow configuration
 */

/** biome-ignore-all lint/suspicious/noExplicitAny: any is used to allow for dynamic types */

import type { Effect } from "effect";
import type { z } from "zod";
import type { UploadistaError } from "../../errors";
import type { FlowEvent, FlowEventFlowEnd, FlowEventFlowStart } from "../event";
import { NodeType } from "../node";

/**
 * Type mapping for node input/output schemas.
 * Used for type-safe node connections in typed flows.
 */
export type NodeTypeMap = Record<string, { input: unknown; output: unknown }>;

/**
 * Minimal node data without execution logic.
 * Used for serialization and UI display.
 *
 * @property id - Unique node identifier
 * @property name - Human-readable node name
 * @property description - Explanation of what the node does
 * @property type - Node category (input, transform, conditional, output, etc.)
 */
export type FlowNodeData = {
  id: string;
  name: string;
  description: string;
  type: NodeType;
};

/**
 * Result of a node execution - either complete or waiting for more data.
 *
 * @template TOutput - Type of the node's output data
 *
 * @remarks
 * Nodes can return "waiting" to pause flow execution when they need additional
 * data (e.g., chunked uploads, external service responses). The flow can be
 * resumed later with the missing data.
 *
 * @example
 * ```typescript
 * // Node completes immediately
 * return completeNodeExecution({ processedData });
 *
 * // Node waits for more chunks
 * if (needsMoreData) {
 *   return waitingNodeExecution({ receivedChunks: 3, totalChunks: 10 });
 * }
 * ```
 */
export type NodeExecutionResult<TOutput> =
  | { type: "complete"; data: TOutput }
  | { type: "waiting"; partialData?: unknown };

/**
 * Helper function to create a complete node execution result.
 *
 * @template TOutput - Type of the output data
 * @param data - The output data from the node
 * @returns A complete execution result
 *
 * @example
 * ```typescript
 * return completeNodeExecution({
 *   url: uploadedFile.url,
 *   size: uploadedFile.size
 * });
 * ```
 */
export const completeNodeExecution = <TOutput>(data: TOutput) => ({
  type: "complete" as const,
  data,
});

/**
 * Helper function to create a waiting node execution result.
 *
 * @param partialData - Optional partial data available so far
 * @returns A waiting execution result that pauses the flow
 *
 * @example
 * ```typescript
 * // Wait for more upload chunks
 * return waitingNodeExecution({
 *   receivedBytes: currentSize,
 *   totalBytes: expectedSize
 * });
 * ```
 */
export const waitingNodeExecution = (partialData?: unknown) => ({
  type: "waiting" as const,
  partialData,
});

/**
 * A flow node represents a single processing step in the DAG.
 *
 * Nodes are the building blocks of flows. Each node has typed inputs/outputs,
 * execution logic, and optional features like conditions, retries, and pausing.
 *
 * @template TInput - Type of data the node accepts
 * @template TOutput - Type of data the node produces
 * @template TError - Type of errors the node can throw
 *
 * @property inputSchema - Zod schema for validating input data
 * @property outputSchema - Zod schema for validating output data
 * @property run - Effect-based execution function
 * @property condition - Optional conditional execution rule
 * @property multiInput - Whether node accepts multiple inputs (default: false)
 * @property multiOutput - Whether node produces multiple outputs (default: false)
 * @property pausable - Whether node can pause execution (default: false)
 * @property retry - Optional retry configuration
 *
 * @remarks
 * - Nodes use Effect for composable error handling and dependency injection
 * - Input/output schemas ensure type safety at runtime
 * - Conditions are evaluated before execution
 * - Retry logic supports exponential backoff
 * - Pausable nodes can halt flow execution and resume later
 *
 * @example
 * ```typescript
 * const resizeNode: FlowNode<InputFile, UploadFile> = {
 *   id: "resize",
 *   name: "Resize Image",
 *   description: "Resize image to specified dimensions",
 *   type: NodeType.transform,
 *   inputSchema: inputFileSchema,
 *   outputSchema: uploadFileSchema,
 *   run: ({ data, storageId }) => Effect.gen(function* () {
 *     const resized = yield* resizeImage(data, { width: 1920, height: 1080 });
 *     return completeNodeExecution(resized);
 *   }),
 *   retry: {
 *     maxRetries: 3,
 *     retryDelay: 1000,
 *     exponentialBackoff: true
 *   }
 * };
 * ```
 *
 * @see {@link NodeExecutionResult} for return type options
 * @see {@link FlowCondition} for conditional execution
 */
export type FlowNode<
  TInput = unknown,
  TOutput = unknown,
  TError = UploadistaError,
> = FlowNodeData & {
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  run: (args: {
    data: TInput;
    jobId: string;
    storageId: string;
    flowId: string;
    inputs?: Record<string, unknown>;
    clientId: string | null;
  }) => Effect.Effect<NodeExecutionResult<TOutput>, TError>;
  condition?: {
    field: string;
    operator: string;
    value: unknown;
  };
  multiInput?: boolean;
  multiOutput?: boolean;
  pausable?: boolean; // Flag to indicate this node can pause execution
  retry?: {
    maxRetries?: number; // Maximum number of retry attempts (default: 0)
    retryDelay?: number; // Base delay in ms between retries (default: 1000)
    exponentialBackoff?: boolean; // Use exponential backoff (default: true)
  };
};

/**
 * Represents a directed edge connecting two nodes in the flow graph.
 *
 * Edges define the data flow direction and can specify ports for multi-input/output nodes.
 *
 * @property source - ID of the source node
 * @property target - ID of the target node
 * @property sourcePort - Optional output port name for multi-output nodes
 * @property targetPort - Optional input port name for multi-input nodes
 *
 * @remarks
 * - Edges must not create cycles (DAG constraint)
 * - Source node's output type should be compatible with target node's input type
 * - Ports allow routing specific outputs to specific inputs
 *
 * @example
 * ```typescript
 * // Simple edge
 * const edge: FlowEdge = {
 *   source: "resize-node",
 *   target: "optimize-node"
 * };
 *
 * // Edge with ports (for multiplex nodes)
 * const multiplexEdge: FlowEdge = {
 *   source: "multiplex-node",
 *   target: "output-node",
 *   sourcePort: "image",
 *   targetPort: "primary"
 * };
 * ```
 */
export type FlowEdge = {
  source: string;
  target: string;
  sourcePort?: string; // For multi-output nodes
  targetPort?: string; // For multi-input nodes
};

/**
 * Function type for checking schema compatibility between nodes.
 *
 * @param from - Source node's output schema
 * @param to - Target node's input schema
 * @returns true if schemas are compatible
 *
 * @remarks
 * Custom type checkers can implement more sophisticated compatibility rules
 * than the default checker.
 *
 * @see {@link FlowTypeValidator} for the default implementation
 */
export type TypeCompatibilityChecker = (
  from: z.ZodSchema<any>,
  to: z.ZodSchema<any>,
) => boolean;

/**
 * Interface for validating node connections and schema compatibility.
 *
 * @remarks
 * Validators ensure that connected nodes have compatible types,
 * preventing runtime type errors in flow execution.
 *
 * @see {@link FlowTypeValidator} for the implementation
 */
export type NodeConnectionValidator = {
  validateConnection: (
    sourceNode: FlowNode<any, any>,
    targetNode: FlowNode<any, any>,
    edge: FlowEdge,
  ) => boolean;
  getCompatibleTypes: (
    sourceSchema: z.ZodSchema<any>,
    targetSchema: z.ZodSchema<any>,
  ) => boolean;
};

/**
 * Configuration object for creating a new flow.
 *
 * FlowConfig defines all aspects of a flow including its nodes, connections,
 * schemas, and optional features like event handlers and parallel execution.
 *
 * @template TFlowInputSchema - Zod schema for flow inputs
 * @template TFlowOutputSchema - Zod schema for flow outputs
 * @template TNodeError - Union of possible errors from node Effects
 * @template TNodeRequirements - Union of requirements from node Effects
 *
 * @property flowId - Unique identifier for the flow
 * @property name - Human-readable flow name
 * @property nodes - Array of nodes (can be plain nodes or Effects resolving to nodes)
 * @property edges - Array of edges connecting the nodes
 * @property inputSchema - Zod schema for validating flow inputs
 * @property outputSchema - Zod schema for validating flow outputs
 * @property typeChecker - Optional custom type compatibility checker
 * @property onEvent - Optional event handler for monitoring execution
 * @property parallelExecution - Optional parallel execution configuration
 *
 * @remarks
 * - Nodes can be provided as plain objects or Effect-wrapped for lazy initialization
 * - Event handlers receive all flow and node events
 * - Parallel execution is experimental and disabled by default
 * - Type checker allows custom schema compatibility rules
 *
 * @example
 * ```typescript
 * const config: FlowConfig<
 *   z.ZodObject<{ file: z.ZodType<File> }>,
 *   z.ZodType<UploadFile>,
 *   never,
 *   never
 * > = {
 *   flowId: "image-upload",
 *   name: "Image Upload Pipeline",
 *   nodes: [inputNode, resizeNode, optimizeNode, storageNode],
 *   edges: [
 *     { source: "input", target: "resize" },
 *     { source: "resize", target: "optimize" },
 *     { source: "optimize", target: "storage" }
 *   ],
 *   inputSchema: z.object({ file: z.instanceof(File) }),
 *   outputSchema: uploadFileSchema,
 *   onEvent: (event) => Effect.gen(function* () {
 *     yield* logEvent(event);
 *     return { eventId: event.jobId };
 *   })
 * };
 * ```
 *
 * @see {@link createFlowWithSchema} for creating flows from config
 * @see {@link FlowNode} for node specifications
 * @see {@link FlowEdge} for edge specifications
 */
export type FlowConfig<
  TFlowInputSchema extends z.ZodSchema<any>,
  TFlowOutputSchema extends z.ZodSchema<any>,
  TNodeError = never,
  TNodeRequirements = never,
> = {
  flowId: string;
  name: string;
  nodes: Array<
    | FlowNode<any, any, UploadistaError>
    | Effect.Effect<
        FlowNode<any, any, UploadistaError>,
        TNodeError,
        TNodeRequirements
      >
  >;
  edges: FlowEdge[];
  inputSchema: TFlowInputSchema;
  outputSchema: TFlowOutputSchema;
  typeChecker?: TypeCompatibilityChecker;
  onEvent?: (
    event: FlowEvent,
  ) => Effect.Effect<{ eventId: string | null }, UploadistaError>;
  parallelExecution?: {
    enabled?: boolean;
    maxConcurrency?: number;
  };
};

// Re-export existing types for compatibility
export { NodeType };
export type { FlowEvent, FlowEventFlowEnd, FlowEventFlowStart };
