import { Effect } from "effect";
import { expectType } from "tsd";
import { z } from "zod";
import {
  createFlow,
  createFlowNode,
  type FlowInputMap,
  type FlowOutputMap,
  NodeType,
} from "../src/flow";
import type { ResolveEffect } from "../src/flow/types/type-utils";

// Test 1: Verify node type preservation
const inputNode = createFlowNode({
  id: "input-node",
  name: "Input Node",
  description: "Input Node",
  type: NodeType.input,
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  run: ({ data }) =>
    Effect.succeed({ type: "complete", data: { result: data.value } }),
});

type TestInputNode = ResolveEffect<typeof inputNode>;

// The node's type field should be the literal "input", not the union NodeType
expectType<NodeType.input>(({} as TestInputNode).type);

const processNode = createFlowNode({
  id: "process-node",
  name: "Process Node",
  description: "Process Node",
  type: NodeType.process,
  inputSchema: z.object({ result: z.string() }),
  outputSchema: z.object({ value: z.string() }),
  run: ({ data }) =>
    Effect.succeed({ type: "complete", data: { value: data.result } }),
});

type TestProcessNode = ResolveEffect<typeof processNode>;

// The node's type field should be the literal "process", not the union NodeType
expectType<NodeType.process>(({} as TestProcessNode).type);

// Test 2: Verify FlowInputMap and FlowOutputMap
const nodes = {
  input: inputNode,
  process: processNode,
};

type NodesType = typeof nodes;

// FlowInputMap should only include keys of input nodes
type InputMapTest = FlowInputMap<NodesType>;
expectType<{
  input: { value: string };
}>({} as InputMapTest);

// FlowOutputMap now includes all nodes (sink-based architecture)
// Outputs are determined by edges at runtime
type OutputMapTest = FlowOutputMap<NodesType>;
expectType<{
  input: { result: string };
  process: { value: string };
}>({} as OutputMapTest);

// Test 3: Verify typed flow
const flow = createFlow({
  flowId: "test-flow",
  name: "Test Flow",
  nodes,
  edges: [{ source: "input", target: "process" }],
});

// Test that run() returns the correct output type
Effect.runPromise(
  Effect.gen(function* () {
    const typedFlow = yield* flow;
    const result = yield* typedFlow.run({
      inputs: { input: { value: "test" } },
      storageId: "storage-1",
      jobId: "job-1",
      clientId: null,
    });

    if (result.type === "completed") {
      // result.result should be FlowOutputMap<NodesType>
      // With sink-based architecture, process node becomes the sink (no outgoing edges)
      expectType<{ input: { result: string }; process: { value: string } }>(
        result.result,
      );

      // We should be able to access process node result (the sink)
      expectType<{ value: string }>(result.result.process);
    }
  }),
);
