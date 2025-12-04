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
import type { UploadFile } from "../../types/upload-file";
import type { FlowEvent, FlowEventFlowEnd, FlowEventFlowStart } from "../event";
import { NodeType } from "../node";
import type { RetryPolicy } from "./retry-policy";

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
 * @property inputTypeId - Optional input type ID from inputTypeRegistry (for input nodes)
 * @property outputTypeId - Optional output type ID from outputTypeRegistry (for result typing)
 * @property keepOutput - If true, preserves this node's output even if it has outgoing edges (default: false)
 */
export type FlowNodeData = {
  id: string;
  name: string;
  description: string;
  type: NodeType;
  /** Input type ID from inputTypeRegistry - describes how external clients interact with this node */
  inputTypeId?: string;
  /** Output type ID from outputTypeRegistry - describes the data shape this node produces */
  outputTypeId?: string;
  keepOutput?: boolean;
  /**
   * Stable node type identifier for circuit breaker configuration.
   * Used to share circuit breaker state across nodes of the same type and for nodeTypeOverrides.
   * Example: "describe-image", "remove-background", "scan-virus"
   */
  nodeTypeId?: string;
};

/**
 * Built-in typed outputs with automatic TypeScript narrowing.
 *
 * These outputs use discriminated unions to enable automatic type narrowing
 * in switch statements without requiring type guards.
 *
 * @remarks
 * Built-in types automatically narrow when using switch statements:
 * ```typescript
 * switch (output.nodeType) {
 *   case 'storage-output-v1':
 *     output.data.url // ✅ TypeScript knows data is UploadFile
 *     break;
 * }
 * ```
 */
export type BuiltInTypedOutput = {
  nodeType: "storage-output-v1";
  data: UploadFile;
  nodeId: string;
  timestamp: string;
};

/**
 * Custom typed output for user-defined node types.
 *
 * Custom outputs require type guards for type narrowing:
 * ```typescript
 * if (isThumbnailOutput(output)) {
 *   output.data.width // ✅ Type guard narrows data to ThumbnailOutput
 * }
 * ```
 *
 * @template T - The TypeScript type of the output data
 */
export type CustomTypedOutput<T = unknown> = {
  nodeType?: string; // Custom type ID or undefined for untyped nodes
  data: T;
  nodeId: string;
  timestamp: string;
};

/**
 * Typed output structure from a flow node.
 *
 * This is a discriminated union that provides automatic type narrowing for
 * built-in types while maintaining extensibility for custom types.
 *
 * @template T - The TypeScript type of the output data (for custom outputs)
 *
 * @property nodeId - Node instance ID that produced this output
 * @property nodeType - Type ID from the registry (e.g., "storage-output-v1")
 * @property data - The actual output data from the node
 * @property timestamp - ISO 8601 timestamp when the result was produced
 *
 * @remarks
 * **Built-in types (automatic narrowing):**
 * - `storage-output-v1` - Storage node output (UploadFile)
 *
 * Use switch statements for automatic narrowing:
 * ```typescript
 * for (const output of state.flowOutputs) {
 *   switch (output.nodeType) {
 *     case 'storage-output-v1':
 *       // ✅ output.data is automatically UploadFile
 *       console.log(output.data.url);
 *       break;
 *   }
 * }
 * ```
 *
 * **Custom types (require type guards):**
 * ```typescript
 * import { isThumbnailOutput } from './type-guards';
 *
 * if (isThumbnailOutput(output)) {
 *   // ✅ Type guard narrows output.data to ThumbnailOutput
 *   console.log(output.data.width);
 * }
 * ```
 *
 * **Untyped nodes (backward compatible):**
 * ```typescript
 * const untypedOutput: TypedOutput = {
 *   nodeId: "custom-node-1",
 *   data: { custom: "data" },
 *   timestamp: "2024-01-15T10:30:00Z"
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Storage output result (built-in, automatic narrowing)
 * const output: TypedOutput = {
 *   nodeId: "storage-1",
 *   nodeType: "storage-output-v1",
 *   data: {
 *     id: "file-123",
 *     url: "https://cdn.example.com/file.jpg",
 *     size: 1024000,
 *     // ... rest of UploadFile
 *   },
 *   timestamp: "2024-01-15T10:30:00Z"
 * };
 *
 * // Custom output (requires type guard)
 * const thumbnailOutput: TypedOutput<ThumbnailOutput> = {
 *   nodeId: "thumbnail-1",
 *   nodeType: "thumbnail-output-v1",
 *   data: {
 *     url: "https://cdn.example.com/thumb.jpg",
 *     width: 200,
 *     height: 200,
 *     format: "webp",
 *   },
 *   timestamp: "2024-01-15T10:30:00Z"
 * };
 * ```
 */
