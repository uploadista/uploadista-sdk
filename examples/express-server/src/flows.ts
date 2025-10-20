import {
  createFlow,
  createInputNode,
  createStorageNode,
} from "@uploadista/core";
import {
  createDescribeImageNode,
  createOptimizeNode,
  createRemoveBackgroundNode,
} from "@uploadista/flow-images-nodes";

const inputNode = createInputNode("input");
const outputNode = createStorageNode("output");

const describeImageNode = createDescribeImageNode("describe-image");
const removeBackgroundNode = createRemoveBackgroundNode("remove-background");

const optimizeNode = createOptimizeNode("optimize", {
  quality: 80,
  format: "webp",
});

export const simpleFlow = createFlow({
  flowId: "simple-flow",
  name: "Simple Flow",
  nodes: {
    input: inputNode,
    output: outputNode,
  },
  edges: [{ source: "input", target: "output" }],
});

export const optimizeFlow = createFlow({
  flowId: "optimize-flow",
  name: "Optimize Flow",
  nodes: {
    input: inputNode,
    output: outputNode,
    optimize: optimizeNode,
  },
  edges: [
    { source: "input", target: "optimize" },
    { source: "optimize", target: "output" },
  ],
});

export const describeImageFlow = createFlow({
  flowId: "describe-image-flow",
  name: "Describe Image Flow",
  nodes: {
    input: inputNode,
    output: outputNode,
    "describe-image": describeImageNode,
  },
  edges: [
    { source: "input", target: "describe-image" },
    { source: "describe-image", target: "output" },
  ],
});

export const removeBackgroundFlow = createFlow({
  flowId: "remove-background-flow",
  name: "Remove Background Flow",
  nodes: {
    input: inputNode,
    output: outputNode,
    "remove-background": removeBackgroundNode,
  },
  edges: [
    { source: "input", target: "remove-background" },
    { source: "remove-background", target: "output" },
  ],
});

export const flows = (flowId: string) => {
  console.log("flowId", flowId);
  switch (flowId) {
    case "optimize-flow":
      return optimizeFlow;
    case "describe-image-flow":
      return describeImageFlow;
    case "remove-background-flow":
      return removeBackgroundFlow;
    default:
      return simpleFlow;
  }
};
