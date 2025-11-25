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

        const processNode = yield* createFlowNode({
          id: "process-1",
          name: "Process Node",
          description: "Test process",
          type: NodeType.process,
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
            "process-1": processNode,
          },
          edges: [{ source: "input-1", target: "process-1" }],
        });

        expect(flow.nodes).toHaveLength(2);
        expect(flow.edges).toHaveLength(1);
        expect(flow.nodes[0]?.id).toBe("input-1");
        expect(flow.nodes[1]?.id).toBe("process-1");
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

        // Valid DAG: input -> process-1 -> process-2 (process-2 is sink)
        const flow = yield* createFlow({
          flowId: "valid-dag",
          name: "Valid DAG Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            input: inputNode,
            "process-1": process1,
            "process-2": process2,
          },
          edges: [
            { source: "input", target: "process-1" },
            { source: "process-1", target: "process-2" },
          ],
        });

        expect(flow.nodes).toHaveLength(3);
        expect(flow.edges).toHaveLength(2);
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

        const processNode = yield* createFlowNode({
          id: "process-node",
          name: "Process Node",
          description: "Test process node (sink)",
          type: NodeType.process,
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
            "process-node": processNode,
          },
          edges: [{ source: "input-node", target: "process-node" }],
        });

        const result = yield* flow.run({
          inputs: { "input-node": { value: "test" } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          expect(result.result["process-node"]).toEqual({
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
          description: "Third node in sequence (sink)",
          type: NodeType.process,
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
          expect(result.result["seq-node-3"].value).toBe(22);
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
          description: "Target node (sink)",
          type: NodeType.process,
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
          expect(result.result.target.result).toBe("hello (processed)");
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
          description: "First target (sink)",
          type: NodeType.process,
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
          description: "Second target (sink)",
          type: NodeType.process,
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
          description: "Node that succeeds (sink)",
          type: NodeType.process,
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
          expect(result.result["success-node"]?.status).toBe("success");
          expect(result.result["success-node"]?.result).toBe("test");
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
          description: "Node that throws error (sink)",
          type: NodeType.process,
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
          description: "Node with strict input validation (sink)",
          type: NodeType.process,
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
          description: "Node that produces invalid output (sink)",
          type: NodeType.process,
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

  describe("KeepOutput Behavior", () => {
    it("should preserve output from node with keepOutput: true even when it has outgoing edges", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-1",
          name: "Input Node",
          description: "Input node",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const middleNode = yield* createFlowNode({
          id: "middle-1",
          name: "Middle Node with keepOutput",
          description: "Process node that keeps output",
          type: NodeType.process,
          keepOutput: true, // This node should appear in final outputs
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-middle` },
            }),
        });

        const sinkNode = yield* createFlowNode({
          id: "sink-1",
          name: "Sink Node",
          description: "Final sink node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-sink` },
            }),
        });

        const flow = yield* createFlow({
          flowId: "keep-output-flow",
          name: "Keep Output Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-1": inputNode,
            "middle-1": middleNode,
            "sink-1": sinkNode,
          },
          edges: [
            { source: "input-1", target: "middle-1" },
            { source: "middle-1", target: "sink-1" },
          ],
        });

        const result = yield* flow.run({
          inputs: { "input-1": { value: "test" } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          // Both middle node (keepOutput) and sink should be in results
          expect(result.result["middle-1"]).toEqual({ value: "test-middle" });
          expect(result.result["sink-1"]).toEqual({
            value: "test-middle-sink",
          });
        }
      }).pipe(Effect.runPromise));

    it("should follow topology rules for nodes with keepOutput: false or undefined", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-2",
          name: "Input Node",
          description: "Input node",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const middleNode = yield* createFlowNode({
          id: "middle-2",
          name: "Middle Node without keepOutput",
          description: "Process node that follows topology",
          type: NodeType.process,
          // keepOutput not set - should follow topology rules (not appear in output)
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-middle` },
            }),
        });

        const sinkNode = yield* createFlowNode({
          id: "sink-2",
          name: "Sink Node",
          description: "Final sink node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-sink` },
            }),
        });

        const flow = yield* createFlow({
          flowId: "topology-flow",
          name: "Topology Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-2": inputNode,
            "middle-2": middleNode,
            "sink-2": sinkNode,
          },
          edges: [
            { source: "input-2", target: "middle-2" },
            { source: "middle-2", target: "sink-2" },
          ],
        });

        const result = yield* flow.run({
          inputs: { "input-2": { value: "test" } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          // Only sink should be in results (middle-2 has outgoing edges and keepOutput is false)
          expect(result.result["middle-2"]).toBeUndefined();
          expect(result.result["sink-2"]).toEqual({
            value: "test-middle-sink",
          });
        }
      }).pipe(Effect.runPromise));

    it("should preserve outputs from multiple nodes with keepOutput: true", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-3",
          name: "Input Node",
          description: "Input node",
          type: NodeType.input,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const process1 = yield* createFlowNode({
          id: "process-1",
          name: "Process 1 with keepOutput",
          description: "First process node",
          type: NodeType.process,
          keepOutput: true,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value * 2 },
            }),
        });

        const process2 = yield* createFlowNode({
          id: "process-2",
          name: "Process 2 with keepOutput",
          description: "Second process node",
          type: NodeType.process,
          keepOutput: true,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value + 10 },
            }),
        });

        const sinkNode = yield* createFlowNode({
          id: "sink-3",
          name: "Sink Node",
          description: "Final sink node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value + 1 },
            }),
        });

        const flow = yield* createFlow({
          flowId: "multiple-keep-output-flow",
          name: "Multiple Keep Output Flow",
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          nodes: {
            "input-3": inputNode,
            "process-1": process1,
            "process-2": process2,
            "sink-3": sinkNode,
          },
          edges: [
            { source: "input-3", target: "process-1" },
            { source: "process-1", target: "process-2" },
            { source: "process-2", target: "sink-3" },
          ],
        });

        const result = yield* flow.run({
          inputs: { "input-3": { value: 5 } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          // All keepOutput nodes and sink should be in results
          expect(result.result["process-1"]).toEqual({ value: 10 }); // 5 * 2
          expect(result.result["process-2"]).toEqual({ value: 20 }); // 10 + 10
          expect(result.result["sink-3"]).toEqual({ value: 21 }); // 20 + 1
        }
      }).pipe(Effect.runPromise));

    it("should include both keepOutput node and topology sink in outputs", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-4",
          name: "Input Node",
          description: "Input node",
          type: NodeType.input,
          keepOutput: true, // Input with keepOutput
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-input` },
            }),
        });

        const sinkNode = yield* createFlowNode({
          id: "sink-4",
          name: "Sink Node",
          description: "Topology sink node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-sink` },
            }),
        });

        const flow = yield* createFlow({
          flowId: "keep-and-sink-flow",
          name: "Keep Output and Sink Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-4": inputNode,
            "sink-4": sinkNode,
          },
          edges: [{ source: "input-4", target: "sink-4" }],
        });

        const result = yield* flow.run({
          inputs: { "input-4": { value: "test" } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          // Both input (keepOutput) and sink (topology) should be in results
          expect(result.result["input-4"]).toEqual({ value: "test-input" });
          expect(result.result["sink-4"]).toEqual({
            value: "test-input-sink",
          });
        }
      }).pipe(Effect.runPromise));

    it("should handle keepOutput with multiple parallel sinks", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-5",
          name: "Input Node",
          description: "Input node with keepOutput",
          type: NodeType.input,
          keepOutput: true,
          multiOutput: true,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const sink1 = yield* createFlowNode({
          id: "sink-5a",
          name: "Sink 1",
          description: "First sink",
          type: NodeType.process,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value * 2 },
            }),
        });

        const sink2 = yield* createFlowNode({
          id: "sink-5b",
          name: "Sink 2",
          description: "Second sink",
          type: NodeType.process,
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value * 3 },
            }),
        });

        const flow = yield* createFlow({
          flowId: "keep-parallel-sinks-flow",
          name: "Keep Output with Parallel Sinks Flow",
          inputSchema: z.object({ value: z.number() }),
          outputSchema: z.object({ value: z.number() }),
          nodes: {
            "input-5": inputNode,
            "sink-5a": sink1,
            "sink-5b": sink2,
          },
          edges: [
            { source: "input-5", target: "sink-5a" },
            { source: "input-5", target: "sink-5b" },
          ],
        });

        const result = yield* flow.run({
          inputs: { "input-5": { value: 10 } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          // Input (keepOutput) and both sinks should be in results
          expect(result.result["input-5"]).toEqual({ value: 10 });
          expect(result.result["sink-5a"]).toEqual({ value: 20 }); // 10 * 2
          expect(result.result["sink-5b"]).toEqual({ value: 30 }); // 10 * 3
        }
      }).pipe(Effect.runPromise));

    it("should handle keepOutput: false explicitly", () =>
      Effect.gen(function* () {
        const inputNode = yield* createFlowNode({
          id: "input-6",
          name: "Input Node",
          description: "Input node",
          type: NodeType.input,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: data.value },
            }),
        });

        const middleNode = yield* createFlowNode({
          id: "middle-6",
          name: "Middle Node with keepOutput: false",
          description: "Process node explicitly not keeping output",
          type: NodeType.process,
          keepOutput: false, // Explicitly false
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-middle` },
            }),
        });

        const sinkNode = yield* createFlowNode({
          id: "sink-6",
          name: "Sink Node",
          description: "Final sink node",
          type: NodeType.process,
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          run: ({ data }) =>
            Effect.succeed({
              type: "complete",
              data: { value: `${data.value}-sink` },
            }),
        });

        const flow = yield* createFlow({
          flowId: "explicit-false-flow",
          name: "Explicit False Keep Output Flow",
          inputSchema: z.object({ value: z.string() }),
          outputSchema: z.object({ value: z.string() }),
          nodes: {
            "input-6": inputNode,
            "middle-6": middleNode,
            "sink-6": sinkNode,
          },
          edges: [
            { source: "input-6", target: "middle-6" },
            { source: "middle-6", target: "sink-6" },
          ],
        });

        const result = yield* flow.run({
          inputs: { "input-6": { value: "test" } },
          storageId: "test-storage",
          jobId: "test-job",
        });

        expect(result.type).toBe("completed");
        if (result.type === "completed") {
          // Middle node should not be in results (keepOutput: false)
          expect(result.result["middle-6"]).toBeUndefined();
          // Only sink should be in results
          expect(result.result["sink-6"]).toEqual({
            value: "test-middle-sink",
          });
        }
      }).pipe(Effect.runPromise));
  });
});
