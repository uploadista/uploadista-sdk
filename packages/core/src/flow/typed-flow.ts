/**
 * biome-ignore-all lint/suspicious/noExplicitAny: broadly-typed generics require runtime schema placeholders
 */
import { Effect } from "effect";
import { z } from "zod";
import type { UploadistaError as CoreUploadistaError } from "../errors";
import { UploadistaError } from "../errors";
import type { UploadServer } from "../upload";
import type { FlowEvent } from "./event";
import type { Flow, FlowExecutionResult } from "./flow";
import { createFlowWithSchema } from "./flow";
import { NodeType } from "./node";
import type { ExtractEffectRequirements, ResolveEffect } from "./types";
import type {
  FlowEdge,
  FlowNode,
  TypeCompatibilityChecker,
} from "./types/flow-types";

/**
 * Defines a node that can be used in a typed flow.
 *
 * A node definition can be either:
 * - A plain FlowNode object
 * - An Effect that resolves to a FlowNode (for nodes requiring dependencies)
 *
 * @template TNodeError - The error types that the node can produce
 * @template TNodeRequirements - The services/dependencies the node requires
 */
export type NodeDefinition<TNodeError = never, TNodeRequirements = never> =
  | FlowNode<any, any, CoreUploadistaError>
  | Effect.Effect<
      FlowNode<any, any, CoreUploadistaError>,
      TNodeError,
      TNodeRequirements
    >;

/**
 * A record mapping node IDs to their definitions.
 *
 * This is the primary type used for defining the nodes in a typed flow,
 * allowing TypeScript to infer input/output schemas and requirements.
 *
 * @example
 * ```typescript
 * const nodes = {
 *   input: fileInputNode,
 *   resize: Effect.succeed(imageResizeNode),
 *   output: s3OutputNode
 * } satisfies NodeDefinitionsRecord;
 * ```
 */
export type NodeDefinitionsRecord = Record<string, NodeDefinition<any, any>>;

/**
 * Extracts the error type from a NodeDefinition.
 *
 * If the node is an Effect, extracts its error type.
 * If the node is a plain FlowNode, returns never (no errors).
 */
type NodeDefinitionError<T> = T extends Effect.Effect<
  FlowNode<any, any, CoreUploadistaError>,
  infer TError,
  any
>
  ? TError
  : never;

/**
 * Extracts the requirements (dependencies) from a NodeDefinition.
 *
 * Uses the shared ExtractEffectRequirements utility for consistency.
 */
type NodeDefinitionRequirements<T> = ExtractEffectRequirements<T>;

/**
 * Extracts all possible errors from all nodes in a flow as a union.
 *
 * This iterates through all nodes in the record and combines their
 * error types into a single union type.
 */
type NodesErrorUnion<TNodes extends NodeDefinitionsRecord> = {
  [K in keyof TNodes]: NodeDefinitionError<TNodes[K]>;
}[keyof TNodes];

/**
 * Extracts all service requirements from all nodes in a flow as a union.
 *
 * This iterates through all nodes in the record and combines their
 * requirement types into a single union type representing all services
 * needed by the flow.
 *
 * @template TNodes - The record of node definitions
 *
 * @example
 * ```typescript
 * const nodes = {
 *   resize: imageResizeNode, // requires ImagePlugin
 *   zip: zipNode,           // requires ZipPlugin
 * };
 * type Requirements = NodesRequirementsUnion<typeof nodes>;
 * // Requirements = ImagePlugin | ZipPlugin
 * ```
 */
type NodesRequirementsUnion<TNodes extends NodeDefinitionsRecord> = {
  [K in keyof TNodes]: NodeDefinitionRequirements<TNodes[K]>;
}[keyof TNodes];

/**
 * Extracts all service requirements from a flow's nodes.
 *
 * This includes all services required by any node in the flow,
 * including UploadServer (which is provided by the runtime).
 *
 * @template TNodes - The record of node definitions
 *
 * @example
 * ```typescript
 * const myFlow = createFlow({
 *   nodes: {
 *     input: fileInputNode,
 *     process: imageProcessNode, // requires ImagePlugin
 *   },
 *   edges: [...]
 * });
 * type AllRequirements = FlowRequirements<typeof myFlow.nodes>;
 * // AllRequirements = ImagePlugin | UploadServer
 * ```
 */
export type FlowRequirements<TNodes extends NodeDefinitionsRecord> =
  NodesRequirementsUnion<TNodes>;

/**
 * Extracts plugin service requirements from a flow, excluding UploadServer.
 *
 * This type is useful for determining which plugin layers need to be
 * provided when creating a server, as UploadServer is automatically
 * provided by the runtime.
 *
 * @template TNodes - The record of node definitions
 *
 * @example
 * ```typescript
 * const myFlow = createFlow({
 *   nodes: {
 *     resize: imageResizeNode, // requires ImagePlugin
 *     upload: s3OutputNode,   // requires UploadServer
 *   },
 *   edges: [...]
 * });
 * type PluginRequirements = FlowPluginRequirements<typeof myFlow.nodes>;
 * // PluginRequirements = ImagePlugin (UploadServer excluded)
 * ```
 */
