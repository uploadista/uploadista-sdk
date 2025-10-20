# Flow Engine

A flexible and extensible flow engine for executing directed acyclic graphs (DAGs) of processing nodes.

## Overview

The Flow Engine allows you to create complex processing pipelines by connecting nodes together. Each node represents a processing step, and edges define the data flow between nodes.

## Architecture

### Core Components

- **Flow**: The main container that holds nodes and edges
- **Node**: Individual processing units with input/output capabilities
- **Edge**: Connections between nodes defining data flow
- **Result**: Typed results for success, error, and cancellation states

### Node Types

- **Input**: Entry point nodes that receive initial data
- **Process**: Processing nodes that transform data
- **Output**: Final nodes that produce the end result
- **Conditional**: Nodes that route flow based on conditions
- **Multiplex**: Nodes that split input into multiple parallel outputs
- **Merge**: Nodes that combine multiple inputs into a single output

## New Advanced Features

### 1. Zip Node

The zip node allows you to combine multiple files into a single archive:

```typescript
import { createZipNode } from "./nodes/zip-node";

const zipNode = createZipNode("zip-files", {
  zipName: "archive.zip",
  includeMetadata: true,
});
```

**Features:**

- Combines multiple input files into a single zip archive
- Supports both single files and file batches
- Optional metadata inclusion
- Customizable archive name

### 2. Conditional Node

The conditional node routes flow based on file properties:

```typescript
import { createConditionalNode } from "./nodes/conditional-node";

const conditionalNode = createConditionalNode("size-check", {
  field: "size",
  operator: "greaterThan",
  value: 1024 * 1024, // 1MB
  trueBranch: "large-file-processor",
  falseBranch: "small-file-processor",
});
```

**Supported Conditions:**

- **Fields**: `mimeType`, `size`, `width`, `height`, `extension`
- **Operators**: `equals`, `notEquals`, `greaterThan`, `lessThan`, `contains`, `startsWith`

### 3. Multiplex Node

The multiplex node splits a single input into multiple parallel outputs:

```typescript
import { createMultiplexNode } from "./nodes/multiplex-node";

const multiplexNode = createMultiplexNode("multiplex", {
  outputCount: 3,
  strategy: "copy", // or "split"
});
```

**Strategies:**

- **Copy**: Creates multiple copies of the same file
- **Split**: Splits the file into chunks

### 4. Merge Node

The merge node combines multiple inputs into a single output:

```typescript
import { createMergeNode } from "./nodes/merge-node";

const mergeNode = createMergeNode("merge-files", {
  strategy: "batch", // or "concat"
});
```

**Strategies:**

- **Batch**: Returns files as a batch
- **Concat**: Concatenates all files into one

## Usage

### Basic Example

```typescript
import type { FlowNode } from "./node";

import { createFlow } from "./flow";
import { NodeType } from "./node";
import { successResult } from "./result";

// Define your data type
type MyData = {
  value: number;
  processed: boolean;
};

// Create nodes
const inputNode: FlowNode<MyData, MyData> = {
  id: "input",
  name: "Input",
  description: "Input node",
  type: NodeType.input,
  run: async ({ data }) => {
    return successResult(data);
  },
};

const processNode: FlowNode<MyData, MyData> = {
  id: "process",
  name: "Process",
  description: "Process node",
  type: NodeType.process,
  run: async ({ data }) => {
    return successResult({
      ...data,
      value: data.value * 2,
      processed: true,
    });
  },
};

const outputNode: FlowNode<MyData, MyData> = {
  id: "output",
  name: "Output",
  description: "Output node",
  type: NodeType.output,
  run: async ({ data }) => {
    return successResult(data);
  },
};

// Create the flow
const flow = createFlow({
  flowId: "simple-flow",
  nodes: [inputNode, processNode, outputNode],
  edges: [
    { source: "input", target: "process" },
    { source: "process", target: "output" },
  ],
});

// Run the flow
const result = await flow.run({
  value: 5,
  processed: false,
});

if (result.type === "success") {
  console.log("Result:", result.value);
  // Output: { value: 10, processed: true }
}
```

