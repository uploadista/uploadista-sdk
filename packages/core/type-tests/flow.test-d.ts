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

const outputNode = createFlowNode({
  id: "output-node",
  name: "Output Node",
  description: "Output Node",
  type: NodeType.output,
  inputSchema: z.object({ result: z.string() }),
  outputSchema: z.object({ value: z.string() }),
  run: ({ data }) =>
    Effect.succeed({ type: "complete", data: { value: data.result } }),
});

type TestOutputNode = ResolveEffect<typeof outputNode>;

// The node's type field should be the literal "output", not the union NodeType
expectType<NodeType.output>(({} as TestOutputNode).type);

// Test 2: Verify FlowInputMap and FlowOutputMap
const nodes = {
  input: inputNode,
  output: outputNode,
};

type NodesType = typeof nodes;

// FlowInputMap should only include keys of input nodes
type InputMapTest = FlowInputMap<NodesType>;
expectType<{
  input: { value: string };
}>({} as InputMapTest);

// FlowOutputMap should only include keys of output nodes
type OutputMapTest = FlowOutputMap<NodesType>;
expectType<{
  output: { value: string };
}>({} as OutputMapTest);

// Test 3: Verify typed flow
const flow = createFlow({
  flowId: "test-flow",
  name: "Test Flow",
  nodes,
  edges: [{ source: "input", target: "output" }],
});

// Test that run() returns the correct output type
Effect.runPromise(
  Effect.gen(function* () {
    const typedFlow = yield* flow;
    const result = yield* typedFlow.run({
      inputs: { input: { value: "test" } },
      storageId: "storage-1",
      jobId: "job-1",
    });

    if (result.type === "completed") {
      // result.result should be FlowOutputMap<NodesType>
      // Which means it should have an "output" key with the output schema
      expectType<{ output: { value: string } }>(result.result);

      // We should be able to access output node result
      expectType<{ value: string }>(result.result.output);
    }
  }),
);