export type FlowPluginRequirements<TNodes extends NodeDefinitionsRecord> =
  Exclude<FlowRequirements<TNodes>, UploadServer>;

/**
 * Infers the concrete FlowNode type from a NodeDefinition.
 *
 * If the definition is already a FlowNode, returns it as-is.
 * If the definition is an Effect, extracts the FlowNode from the Effect's success type.
 *
 * Uses the shared ResolveEffect utility for consistency.
 */
type InferNode<T> = T extends FlowNode<any, any, CoreUploadistaError>
  ? T
  : ResolveEffect<T> extends FlowNode<any, any, CoreUploadistaError>
    ? ResolveEffect<T>
    : never;

type ResolvedNodesRecord<TNodes extends NodeDefinitionsRecord> = {
  [K in keyof TNodes]: InferNode<TNodes[K]>;
};

type ExtractKeysByNodeType<
  TNodes extends NodeDefinitionsRecord,
  TType extends NodeType,
> = {
  [K in keyof TNodes]: InferNode<TNodes[K]>["type"] extends TType ? K : never;
}[keyof TNodes];

type SchemaInfer<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

export type FlowInputMap<TNodes extends NodeDefinitionsRecord> = {
  [K in Extract<
    ExtractKeysByNodeType<TNodes, NodeType.input>,
    string
  >]: SchemaInfer<InferNode<TNodes[K]>["inputSchema"]>;
};

export type FlowOutputMap<TNodes extends NodeDefinitionsRecord> = {
  [K in Extract<
    ExtractKeysByNodeType<TNodes, NodeType.output>,
    string
  >]: SchemaInfer<InferNode<TNodes[K]>["outputSchema"]>;
};

type FlowInputUnion<TNodes extends NodeDefinitionsRecord> = {
  [K in Extract<
    ExtractKeysByNodeType<TNodes, NodeType.input>,
    string
  >]: SchemaInfer<InferNode<TNodes[K]>["inputSchema"]>;
}[Extract<ExtractKeysByNodeType<TNodes, NodeType.input>, string>];

type FlowOutputUnion<TNodes extends NodeDefinitionsRecord> = {
  [K in Extract<
    ExtractKeysByNodeType<TNodes, NodeType.output>,
    string
  >]: SchemaInfer<InferNode<TNodes[K]>["outputSchema"]>;
}[Extract<ExtractKeysByNodeType<TNodes, NodeType.output>, string>];

type NodeKey<TNodes extends NodeDefinitionsRecord> = Extract<
  keyof TNodes,
  string
>;

export type TypedFlowEdge<TNodes extends NodeDefinitionsRecord> = {
  source: NodeKey<TNodes>;
  target: NodeKey<TNodes>;
  sourcePort?: string;
  targetPort?: string;
};

export type TypedFlowConfig<TNodes extends NodeDefinitionsRecord> = {
  flowId: string;
  name: string;
  nodes: TNodes;
  edges: Array<TypedFlowEdge<TNodes>>;
  typeChecker?: TypeCompatibilityChecker;
  onEvent?: (
    event: FlowEvent,
  ) => Effect.Effect<{ eventId: string | null }, CoreUploadistaError>;
  parallelExecution?: {
    enabled?: boolean;
    maxConcurrency?: number;
  };
  inputSchema?: z.ZodTypeAny;
  outputSchema?: z.ZodTypeAny;
};

declare const typedFlowInputsSymbol: unique symbol;
declare const typedFlowOutputsSymbol: unique symbol;
declare const typedFlowPluginsSymbol: unique symbol;

/**
 * A type-safe Flow that infers input/output types and requirements from its nodes.
 *
 * TypedFlow extends the base Flow type with additional type information that
 * allows TypeScript to verify inputs, outputs, and plugin requirements at compile time.
 *
 * The phantom type properties (using unique symbols) enable type-level metadata
 * without affecting runtime behavior, allowing other type utilities to extract
 * this information for validation purposes.
 *
 * @template TNodes - Record of node definitions used in the flow
 * @template TInputSchema - Zod schema for flow inputs (inferred from input nodes)
 * @template TOutputSchema - Zod schema for flow outputs (inferred from output nodes)
 *
 * @example
 * ```typescript
 * const myFlow = createFlow({
 *   nodes: {
 *     input: fileInputNode,
 *     resize: imageResizeNode,
 *     output: s3OutputNode
 *   },
 *   edges: [
 *     { source: 'input', target: 'resize' },
 *     { source: 'resize', target: 'output' }
 *   ]
 * });
 *
 * // TypeScript infers:
 * // - Input types from fileInputNode.inputSchema
 * // - Output types from s3OutputNode.outputSchema
 * // - Requirements: ImagePlugin (from resize node)
 * ```
 */