### Error Handling

The flow engine provides comprehensive error handling:

```typescript
const errorNode: FlowNode<MyData, MyData> = {
  id: "error",
  name: "Error Node",
  type: NodeType.process,
  run: async () => {
    throw new Error("Something went wrong");
  },
};

const flow = createFlow({
  nodes: [inputNode, errorNode],
  edges: [{ source: "input", target: "error" }],
});

const result = await flow.run(inputData);

if (result.type === "error") {
  console.error("Flow failed:", result.error);
}
```

### Cancellation

Flows can be cancelled during execution:

```typescript
const longRunningNode: FlowNode<MyData, MyData> = {
  id: "long-running",
  name: "Long Running",
  type: NodeType.process,
  run: async ({ runId }) => {
    // Simulate long-running task
    await new Promise(resolve => setTimeout(resolve, 5000));
    return successResult(data);
  },
  cancel: (runId) => {
    // Handle cancellation
    console.log(`Cancelling node ${runId}`);
  },
};

const flow = createFlow({
  nodes: [inputNode, longRunningNode],
  edges: [{ source: "input", target: "long-running" }],
});

// Start the flow
const promise = flow.run(inputData);

// Cancel after 1 second
setTimeout(() => {
  flow.cancel?.(runId);
}, 1000);

const result = await promise;
if (result.type === "cancelled") {
  console.log("Flow was cancelled");
}
```

## Features

### Topological Sorting

The engine automatically determines the correct execution order using topological sorting, ensuring nodes are executed in the right sequence based on their dependencies.

### Cycle Detection

The engine detects cycles in the flow graph and returns an error if any are found.

### Type Safety

Full TypeScript support with generic types for input and output data.

### Async Support

All nodes support asynchronous operations and proper error propagation.

### Cancellation Support

Nodes can implement cancellation logic to handle graceful shutdowns.

## Advanced Usage

### Multiple Inputs

For nodes with multiple incoming edges, you can implement custom logic to merge inputs:

```typescript
const mergeNode: FlowNode<MyData[], MyData> = {
  id: "merge",
  name: "Merge",
  type: NodeType.process,
  run: async ({ data }) => {
    // Merge multiple inputs
    const merged = data.reduce((acc, item) => ({
      value: acc.value + item.value,
      processed: acc.processed && item.processed,
    }));
    return successResult(merged);
  },
};
```

### Conditional Execution

You can implement conditional logic in nodes:

```typescript
const conditionalNode: FlowNode<MyData, MyData> = {
  id: "conditional",
  name: "Conditional",
  type: NodeType.process,
  run: async ({ data }) => {
    if (data.value > 10) {
      return successResult({ ...data, processed: true });
    }
    else {
      return successResult({ ...data, processed: false });
    }
  },
};
```

## Best Practices

1. **Use descriptive node names**: Make your nodes easy to understand and debug
2. **Handle errors gracefully**: Always return proper error results from nodes
3. **Keep nodes focused**: Each node should have a single responsibility
4. **Test your flows**: Create unit tests for individual nodes and integration tests for flows
5. **Monitor performance**: Use the runId and flowId for logging and monitoring

## API Reference

### Flow

```typescript
type Flow<Input, Output> = {
  nodes: FlowNode<Input, Output>[];
  edges: FlowEdge[];
  run: (input?: Input) => Promise<FlowResult<Output>>;
  cancel?: (runId: string) => void;
};
```

### FlowNode

```typescript
type FlowNode<Input, Output> = {
  id: string;
  name: string;
  type: NodeType;
  run: (args: {
    data: Input;
    runId: string;
    flowId: string;
  }) => Promise<FlowResult<Output>>;
  cancel?: (runId: string) => void;
};
```

### FlowResult

```typescript
type FlowResult<Value>
  = | { type: "success"; value: Value }
    | { type: "error"; error: string }
    | { type: "cancelled" };
```
