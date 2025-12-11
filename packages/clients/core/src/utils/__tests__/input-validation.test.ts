import type { Flow } from "@uploadista/core/flow";
import { inputTypeRegistry } from "@uploadista/core/flow";
import { beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { UploadistaError } from "../../error";
import {
  allRequiredInputsProvided,
  validateFlowInputs,
  validateFlowInputsOrThrow,
} from "../input-validation";

// Mock flow for testing
const mockFlow: Flow = {
  id: "test-flow",
  name: "Test Flow",
  description: "Test flow for validation",
  nodes: [
    {
      id: "input-1",
      name: "File Input",
      type: "input",
      inputTypeId: "streaming-input-v1",
      input: null,
      output: [],
    },
    {
      id: "input-2",
      name: "Data Input",
      type: "input",
      inputTypeId: "custom-data-input-v1",
      input: null,
      output: [],
    },
    {
      id: "process-node",
      name: "Process",
      type: "process",
      input: ["input-1"],
      output: [],
    },
  ],
  edges: [],
  root: [],
};

// Register test schemas
beforeAll(() => {
  // streaming-input-v1 is already registered by core package

  // Register a custom test input type
  if (!inputTypeRegistry.has("custom-data-input-v1")) {
    inputTypeRegistry.register({
      id: "custom-data-input-v1",
      schema: z.object({
        title: z.string(),
        count: z.number().min(0),
      }),
      version: "1.0.0",
      description: "Custom data input for testing",
    });
  }
});

describe("validateFlowInputs", () => {
  it("succeeds when all inputs are valid", () => {
    const inputs = {
      "input-1": {
        operation: "url",
        url: "https://example.com/file.jpg",
      },
      "input-2": {
        title: "Test",
        count: 5,
      },
    };

    const result = validateFlowInputs(inputs, mockFlow);
    expect(result.success).toBe(true);
  });

  it("fails when input node is not found in flow", () => {
    const inputs = {
      "nonexistent-node": { operation: "url", url: "https://example.com" },
    };

    const result = validateFlowInputs(inputs, mockFlow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].nodeId).toBe("nonexistent-node");
      expect(result.errors[0].error).toContain("not found in flow");
    }
  });

  it("fails when node is not an input node", () => {
    const inputs = {
      "process-node": { someData: "value" },
    };

    const result = validateFlowInputs(inputs, mockFlow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].nodeId).toBe("process-node");
      expect(result.errors[0].error).toContain("not an input node");
    }
  });

  it("fails when node type is not registered", () => {
    const flowWithUnknownType: Flow = {
      ...mockFlow,
      nodes: [
        {
          id: "input-unknown",
          name: "Unknown Input",
          type: "input",
          inputTypeId: "unregistered-type-v1",
          input: null,
          output: [],
        },
      ],
    };

    const inputs = {
      "input-unknown": { someData: "value" },
    };

    const result = validateFlowInputs(inputs, flowWithUnknownType);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toContain("not registered");
    }
  });

  it("fails when input data does not match schema", () => {
    const inputs = {
      "input-2": {
        title: "Test",
        // Missing required 'count' field
      },
    };

    const result = validateFlowInputs(inputs, mockFlow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].nodeId).toBe("input-2");
    }
  });

  it("fails when input data has wrong type", () => {
    const inputs = {
      "input-2": {
        title: "Test",
        count: "not a number", // Should be number
      },
    };

    const result = validateFlowInputs(inputs, mockFlow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].nodeId).toBe("input-2");
    }
  });

  it("validates multiple inputs and reports all errors", () => {
    const inputs = {
      "input-1": {
        operation: "invalid-operation", // Invalid operation type
      },
      "input-2": {
        title: 123, // Should be string
        count: -5, // Should be >= 0
      },
    };

    const result = validateFlowInputs(inputs, mockFlow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
      const nodeIds = result.errors.map((e) => e.nodeId);
      expect(nodeIds).toContain("input-1");
      expect(nodeIds).toContain("input-2");
    }
  });

  it("uses default inputTypeId when not specified", () => {
    const flowWithDefaultType: Flow = {
      ...mockFlow,
      nodes: [
        {
          id: "input-default",
          name: "Default Input",
          type: "input",
          // inputTypeId not specified - should default to streaming-input-v1
          input: null,
          output: [],
        },
      ],
    };

    const inputs = {
      "input-default": {
        operation: "url",
        url: "https://example.com/file.jpg",
      },
    };

    const result = validateFlowInputs(inputs, flowWithDefaultType);
    expect(result.success).toBe(true);
  });
});

describe("validateFlowInputsOrThrow", () => {
  it("does not throw when inputs are valid", () => {
    const inputs = {
      "input-1": {
        operation: "url",
        url: "https://example.com/file.jpg",
      },
      "input-2": {
        title: "Test",
        count: 5,
      },
    };

    expect(() => {
      validateFlowInputsOrThrow(inputs, mockFlow);
    }).not.toThrow();
  });

  it("throws UploadistaError when inputs are invalid", () => {
    const inputs = {
      "input-1": {
        operation: "invalid-operation",
      },
    };

    expect(() => {
      validateFlowInputsOrThrow(inputs, mockFlow);
    }).toThrow(UploadistaError);
  });

  it("throws error with formatted message containing all errors", () => {
    const inputs = {
      "input-1": {
        operation: "invalid",
      },
      "input-2": {
        title: 123, // Wrong type
      },
    };

    try {
      validateFlowInputsOrThrow(inputs, mockFlow);
      expect.fail("Should have thrown an error");
    } catch (error) {
      expect(error).toBeInstanceOf(UploadistaError);
      const uploadistaError = error as UploadistaError;
      expect(uploadistaError.message).toContain("input-1");
      expect(uploadistaError.message).toContain("input-2");
    }
  });
});

describe("allRequiredInputsProvided", () => {
  it("returns true when all input nodes have data", () => {
    const inputs = {
      "input-1": { operation: "url", url: "https://example.com" },
      "input-2": { title: "Test", count: 5 },
    };

    const result = allRequiredInputsProvided(inputs, mockFlow);
    expect(result).toBe(true);
  });

  it("returns false when an input node is missing", () => {
    const inputs = {
      "input-1": { operation: "url", url: "https://example.com" },
      // input-2 is missing
    };

    const result = allRequiredInputsProvided(inputs, mockFlow);
    expect(result).toBe(false);
  });

  it("returns true when flow has no input nodes", () => {
    const flowWithoutInputs: Flow = {
      ...mockFlow,
      nodes: mockFlow.nodes.filter((n) => n.type !== "input"),
    };

    const inputs = {};
    const result = allRequiredInputsProvided(inputs, flowWithoutInputs);
    expect(result).toBe(true);
  });

  it("returns true when extra inputs are provided", () => {
    const inputs = {
      "input-1": { operation: "url", url: "https://example.com" },
      "input-2": { title: "Test", count: 5 },
      "extra-input": { someData: "value" }, // Extra input is OK
    };

    const result = allRequiredInputsProvided(inputs, mockFlow);
    expect(result).toBe(true);
  });
});
