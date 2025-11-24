import { Effect } from "effect";
import type { z } from "zod";
import { UploadistaError } from "../errors";
import { flowTypeRegistry } from "./type-registry";
import type {
  FlowNode,
  FlowNodeData,
  NodeExecutionResult,
} from "./types/flow-types";

/**
 * Defines the type of node in a flow, determining its role in the processing pipeline.
 */
export enum NodeType {
  /** Entry point for data into the flow */
  input = "input",
  /** Transforms data during flow execution */
  process = "process",
  /** Routes data based on conditions */
  conditional = "conditional",
  /** Splits data to multiple outputs */
  multiplex = "multiplex",
  /** Combines multiple inputs into one output */
  merge = "merge",
}

/**
 * Fields that can be evaluated in conditional node conditions.
 * These fields are typically found in file metadata.
 */
export type ConditionField =
  | "mimeType"
  | "size"
  | "width"
  | "height"
  | "extension";

/**
 * Operators available for comparing values in conditional node conditions.
 */
export type ConditionOperator =
  | "equals"
  | "notEquals"
  | "greaterThan"
  | "lessThan"
  | "contains"
  | "startsWith";

/**
 * Value used in conditional node comparisons.
 * Can be either a string or number depending on the field being evaluated.
 */
export type ConditionValue = string | number;

/**
 * Creates a flow node with automatic input/output validation and retry logic.
 *
 * Flow nodes are the building blocks of processing pipelines. Each node:
 * - Validates its input against a Zod schema
 * - Executes its processing logic
 * - Validates its output against a Zod schema
 * - Can optionally retry on failure with exponential backoff
 *
 * @template Input - The expected input type for this node
 * @template Output - The output type produced by this node
 *
 * @param config - Node configuration
 * @param config.id - Unique identifier for this node in the flow
 * @param config.name - Human-readable name for the node
 * @param config.description - Description of what this node does
 * @param config.type - The type of node (input, process, conditional, multiplex, merge)
 * @param config.inputSchema - Zod schema for validating input data
 * @param config.outputSchema - Zod schema for validating output data
 * @param config.run - The processing function to execute for this node
 * @param config.condition - Optional condition for conditional nodes to determine if they should execute
 * @param config.multiInput - If true, node receives all inputs as a record instead of a single input
 * @param config.multiOutput - If true, node can output to multiple targets
 * @param config.pausable - If true, node can pause execution and wait for additional data
 * @param config.retry - Optional retry configuration for handling transient failures
 * @param config.retry.maxRetries - Maximum number of retry attempts (default: 0)
 * @param config.retry.retryDelay - Base delay in milliseconds between retries (default: 1000)
 * @param config.retry.exponentialBackoff - Whether to use exponential backoff for retries (default: true)
 * @param config.nodeTypeId - Optional type ID from the registry (e.g., "storage-output-v1"). If provided, the node type must be registered.
 * @param config.keepOutput - If true, preserves this node's output even if it has outgoing edges (default: false). Useful for flows where intermediate results need to be kept (e.g., preserving the original file when also running OCR on it).
 *
 * @returns An Effect that succeeds with the created FlowNode
 *
 * @example
 * ```typescript
 * const resizeNode = createFlowNode({
 *   id: "resize-1",
 *   name: "Resize Image",
 *   description: "Resizes images to 800x600",
 *   type: NodeType.process,
 *   inputSchema: z.object({
 *     stream: z.instanceof(Uint8Array),
 *     metadata: z.object({ width: z.number(), height: z.number() })
 *   }),
 *   outputSchema: z.object({
 *     stream: z.instanceof(Uint8Array),
 *     metadata: z.object({ width: z.literal(800), height: z.literal(600) })
 *   }),
 *   run: ({ data }) => Effect.gen(function* () {
 *     const resized = yield* resizeImage(data.stream, 800, 600);
 *     return {
 *       type: "complete",
 *       data: { stream: resized, metadata: { width: 800, height: 600 } }
 *     };
 *   }),
 *   retry: {
 *     maxRetries: 3,
 *     retryDelay: 1000,
 *     exponentialBackoff: true
 *   }
 * });
 * ```
 */
export function createFlowNode<
  Input,
  Output,
  TType extends NodeType = NodeType,