export type TypedOutput<T = unknown> =
  | BuiltInTypedOutput
  | CustomTypedOutput<T>;

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
 * Results now include optional type information (`nodeType` and `nodeId`) to
 * enable type-safe result consumption. These fields are automatically added
 * by the node execution wrapper when a node is created with an `outputTypeId`.
 *
 * @example
 * ```typescript
 * // Node completes immediately with type information
 * return completeNodeExecution({ processedData });
 * // Result will be wrapped with: { type: "complete", data, nodeType, nodeId }
 *
 * // Node waits for more chunks
 * if (needsMoreData) {
 *   return waitingNodeExecution({ receivedChunks: 3, totalChunks: 10 });
 * }
 * ```
 */
export type NodeExecutionResult<TOutput> =
  | {
      type: "complete";
      data: TOutput;
      nodeType?: string;
      nodeId?: string;
    }
  | {
      type: "waiting";
      partialData?: unknown;
      nodeType?: string;
      nodeId?: string;
    };

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
  /** Circuit breaker configuration for this node (overrides flow defaults) */
  circuitBreaker?: FlowCircuitBreakerConfig;
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

// ============================================================================
// Circuit Breaker Types (re-exported from circuit-breaker.ts for convenience)
// ============================================================================

/**
 * Fallback behavior when circuit is open.
 *
 * - `fail`: Fail immediately with CIRCUIT_BREAKER_OPEN error (default)
 * - `skip`: Skip node, pass input through as output
 * - `default`: Return a configured default value
 */
export type FlowCircuitBreakerFallback =
  | { type: "fail" }
  | { type: "skip"; passThrough: true }
  | { type: "default"; value: unknown };

/**
 * Configuration for a circuit breaker on a flow or node.
 *
 * @property enabled - Whether circuit breaker is active (default: false for backward compatibility)
 * @property failureThreshold - Number of failures within window to trip circuit (default: 5)
 * @property resetTimeout - Milliseconds to wait in open state before half-open (default: 30000)
 * @property halfOpenRequests - Number of successful requests in half-open to close (default: 3)
 * @property windowDuration - Sliding window duration in milliseconds (default: 60000)
 * @property fallback - Behavior when circuit is open
 *
 * @example
 * ```typescript
 * const config: FlowCircuitBreakerConfig = {
 *   enabled: true,
 *   failureThreshold: 5,
 *   resetTimeout: 30000,
 *   halfOpenRequests: 3,
 *   windowDuration: 60000,
 *   fallback: { type: "fail" }
 * };
 * ```
 */
export interface FlowCircuitBreakerConfig {
  /** Whether circuit breaker is active (default: false) */
  enabled?: boolean;
  /** Number of failures within window to trip circuit (default: 5) */
  failureThreshold?: number;
  /** Milliseconds to wait in open state before half-open (default: 30000) */
  resetTimeout?: number;
  /** Number of successful requests in half-open to close (default: 3) */
  halfOpenRequests?: number;
  /** Sliding window duration in milliseconds (default: 60000) */
  windowDuration?: number;
  /** Behavior when circuit is open */
  fallback?: FlowCircuitBreakerFallback;
}

// ============================================================================
// Dead Letter Queue Types
// ============================================================================

/**
 * Configuration for Dead Letter Queue on a flow.
 *
 * When enabled, failed flow jobs are captured in the DLQ for later retry,
 * debugging, or manual intervention.
 *
 * @property enabled - Whether DLQ is enabled for this flow (default: true when service is provided)
 * @property retryPolicy - Retry policy configuration for automatic retries
 *
 * @example
 * ```typescript
 * // Enable DLQ with custom retry policy
 * const flowConfig = {
 *   flowId: "image-pipeline",
 *   deadLetterQueue: {
 *     enabled: true,
 *     retryPolicy: {
 *       enabled: true,
 *       maxRetries: 5,
 *       backoff: {
 *         type: "exponential",
 *         initialDelayMs: 1000,
 *         maxDelayMs: 60000,
 *         multiplier: 2,
 *         jitter: true
 *       },
 *       nonRetryableErrors: ["VALIDATION_ERROR"]
 *     }
 *   }
 * };
 *
 * // Disable DLQ for best-effort flows
 * const bestEffortFlow = {
 *   flowId: "analytics-pipeline",
 *   deadLetterQueue: {
 *     enabled: false
 *   }
 * };
 * ```
 */
