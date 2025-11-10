/**
 * Tests for Flow Engine DAG processing and validation
 *
 * Covers:
 * - Flow creation and configuration
 * - DAG validation and cycle detection
 * - Node execution lifecycle
 * - Edge connection and data flow
 * - Result type handling (success, error, cancellation)
 */

import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { UploadistaError } from "../../src/errors";
import { createFlow } from "../../src/flow";
import { createFlowNode, NodeType } from "../../src/flow/node";

describe("Flow Engine", () => {
  describe("Flow Creation", () => {
    it("should create a flow with name and id", () =>
      Effect.gen(function* () {
        const flow = yield* createFlow({
          flowId: "test-flow-1",
          name: "Test Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ result: z.string() }),
          nodes: {},
          edges: [],
        });

        expect(flow.id).toBe("test-flow-1");
        expect(flow.name).toBe("Test Flow");
      }).pipe(Effect.runPromise));

    it("should create a flow with nodes and edges", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-1",
          name: "Input Node",
          description: "Test input",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        const outputNode = yield* createFlowNode({
          id: "output-1",
          name: "Output Node",
          description: "Test output",
          type: NodeType.output,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        const flow = yield* createFlow({
          flowId: "test-flow-2",
          name: "Test Flow with Nodes",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-1": inputNode,
            "output-1": outputNode,
          },
          edges: [{ source: "input-1", target: "output-1" }],
        });

        expect(flow.nodes).toHaveLength(2);
        expect(flow.edges).toHaveLength(1);
        expect(flow.nodes[0]?.id).toBe("input-1");
        expect(flow.nodes[1]?.id).toBe("output-1");
      }).pipe(Effect.runPromise));

    it("should handle empty flow creation", () =>
      Effect.gen(function* () {
        const flow = yield* createFlow({
          flowId: "empty-flow",
          name: "Empty Flow",
          inputSchema: z.object({}),
          outputSchema: z.object({}),
          nodes: {},
          edges: [],
        });

        expect(flow.nodes).toHaveLength(0);
        expect(flow.edges).toHaveLength(0);
      }).pipe(Effect.runPromise));
  });

  describe("DAG Validation", () => {
    it("should detect cycles in the graph", () =>
      Effect.gen(function* () {
        const node1 = yield* createFlowNode({
          id: "node-1",
          name: "Node 1",
          description: "First node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        const node2 = yield* createFlowNode({
          id: "node-2",
          name: "Node 2",
          description: "Second node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        // Attempt to create flow with cycle - this should either fail or be detected during execution
        const result = yield* Effect.either(
          createFlow({
            flowId: "cycle-flow",
            name: "Flow with Cycle",
            inputSchema: z.object({ value: z.string() }),
            outputSchema: z.object({ value: z.string() }),
            nodes: {
              "node-1": node1,
              "node-2": node2,
            },
            edges: [
              { source: "node-1", target: "node-2" },
              { source: "node-2", target: "node-1" },
            ],
          }),
        );

        // Note: Current implementation may or may not detect cycles at creation time
        // This test documents the expected behavior - cycle detection should happen
        // either at creation or execution time
        if (result._tag === "Right") {
          // If flow creation succeeds, execution should detect the cycle
          const flow = result.right;
          const runResult = yield* Effect.either(
            flow.run({
              inputs: { "node-1": { value: "test" } },
              storageId: "test-storage",
              jobId: "test-job",
            }),
          );

          // Execution should fail with cycle detection or timeout
          // This is a known issue to be fixed - test documents expected behavior
          expect(runResult._tag).toBe("Left");
        }
      }).pipe(Effect.runPromise));

    it("should allow valid DAG structures", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input",
          name: "Input",
          description: "Input node",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        const process1 = yield* createFlowNode({
          id: "process-1",
          name: "Process 1",
          description: "First processor",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-processed-1` },
            }),
        });

        const process2 = yield* createFlowNode({
          id: "process-2",
          name: "Process 2",
          description: "Second processor",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-processed-2` },
            }),
        });

        const outputNode = yield* createFlowNode({
          id: "output",
          name: "Output",
          description: "Output node",
          type: NodeType.output,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        // Valid DAG: input -> process-1 -> process-2 -> output
        const flow = yield* createFlow({
          flowId: "valid-dag",
          name: "Valid DAG Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            input: inputNode,
            "process-1": process1,
            "process-2": process2,
            output: outputNode,
          },
          edges: [
            { source: "input", target: "process-1" },
            { source: "process-1", target: "process-2" },
            { source: "process-2", target: "output" },
          ],
        });

        expect(flow.nodes).toHaveLength(4);
        expect(flow.edges).toHaveLength(3);
      }).pipe(Effect.runPromise));

    it("should handle disconnected nodes", () =>
      Effect.gen(function* () {
        const node1 = yield* createFlowNode({
          id: "disconnected-1",
          name: "Disconnected 1",
          description: "First disconnected node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        const node2 = yield* createFlowNode({
          id: "disconnected-2",
          name: "Disconnected 2",
          description: "Second disconnected node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({ type: "complete", data: { value: data.value } }),
        });

        // Create flow with no edges - disconnected nodes
        const flow = yield* createFlow({
          flowId: "disconnected-flow",
          name: "Disconnected Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "disconnected-1": node1,
            "disconnected-2": node2,
          },
          edges: [],
        });

        expect(flow.nodes).toHaveLength(2);
        expect(flow.edges).toHaveLength(0);
      }).pipe(Effect.runPromise));
  });

  describe("Node Execution Lifecycle", () => {
    it("should execute a single node successfully", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-node",
          name: "Input Node",
          description: "Test input node",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const outputNode = yield* createFlowNode({
          id: "output-node",
          name: "Output Node",
          description: "Test output node",
          type: NodeType.output,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ result: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { result: `processed-${data.value}` },
            }),
        });

        const flow = yield* createFlow({
          flowId: "single-node-flow",
          name: "Single Node Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ result: z.string() }),
          nodes: {
            "input-node": inputNode,
            "output-node": outputNode,
          },
          edges: [{ source: "input-node", target: "output-node" }],
        });

        const result = yield* flow.run({
          inputs: { "input-node": { value: "test" } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          expect(
            (result.result as Record<string, unknown>)["output-node"],
          ).toEqual({
            result: "processed-test",
          });
        }
      }).pipe(Effect.runPromise));

    it("should execute multiple nodes in sequence", () =>
      Effect.gen(function* () {
        const node1 = yield* createFlowNode({
          id: "seq-node-1",
          name: "Sequential Node 1",
          description: "First node in sequence",
          type: NodeType.input,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value + 1 },
            }),
        });

        const node2 = yield* createFlowNode({
          id: "seq-node-2",
          name: "Sequential Node 2",
          description: "Second node in sequence",
          type: NodeType.process,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value * 2 },
            }),
        });

        const node3 = yield* createFlowNode({
          id: "seq-node-3",
          name: "Sequential Node 3",
          description: "Third node in sequence",
          type: NodeType.output,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value + 10 },
            }),
        });

        const flow = yield* createFlow({
          flowId: "sequential-flow",
          name: "Sequential Flow",
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          nodes: {
            "seq-node-1": node1,
            "seq-node-2": node2,
            "seq-node-3": node3,
          },
          edges: [
            { source: "seq-node-1", target: "seq-node-2" },
            { source: "seq-node-2", target: "seq-node-3" },
          ],
        });

        const result = yield* flow.run({
          inputs: { "seq-node-1": { value: 5 } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        // Expected: (5 + 1) * 2 + 10 = 6 * 2 + 10 = 12 + 10 = 22
        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          expect(
            (result.result as Record<string, { value: number }>)["seq-node-3"]
              .value,
          ).toBe(22);
        }
      }).pipe(Effect.runPromise));

    it("should handle node execution errors gracefully", () =>
      Effect.gen(function* () {
        const failingNode = yield* createFlowNode({
          id: "failing-node",
          name: "Failing Node",
          description: "Node that always fails",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: () =>
            Effect.fail(
              UploadistaError.fromCode("UNKNOWN_ERROR", {
                body: "Intentional failure for testing",
              }),
            ),
        });

        const flow = yield* createFlow({
          flowId: "error-flow",
          name: "Error Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "failing-node": failingNode,
          },
          edges: [],
        });

        const result = yield* Effect.either(
          flow.run({
            inputs: { "failing-node": { value: "test" } },
            storageId: "test-storage",
            jobId: "test-job",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left).toBeInstanceOf(UploadistaError);
        }
      }).pipe(Effect.runPromise));
  });

  describe("Edge Connection and Data Flow", () => {
    it("should pass data through connected nodes", () =>
      Effect.gen(function* () {
        const sourceNode = yield* createFlowNode({
          id: "source",
          name: "Source",
          description: "Source node",
          type: NodeType.input,
          inputSchema: z.object({ text: z.string() }),
          outputSchema: z.object({
            text: z.string(),
            metadata: z.object({ processed: z.boolean() }),
          }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { text: data.text, metadata: { processed: true } },
            }),
        });

        const targetNode = yield* createFlowNode({
          id: "target",
          name: "Target",
          description: "Target node",
          type: NodeType.output,
          inputSchema: z.object({
            text: z.string(),
            metadata: z.object({ processed: z.boolean() }),
          }),
          outputSchema: z.object({ result: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: {
                result: `${data.text} (${data.metadata.processed ? "processed" : "unprocessed"})`,
              },
            }),
        });

        const flow = yield* createFlow({
          flowId: "data-flow",
          name: "Data Flow",
          inputSchema: z.object({ text: z.string() }),
          outputSchema: z.object({ result: z.string() }),
          nodes: {
            source: sourceNode,
            target: targetNode,
          },
          edges: [
            {
              source: "source",
              target: "target",
            },
          ],
        });

        const result = yield* flow.run({
          inputs: { source: { text: "hello" } },

          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          expect(
            (result.result as Record<string, { result: string }>).target.result,
          ).toBe("hello (processed)");
        }
      }).pipe(Effect.runPromise));

    it("should handle multiple edges from single source", () =>
      Effect.gen(function* () {
        const sourceNode = yield* createFlowNode({
          id: "multi-source",
          name: "Multi Source",
          description: "Source with multiple outputs",
          type: NodeType.input,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value * 2 },
            }),
          multiOutput: true,
        });

        const target1 = yield* createFlowNode({
          id: "target-1",
          name: "Target 1",
          description: "First target",
          type: NodeType.output,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value + 1 },
            }),
        });

        const target2 = yield* createFlowNode({
          id: "target-2",
          name: "Target 2",
          description: "Second target",
          type: NodeType.output,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value + 2 },
            }),
        });

        const flow = yield* createFlow({
          flowId: "multi-edge-flow",
          name: "Multi Edge Flow",
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          nodes: {
            "multi-source": sourceNode,
            "target-1": target1,
            "target-2": target2,
          },
          edges: [
            {
              source: "multi-source",
              target: "target-1",
            },
            {
              source: "multi-source",
              target: "target-2",
            },
          ],
        });

        // Flow should execute and fan out to both targets
        const result = yield* flow.run({
          inputs: { "multi-source": { value: 5 } },

          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
      }).pipe(Effect.runPromise));
  });

  describe("Result Type Handling", () => {
    it("should handle success results", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-node",
          name: "Input Node",
          description: "Input for success test",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const successNode = yield* createFlowNode({
          id: "success-node",
          name: "Success Node",
          description: "Node that succeeds",
          type: NodeType.output,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({
            result: z.string(),
            status: z.literal("success"),
          }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { result: data.value, status: "success" as const },
            }),
        });

        const flow = yield* createFlow({
          flowId: "success-flow",
          name: "Success Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({
            result: z.string(),
            status: z.literal("success"),
          }),
          nodes: {
            "input-node": inputNode,
            "success-node": successNode,
          },
          edges: [{ source: "input-node", target: "success-node" }],
        });

        const result = yield* flow.run({
          inputs: { "input-node": { value: "test" } },

          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          const successNode = (
            result.result as Record<
              string,
              { result: string; status: "success" }
            >
          )["success-node"];
          expect(successNode?.status).toBe("success");
          expect(successNode?.result).toBe("test");
        }
      }).pipe(Effect.runPromise));

    it("should handle error results", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-node",
          name: "Input Node",
          description: "Input for error test",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const errorNode = yield* createFlowNode({
          id: "error-node",
          name: "Error Node",
          description: "Node that throws error",
          type: NodeType.output,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: () =>
            Effect.fail(
              UploadistaError.fromCode("UNKNOWN_ERROR", {
                body: "Test error message",
              }),
            ),
        });

        const flow = yield* createFlow({
          flowId: "error-result-flow",
          name: "Error Result Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-node": inputNode,
            "error-node": errorNode,
          },
          edges: [{ source: "input-node", target: "error-node" }],
        });

        const result = yield* Effect.either(
          flow.run({
            inputs: { "input-node": { value: "test" } },
            storageId: "test-storage",
            jobId: "test-job",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          const error = result.left;
          expect(error).toBeInstanceOf(UploadistaError);
          expect(error.body).toBe("Test error message");
        }
      }).pipe(Effect.runPromise));

    it("should handle validation errors in input", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-node",
          name: "Input Node",
          description: "Input with validation",
          type: NodeType.input,
          inputSchema: z.object({
            value: z.string(),
            count: z.number(),
          }),
          outputSchema: z.object({
            value: z.string(),
            count: z.number(),
          }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value, count: data.count },
            }),
        });

        const strictNode = yield* createFlowNode({
          id: "strict-node",
          name: "Strict Node",
          description: "Node with strict input validation",
          type: NodeType.output,
          inputSchema: z.object({
            value: z.string().min(5),
            count: z.number().positive(),
          }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const flow = yield* createFlow({
          flowId: "validation-flow",
          name: "Validation Flow",
          inputSchema: z.object({
            value: z.string(),
            count: z.number(),
          }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-node": inputNode,
            "strict-node": strictNode,
          },
          edges: [{ source: "input-node", target: "strict-node" }],
        });

        // Invalid input - too short string
        const result = yield* Effect.either(
          flow.run({
            inputs: { "input-node": { value: "abc", count: 5 } },
            storageId: "test-storage",
            jobId: "test-job",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          const error = result.left;
          expect(error).toBeInstanceOf(UploadistaError);
          expect(error.code).toBe("FLOW_INPUT_VALIDATION_ERROR");
        }
      }).pipe(Effect.runPromise));

    it("should handle validation errors in output", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-node",
          name: "Input Node",
          description: "Input for output validation test",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const invalidOutputNode = yield* createFlowNode({
          id: "invalid-output-node",
          name: "Invalid Output Node",
          description: "Node that produces invalid output",
          type: NodeType.output,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({
            value: z.string(),
            requiredField: z.string(),
          }),
          run: ({ data }) =>
            // Intentionally return invalid output (missing requiredField)
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const flow = yield* createFlow({
          flowId: "invalid-output-flow",
          name: "Invalid Output Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({
            value: z.string(),
            requiredField: z.string(),
          }),
          nodes: {
            "input-node": inputNode,
            "invalid-output-node": invalidOutputNode,
          },
          edges: [{ source: "input-node", target: "invalid-output-node" }],
        });

        const result = yield* Effect.either(
          flow.run({
            inputs: { "input-node": { value: "test" } },
            storageId: "test-storage",
            jobId: "test-job",
          }),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          const error = result.left;
          expect(error).toBeInstanceOf(UploadistaError);
          expect(error.code).toBe("FLOW_OUTPUT_VALIDATION_ERROR");
        }
      }).pipe(Effect.runPromise));
  });
});