export type TypedFlow<
  TNodes extends NodeDefinitionsRecord,
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny,
> = Flow<TInputSchema, TOutputSchema, FlowRequirements<TNodes>> & {
  run: (args: {
    inputs?: Partial<FlowInputMap<TNodes>>;
    storageId: string;
    jobId: string;
  }) => Effect.Effect<
    FlowExecutionResult<FlowOutputMap<TNodes>>,
    CoreUploadistaError,
    FlowRequirements<TNodes>
  >;
  resume: (args: {
    jobId: string;
    storageId: string;
    nodeResults: Record<string, unknown>;
    executionState: {
      executionOrder: string[];
      currentIndex: number;
      inputs: Partial<FlowInputMap<TNodes>>;
    };
  }) => Effect.Effect<
    FlowExecutionResult<FlowOutputMap<TNodes>>,
    CoreUploadistaError,
    FlowRequirements<TNodes>
  >;
  readonly [typedFlowInputsSymbol]?: FlowInputMap<TNodes>;
  readonly [typedFlowOutputsSymbol]?: FlowOutputMap<TNodes>;
  readonly [typedFlowPluginsSymbol]?: FlowPluginRequirements<TNodes>;
};

const buildUnionSchema = (
  schemas: z.ZodTypeAny[],
  fallback: z.ZodTypeAny,
): z.ZodTypeAny => {
  if (schemas.length === 0) {
    return fallback;
  }

  const [first, ...rest] = schemas as [z.ZodTypeAny, ...z.ZodTypeAny[]];
  return rest.reduce<z.ZodTypeAny>(
    (acc, schema) => z.union([acc, schema]),
    first,
  );
};

export function createFlow<TNodes extends NodeDefinitionsRecord>(
  config: TypedFlowConfig<TNodes>,
): Effect.Effect<
  TypedFlow<
    TNodes,
    z.ZodType<FlowInputUnion<TNodes>>,
    z.ZodType<FlowOutputUnion<TNodes>>
  >,
  NodesErrorUnion<TNodes> | UploadistaError,
  FlowRequirements<TNodes>
> {
  return Effect.gen(function* () {
    const nodeEntries = Object.entries(config.nodes) as Array<
      [NodeKey<TNodes>, NodeDefinition]
    >;

    const resolveNode = (
      node: NodeDefinition,
    ): Effect.Effect<
      FlowNode<any, any, CoreUploadistaError>,
      NodesErrorUnion<TNodes>,
      FlowRequirements<TNodes>
    > =>
      Effect.isEffect(node)
        ? (node as Effect.Effect<
            FlowNode<any, any, CoreUploadistaError>,
            NodesErrorUnion<TNodes>,
            FlowRequirements<TNodes>
          >)
        : Effect.succeed(node as FlowNode<any, any, CoreUploadistaError>);

    const resolvedEntries = yield* Effect.forEach(nodeEntries, ([key, node]) =>
      Effect.flatMap(resolveNode(node), (resolvedNode) => {
        if (resolvedNode.id !== key) {
          return Effect.fail(
            UploadistaError.fromCode("FLOW_NODE_ERROR", {
              cause: new Error(
                `Node key ${key} does not match node id ${resolvedNode.id}`,
              ),
            }),
          );
        }
        return Effect.succeed([key, resolvedNode] as const);
      }),
    );

    const resolvedRecord = Object.fromEntries(
      resolvedEntries,
    ) as ResolvedNodesRecord<TNodes>;
    const resolvedNodes = resolvedEntries.map(([, node]) => node);

    const inputSchemas = resolvedEntries
      .filter(([, node]) => node.type === NodeType.input)
      .map(([, node]) => node.inputSchema);

    const outputSchemas = resolvedEntries
      .filter(([, node]) => node.type === NodeType.output)
      .map(([, node]) => node.outputSchema);

    const inputSchema =
      config.inputSchema ?? buildUnionSchema(inputSchemas, z.unknown());

    const outputSchema =
      config.outputSchema ?? buildUnionSchema(outputSchemas, z.unknown());

    const flowEdges: FlowEdge[] = config.edges.map((edge) => ({
      source: resolvedRecord[edge.source]?.id ?? edge.source,
      target: resolvedRecord[edge.target]?.id ?? edge.target,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
    }));

    const flow = yield* createFlowWithSchema({
      flowId: config.flowId,
      name: config.name,
      nodes: resolvedNodes,
      edges: flowEdges,
      inputSchema,
      outputSchema,
      typeChecker: config.typeChecker,
      onEvent: config.onEvent,
      parallelExecution: config.parallelExecution,
    });

    return flow as unknown as TypedFlow<
      TNodes,
      z.ZodType<FlowInputUnion<TNodes>>,
      z.ZodType<FlowOutputUnion<TNodes>>
    >;
  });
}