export interface FlowDeadLetterQueueConfig {
  /** Whether DLQ is enabled for this flow (default: true when service is provided) */
  enabled?: boolean;
  /** Retry policy configuration for automatic retries */
  retryPolicy?: RetryPolicy;
}

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
  checkJobStatus?: (
    jobId: string,
  ) => Effect.Effect<"running" | "paused" | "cancelled", UploadistaError>;
  parallelExecution?: {
    enabled?: boolean;
    maxConcurrency?: number;
  };
  /**
   * Circuit breaker configuration for the flow.
   *
   * When enabled, the circuit breaker monitors node execution failures and
   * automatically prevents requests to failing services, protecting against
   * cascade failures.
   *
   * @example
   * ```typescript
   * circuitBreaker: {
   *   defaults: {
   *     enabled: true,
   *     failureThreshold: 5,
   *     resetTimeout: 30000
   *   },
   *   nodeTypeOverrides: {
   *     "virus-scan": { failureThreshold: 3 }
   *   }
   * }
   * ```
   */
  circuitBreaker?: {
    /** Default circuit breaker config for all nodes */
    defaults?: FlowCircuitBreakerConfig;
    /** Override circuit breaker config per node type */
    nodeTypeOverrides?: Record<string, FlowCircuitBreakerConfig>;
  };
  /**
   * Dead Letter Queue configuration for the flow.
   *
   * When enabled, failed jobs are captured in the DLQ for later retry,
   * debugging, or manual intervention.
   *
   * @example
   * ```typescript
   * deadLetterQueue: {
   *   enabled: true,
   *   retryPolicy: {
   *     enabled: true,
   *     maxRetries: 5,
   *     backoff: {
   *       type: "exponential",
   *       initialDelayMs: 1000,
   *       maxDelayMs: 60000,
   *       multiplier: 2,
   *       jitter: true
   *     }
   *   }
   * }
   * ```
   */
  deadLetterQueue?: FlowDeadLetterQueueConfig;
  hooks?: {
    /**
     * Called when a sink node (terminal node with no outgoing edges) produces an output.
     * This hook runs after auto-persistence for UploadFile outputs.
     *
     * Use this hook to perform additional post-processing such as:
     * - Saving output metadata to a database
     * - Tracking outputs in external systems
     * - Adding custom metadata to outputs
     * - Triggering downstream workflows
     *
     * The hook receives the output and context, and can optionally modify
     * and return the output (e.g., adding metadata fields).
     *
     * **Important**: The hook must not have any service requirements (Effect requirements must be `never`).
     * All necessary services should be captured in the closure when defining the hook.
     *
     * @param context - Output context including the output data, node ID, flow ID, etc.
     * @returns Effect or Promise that resolves to the (optionally modified) output
     *
     * @example
     * ```typescript
     * // Using Effect
     * hooks: {
     *   onNodeOutput: ({ output, nodeId, flowId }) =>
     *     Effect.gen(function* () {
     *       // Save to database
     *       yield* Effect.promise(() => db.save(output));
     *       // Return output with additional metadata
     *       return { ...output, metadata: { ...output.metadata, tracked: true } };
     *     })
     * }
     *
     * // Using Promise (simpler for most users)
     * hooks: {
     *   onNodeOutput: async ({ output, nodeId, flowId }) => {
     *     // Save to database
     *     await db.save(output);
     *     // Return output with additional metadata
     *     return { ...output, metadata: { ...output.metadata, tracked: true } };
     *   }
     * }
     * ```
     */
    onNodeOutput?: <TOutput>(context: {
      output: TOutput;
      nodeId: string;
      flowId: string;
      jobId: string;
      storageId: string;
      clientId: string | null;
    }) => Effect.Effect<TOutput, UploadistaError, never> | Promise<TOutput>;
  };
};

// ============================================================================
// File Naming Types
// ============================================================================

/**
 * Context provided to file naming functions and templates.
 *
 * Contains all relevant information about the current file, node, and flow
 * execution that can be used to generate dynamic file names.
 *
 * @property baseName - Filename without extension (e.g., "photo" from "photo.jpg")
 * @property extension - File extension without dot (e.g., "jpg")
 * @property fileName - Full original filename (e.g., "photo.jpg")
 * @property nodeType - Type of processing node (e.g., "resize", "optimize")
 * @property nodeId - Specific node instance ID
 * @property flowId - Flow identifier
 * @property jobId - Execution job ID
 * @property timestamp - ISO 8601 timestamp of processing
 * @property width - Output width (image/video nodes only)
 * @property height - Output height (image/video nodes only)
 * @property format - Output format (e.g., "webp", "mp4")
 * @property quality - Quality setting (e.g., 80)
 *
 * @example
 * ```typescript
 * // Available in templates as {{variable}}
 * const pattern = "{{baseName}}-{{width}}x{{height}}.{{extension}}";
 * // Result: "photo-800x600.jpg"
 * ```
 */
