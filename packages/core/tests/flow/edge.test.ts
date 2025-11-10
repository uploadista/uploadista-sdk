import { describe, expect, it } from "vitest";
import { createFlowEdge, type FlowEdge } from "./edge";

describe("FlowEdge", () => {
  describe("createFlowEdge", () => {
    it("should create a basic edge with source and target", () => {
      const edge = createFlowEdge({
        source: "node1",
        target: "node2",
      });

      expect(edge).toEqual({
        source: "node1",
        target: "node2",
        sourcePort: undefined,
        targetPort: undefined,
      });
    });

    it("should create edge with source and target ports", () => {
      const edge = createFlowEdge({
        source: "node1",
        target: "node2",
        sourcePort: "output1",
        targetPort: "input1",
      });

      expect(edge).toEqual({
        source: "node1",
        target: "node2",
        sourcePort: "output1",
        targetPort: "input1",
      });
    });

    it("should create edge with only source port", () => {
      const edge = createFlowEdge({
        source: "node1",
        target: "node2",
        sourcePort: "output1",
      });

      expect(edge).toEqual({
        source: "node1",
        target: "node2",
        sourcePort: "output1",
        targetPort: undefined,
      });
    });

    it("should create edge with only target port", () => {
      const edge = createFlowEdge({
        source: "node1",
        target: "node2",
        targetPort: "input1",
      });

      expect(edge).toEqual({
        source: "node1",
        target: "node2",
        sourcePort: undefined,
        targetPort: "input1",
      });
    });

    it("should handle empty string ports", () => {
      const edge = createFlowEdge({
        source: "node1",
        target: "node2",
        sourcePort: "",
        targetPort: "",
      });

      expect(edge).toEqual({
        source: "node1",
        target: "node2",
        sourcePort: "",
        targetPort: "",
      });
    });

    it("should preserve all provided properties", () => {
      const edgeData = {
        source: "input-node",
        target: "transform-node",
        sourcePort: "file-output",
        targetPort: "file-input",
      };

      const edge = createFlowEdge(edgeData);

      expect(edge.source).toBe(edgeData.source);
      expect(edge.target).toBe(edgeData.target);
      expect(edge.sourcePort).toBe(edgeData.sourcePort);
      expect(edge.targetPort).toBe(edgeData.targetPort);
    });

    it("should create valid FlowEdge type", () => {
      const edge: FlowEdge = createFlowEdge({
        source: "node1",
        target: "node2",
      });

      // Type assertion test - if this compiles, the types are compatible
      expect(edge).toHaveProperty("source");
      expect(edge).toHaveProperty("target");
      expect(edge).toHaveProperty("sourcePort");
      expect(edge).toHaveProperty("targetPort");
    });

    it("should handle special characters in node names", () => {
      const edge = createFlowEdge({
        source: "node-with-dashes_and_underscores.123",
        target: "another.node@domain.com",
        sourcePort: "port/with/slashes",
        targetPort: "port:with:colons",
      });

      expect(edge.source).toBe("node-with-dashes_and_underscores.123");
      expect(edge.target).toBe("another.node@domain.com");
      expect(edge.sourcePort).toBe("port/with/slashes");
      expect(edge.targetPort).toBe("port:with:colons");
    });

    it("should create multiple edges with different configurations", () => {
      const edges = [
        createFlowEdge({ source: "a", target: "b" }),
        createFlowEdge({ source: "b", target: "c", sourcePort: "out" }),
        createFlowEdge({ source: "c", target: "d", targetPort: "in" }),
        createFlowEdge({
          source: "d",
          target: "e",
          sourcePort: "out",
          targetPort: "in",
        }),
      ];

      expect(edges).toHaveLength(4);
      expect(edges[0]?.sourcePort).toBeUndefined();
      expect(edges[1]?.sourcePort).toBe("out");
      expect(edges[2]?.targetPort).toBe("in");
      expect(edges[3]?.sourcePort).toBe("out");
      expect(edges[3]?.targetPort).toBe("in");
    });
  });
});