>({
  id,
  name,
  description,
  type,
  inputSchema,
  outputSchema,
  run,
  condition,
  multiInput = false,
  multiOutput = false,
  pausable = false,
  retry,
  nodeTypeId,
  keepOutput = false,
}: {
  id: string;
  name: string;
  description: string;
  type: TType;
  inputSchema: z.ZodSchema<Input>;
  outputSchema: z.ZodSchema<Output>;
  run: (args: {
    data: Input;
    jobId: string;
    storageId: string;
    flowId: string;
    clientId: string | null;
  }) => Effect.Effect<NodeExecutionResult<Output>, UploadistaError>;
  condition?: {
    field: ConditionField;
    operator: ConditionOperator;
    value: ConditionValue;
  };
  multiInput?: boolean;
  multiOutput?: boolean;
  pausable?: boolean;
  retry?: {
    maxRetries?: number;
    retryDelay?: number;
    exponentialBackoff?: boolean;
  };
  nodeTypeId?: string;
  keepOutput?: boolean;
}): Effect.Effect<
  FlowNode<Input, Output, UploadistaError> & { type: TType },
  UploadistaError
> {
  return Effect.gen(function* () {
    // Validate type registration if nodeTypeId provided
    if (nodeTypeId) {
      const typeDef = flowTypeRegistry.get(nodeTypeId);
      if (!typeDef) {
        return yield* UploadistaError.fromCode("INVALID_NODE_TYPE", {
          body: `Node type "${nodeTypeId}" is not registered`,
          details: { nodeTypeId, nodeId: id },
        }).toEffect();
      }

      // Validate category matches for input nodes
      if (type === NodeType.input && typeDef.category !== "input") {
        return yield* UploadistaError.fromCode("TYPE_CATEGORY_MISMATCH", {
          body: `Node type "${nodeTypeId}" is registered as "${typeDef.category}" but node "${id}" is type "${type}"`,
          details: {
            nodeTypeId,
            nodeId: id,
            expectedCategory: "input",
            actualCategory: typeDef.category,
          },
        }).toEffect();
      }
    }

    return {
      id,
      name,
      description,
      type,
      nodeTypeId: nodeTypeId || `${type}-node`,
      keepOutput,
      inputSchema,
      outputSchema,
      pausable,
      run: ({
        data,
        jobId,
        flowId,
        storageId,
        clientId,
      }: {
        data: Input;
        jobId: string;
        flowId: string;
        storageId: string;
        clientId: string | null;
      }) =>
        Effect.gen(function* () {
          // Validate input data against schema
          const validatedData = yield* Effect.try({
            try: () => inputSchema.parse(data),
            catch: (error) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return UploadistaError.fromCode("FLOW_INPUT_VALIDATION_ERROR", {
                body: `Node '${name}' (${id}) input validation failed: ${errorMessage}`,
                cause: error,
              });
            },
          });

          // Run the node logic
          const result = yield* run({
            data: validatedData,
            jobId,
            storageId,
            flowId,
            clientId,
          });

          // If the node returned waiting state, add type information and pass through
          if (result.type === "waiting") {
            return {
              type: "waiting" as const,
              partialData: result.partialData,
              nodeType: nodeTypeId,
              nodeId: id,
            };
          }

          // Validate output data against schema for completed results
          const validatedResult = yield* Effect.try({
            try: () => outputSchema.parse(result.data),
            catch: (error) => {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return UploadistaError.fromCode("FLOW_OUTPUT_VALIDATION_ERROR", {
                body: `Node '${name}' (${id}) output validation failed: ${errorMessage}`,
                cause: error,
              });
            },
          });

          // Return with type information
          return {
            type: "complete" as const,
            data: validatedResult,
            nodeType: nodeTypeId,
            nodeId: id,
          };
        }),
      condition,
      multiInput,
      multiOutput,
      retry,
    } as FlowNode<Input, Output, UploadistaError> & { type: TType };
  });
}

/**
 * Extracts serializable node metadata from a FlowNode instance.
 *
 * This function is useful for serializing flow configurations or
 * transmitting node information over the network without including
 * the executable run function or schemas.
 *
 * @param node - The flow node to extract data from
 * @returns A plain object containing the node's metadata (id, name, description, type)
 */
export const getNodeData = (
  // biome-ignore lint/suspicious/noExplicitAny: maybe type later
  node: FlowNode<any, any, UploadistaError>,
): FlowNodeData => {
  return {
    id: node.id,
    name: node.name,
    description: node.description,
    type: node.type,
    nodeTypeId: node.nodeTypeId,
  };
};