export type NamingContext = {
  /** Filename without extension */
  baseName: string;
  /** File extension without dot */
  extension: string;
  /** Full original filename */
  fileName: string;
  /** Type of processing node */
  nodeType: string;
  /** Specific node instance ID */
  nodeId: string;
  /** Flow identifier */
  flowId: string;
  /** Execution job ID */
  jobId: string;
  /** ISO 8601 timestamp of processing */
  timestamp: string;
  /** Output width (image/video nodes) */
  width?: number;
  /** Output height (image/video nodes) */
  height?: number;
  /** Output format */
  format?: string;
  /** Quality setting */
  quality?: number;
  /** Page number (document nodes) */
  pageNumber?: number;
  /** Additional custom variables */
  [key: string]: string | number | undefined;
};

/**
 * Function type for custom file naming logic.
 *
 * @param file - The UploadFile being processed
 * @param context - Naming context with all available variables
 * @returns The new filename (including extension)
 *
 * @example
 * ```typescript
 * const customRename: FileNamingFunction = (file, ctx) =>
 *   `${ctx.flowId}-${ctx.baseName}-${ctx.timestamp}.${ctx.extension}`;
 * ```
 */
export type FileNamingFunction = (
  file: UploadFile,
  context: NamingContext,
) => string;

/**
 * Function type for generating auto-naming suffixes.
 *
 * Each node type can define its own auto suffix generator that creates
 * a descriptive suffix based on the processing parameters.
 *
 * @param context - Naming context with all available variables
 * @returns The suffix to append (without leading dash)
 *
 * @example
 * ```typescript
 * // Resize node auto suffix
 * const resizeAutoSuffix: AutoNamingSuffixGenerator = (ctx) =>
 *   `${ctx.width}x${ctx.height}`;
 * // Result: "photo-800x600.jpg"
 *
 * // Optimize node auto suffix
 * const optimizeAutoSuffix: AutoNamingSuffixGenerator = (ctx) =>
 *   ctx.format ?? 'optimized';
 * // Result: "photo-webp.webp"
 * ```
 */
export type AutoNamingSuffixGenerator = (context: NamingContext) => string;

/**
 * Configuration for file naming behavior on a node.
 *
 * Supports three modes:
 * - `undefined` or no config: Preserve original filename (backward compatible)
 * - `mode: 'auto'`: Generate smart suffix based on node type
 * - `mode: 'custom'`: Use template pattern or rename function
 *
 * @property mode - Naming mode: 'auto' for smart suffixes, 'custom' for templates/functions
 * @property pattern - Mustache-style template string (for custom mode)
 * @property rename - Custom function for full control (for custom mode, SDK only)
 * @property autoSuffix - Generator function for auto mode suffix
 *
 * @example
 * ```typescript
 * // Auto mode with smart suffix
 * const autoNaming: FileNamingConfig = {
 *   mode: 'auto',
 *   autoSuffix: (ctx) => `${ctx.width}x${ctx.height}`
 * };
 *
 * // Custom mode with template
 * const templateNaming: FileNamingConfig = {
 *   mode: 'custom',
 *   pattern: '{{baseName}}-{{nodeType}}.{{extension}}'
 * };
 *
 * // Custom mode with function
 * const functionNaming: FileNamingConfig = {
 *   mode: 'custom',
 *   rename: (file, ctx) => `processed-${ctx.fileName}`
 * };
 * ```
 */
export type FileNamingConfig = {
  /** Naming mode: 'auto' for smart suffixes, 'custom' for templates/functions */
  mode: "auto" | "custom";
  /** Mustache-style template string (for custom mode) */
  pattern?: string;
  /** Custom function for full control (for custom mode, SDK only) */
  rename?: FileNamingFunction;
  /** Generator function for auto mode suffix */
  autoSuffix?: AutoNamingSuffixGenerator;
};

// Re-export existing types for compatibility
export { NodeType };
export type { FlowEvent, FlowEventFlowEnd, FlowEventFlowStart };
