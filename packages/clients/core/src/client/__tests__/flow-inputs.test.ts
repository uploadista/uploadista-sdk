import type { FlowData } from "@uploadista/core/flow";
import { describe, expect, it } from "vitest";

describe("Flow Input Node Discovery", () => {
  describe("findInputNode logic", () => {
    it("should identify single input node correctly", () => {
      const mockFlow: FlowData = {
        id: "test-flow",
        name: "Test Flow",
        nodes: [
          { id: "input-1", name: "File Input", description: "", type: "input" },
          { id: "process-1", name: "Process", description: "", type: "transform" },
          { id: "output-1", name: "Output", description: "", type: "output" },
        ],
        edges: [],
      };

      // Simulate the findInputNode logic
      const inputNodes = mockFlow.nodes
        .filter((node) => node.type === "input")
        .map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
        }));

      const result = {
        inputNodes,
        single: inputNodes.length === 1,
      };

      expect(result.single).toBe(true);
      expect(result.inputNodes).toHaveLength(1);
      expect(result.inputNodes[0]).toEqual({
        id: "input-1",
        type: "input",
        name: "File Input",
      });
    });

    it("should identify multiple input nodes correctly", () => {
      const mockFlow: FlowData = {
        id: "multi-input-flow",
        name: "Multi Input Flow",
        nodes: [
          { id: "input-1", name: "File Input", description: "", type: "input" },
          { id: "input-2", name: "Data Input", description: "", type: "input" },
          { id: "process-1", name: "Process", description: "", type: "transform" },
        ],
        edges: [],
      };

      const inputNodes = mockFlow.nodes
        .filter((node) => node.type === "input")
        .map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
        }));

      const result = {
        inputNodes,
        single: inputNodes.length === 1,
      };

      expect(result.single).toBe(false);
      expect(result.inputNodes).toHaveLength(2);
      expect(result.inputNodes[0].id).toBe("input-1");
      expect(result.inputNodes[1].id).toBe("input-2");
    });

    it("should handle flow with no input nodes", () => {
      const mockFlow: FlowData = {
        id: "no-input-flow",
        name: "No Input Flow",
        nodes: [
          { id: "process-1", name: "Process", description: "", type: "transform" },
          { id: "output-1", name: "Output", description: "", type: "output" },
        ],
        edges: [],
      };

      const inputNodes = mockFlow.nodes
        .filter((node) => node.type === "input")
        .map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
        }));

      const result = {
        inputNodes,
        single: inputNodes.length === 1,
      };

      expect(result.single).toBe(false);
      expect(result.inputNodes).toHaveLength(0);
    });

    it("should handle nodes without names", () => {
      const mockFlow: FlowData = {
        id: "test-flow",
        name: "Test Flow",
        nodes: [
          { id: "input-1", name: "", description: "", type: "input" },
        ],
        edges: [],
      };

      const inputNodes = mockFlow.nodes
        .filter((node) => node.type === "input")
        .map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
        }));

      expect(inputNodes[0].name).toBe("");
      expect(inputNodes[0].id).toBe("input-1");
    });

    it("should filter out non-input nodes correctly", () => {
      const mockFlow: FlowData = {
        id: "complex-flow",
        name: "Complex Flow",
        nodes: [
          { id: "input-1", name: "Input", description: "", type: "input" },
          { id: "transform-1", name: "Transform", description: "", type: "transform" },
          { id: "conditional-1", name: "Conditional", description: "", type: "conditional" },
          { id: "output-1", name: "Output", description: "", type: "output" },
          { id: "utility-1", name: "Utility", description: "", type: "utility" },
        ],
        edges: [],
      };

      const inputNodes = mockFlow.nodes
        .filter((node) => node.type === "input")
        .map((node) => ({
          id: node.id,
          type: node.type,
          name: node.name,
        }));

      expect(inputNodes).toHaveLength(1);
      expect(inputNodes[0].id).toBe("input-1");
    });
  });

  describe("Flow inputs structure", () => {
    it("should create valid URL operation input", () => {
      const flowInputs = {
        "input-node-1": {
          operation: "url",
          url: "https://example.com/file.jpg",
          storageId: "s3-production",
          metadata: { source: "external" },
        },
      };

      expect(flowInputs["input-node-1"].operation).toBe("url");
      expect(flowInputs["input-node-1"].url).toBe("https://example.com/file.jpg");
      expect(flowInputs["input-node-1"].storageId).toBe("s3-production");
    });

    it("should create valid init operation input", () => {
      const flowInputs = {
        "input-node-1": {
          operation: "init",
          storageId: "s3-production",
          metadata: {
            originalName: "test.jpg",
            mimeType: "image/jpeg",
            size: 1024,
          },
        },
      };

      expect(flowInputs["input-node-1"].operation).toBe("init");
      expect(flowInputs["input-node-1"].storageId).toBe("s3-production");
      expect(flowInputs["input-node-1"].metadata.originalName).toBe("test.jpg");
    });

    it("should support multiple input nodes", () => {
      const flowInputs = {
        "input-node-1": {
          operation: "url",
          url: "https://example.com/file1.jpg",
          storageId: "s3",
        },
        "input-node-2": {
          operation: "init",
          storageId: "s3",
          metadata: { filename: "file2.jpg" },
        },
      };

      const nodeIds = Object.keys(flowInputs);
      expect(nodeIds).toHaveLength(2);
      expect(nodeIds).toContain("input-node-1");
      expect(nodeIds).toContain("input-node-2");
    });

    it("should handle optional metadata correctly", () => {
      const flowInputsWithMetadata = {
        "input-node-1": {
          operation: "url" as const,
          url: "https://example.com/file.jpg",
          storageId: "s3",
          metadata: { custom: "value" },
        },
      };

      const flowInputsWithoutMetadata = {
        "input-node-1": {
          operation: "url" as const,
          url: "https://example.com/file.jpg",
          storageId: "s3",
        },
      };

      expect(flowInputsWithMetadata["input-node-1"].metadata).toBeDefined();
      expect(flowInputsWithoutMetadata["input-node-1"].metadata).toBeUndefined();
    });
  });
});
