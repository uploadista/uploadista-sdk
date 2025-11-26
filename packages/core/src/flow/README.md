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

### 5. Preserving Intermediate Outputs with keepOutput

By default, the flow engine uses topology-based output detection: only nodes with no outgoing edges (sink nodes) have their outputs preserved. Intermediate nodes (those with outgoing edges) have their outputs automatically cleaned up after flow completion to save storage.

However, there are common use cases where you need to preserve both intermediate and final outputs:

**Use Case: Invoice OCR**
```typescript
// Problem: Input has an outgoing edge, so it gets deleted
input → ocr
// Solution: Mark input with keepOutput: true
```

**Use Case: Multi-Format Image Processing**
```typescript
// Problem: Resize is intermediate, gets deleted
                    → optimize-webp
input → resize →
                    → optimize-jpeg
// Solution: Mark resize with keepOutput: true
```

#### How to Use keepOutput

Add the `keepOutput: true` flag when creating nodes:

```typescript
import { createFlowNode } from "./node";
import { createInputNode } from "./nodes/input-node";

// Example: Invoice processing - keep both original and OCR result
const inputNode = createInputNode("upload-invoice", {
  keepOutput: true, // ← Preserve the uploaded file
});

const ocrNode = createOCRNode("extract-text");
// OCR is a sink (no outgoing edges), so it's automatically preserved

const flow = createFlow({
  nodes: [inputNode, ocrNode],
  edges: [{ source: "upload-invoice", target: "extract-text" }],
});

// Result: Both the uploaded PDF and the extracted text are available
```

#### When to Use keepOutput

✅ **Use keepOutput when:**
- You need the original file for auditing (e.g., invoice uploads with OCR)
- Multi-format outputs require intermediate versions (e.g., resize before multiple optimizations)
- Debugging or troubleshooting requires intermediate processing steps

❌ **Don't use keepOutput when:**
- You only need the final output (use topology-based sinks)
- Storage costs are a concern and intermediate files aren't needed
- The node is a utility node (conditional, multiplex, merge, zip) - these don't support keepOutput

#### keepOutput vs Topology-Based Sinks

The flow engine supports two ways to preserve outputs:

1. **Topology-based (automatic)**: Nodes with no outgoing edges are sinks and outputs are preserved
2. **keepOutput flag (explicit)**: Nodes marked with `keepOutput: true` are preserved regardless of topology

These work together:
- `isSink && !keepOutput` → output preserved (topology)
- `!isSink && keepOutput` → output preserved (explicit flag)
- `isSink && keepOutput` → output preserved (redundant but harmless)
- `!isSink && !keepOutput` → output deleted (intermediate)

#### Best Practices

1. **Be conservative**: Only use `keepOutput` when you truly need intermediate outputs
2. **Consider storage costs**: Each preserved output consumes storage space
3. **Document intent**: Comment why you're using `keepOutput` in your flow definitions
4. **Use topology when possible**: Let the engine detect sinks automatically for cleaner flows

#### Examples

**Example 1: Invoice Processing**
```typescript
// Keep both the uploaded document AND the extracted text
const uploadNode = createInputNode("upload", { keepOutput: true });
const ocrNode = createOCRNode("extract-text");

createFlow({
  nodes: [uploadNode, ocrNode],
  edges: [{ source: "upload", target: "extract-text" }],
});
// Outputs: [uploaded_document.pdf, extracted_text.json]
```

**Example 2: Responsive Images**
```typescript
// Keep original, resized, and all optimized versions
const inputNode = createInputNode("upload", { keepOutput: true });
const resizeNode = createResizeNode("resize", {
  width: 800,
  keepOutput: true, // ← Keep resized version too
});
const webpNode = createOptimizeNode("webp", { format: "webp" });
const jpegNode = createOptimizeNode("jpeg", { format: "jpeg" });

createFlow({
  nodes: [inputNode, resizeNode, webpNode, jpegNode],
  edges: [
    { source: "upload", target: "resize" },
    { source: "resize", target: "webp" },
    { source: "resize", target: "jpeg" },
  ],
});
// Outputs: [original.png, resized.png, optimized.webp, optimized.jpeg]
```

**Example 3: Document Pipeline**
```typescript
// Keep all processing stages for audit trail
const uploadNode = createInputNode("upload", { keepOutput: true });
const extractNode = createExtractTextNode("extract", { keepOutput: true });
const analyzeNode = createAnalyzeNode("analyze");

createFlow({
  nodes: [uploadNode, extractNode, analyzeNode],
  edges: [
    { source: "upload", target: "extract" },
    { source: "extract", target: "analyze" },
  ],
});
// Outputs: [contract.docx, extracted_text.txt, analysis.json]
```

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

### 6. File Naming for Transform Nodes

Transform nodes (nodes that produce new files) support automatic file naming to avoid confusion in multi-output flows. When processing multiple files through a pipeline, automatic naming helps distinguish between original and processed versions.

#### Naming Modes

The flow engine supports three naming modes:

- **None**: Keep the original filename unchanged
- **Auto** (default): Automatically add a suffix based on the operation (e.g., `photo.jpg` → `photo-800x600.jpg`)
- **Custom**: Use a template pattern or custom function

#### Auto Naming

When enabled, each transform node type adds a relevant suffix:

| Node | Auto Suffix | Example |
|------|-------------|---------|
| resize | `${width}x${height}` | `photo-800x600.jpg` |
| optimize | `${format}` | `photo-webp.webp` |
| transform-image | `transformed` | `photo-transformed.jpg` |
| remove-background | `nobg` | `photo-nobg.png` |
| resize-video | `${width}x${height}` | `video-720p.mp4` |
| transcode | `${format}` | `video-mp4.mp4` |
| trim | `trimmed` | `video-trimmed.mp4` |
| thumbnail | `thumb` | `video-thumb.jpg` |
| split-pdf | `page-${pageNumber}` | `doc-page-1.pdf` |
| merge-pdf | `merged` | `docs-merged.pdf` |

#### Usage Example

```typescript
import { createResizeNode } from "@uploadista/flow-image-nodes";

// Default: Auto naming enabled
const resizeNode = yield* createResizeNode("resize", {
  width: 800,
  height: 600,
}, {
  naming: { mode: "auto" }, // Output: "photo-800x600.jpg"
});

// Custom naming with template
const resizeNodeCustom = yield* createResizeNode("resize", {
  width: 800,
  height: 600,
}, {
  naming: {
    mode: "custom",
    pattern: "{{baseName}}-{{nodeType}}-{{width}}w.{{extension}}",
  }, // Output: "photo-resize-800w.jpg"
});

// Custom naming with function
const resizeNodeFn = yield* createResizeNode("resize", {
  width: 800,
  height: 600,
}, {
  naming: {
    mode: "custom",
    rename: (file, ctx) => `processed-${ctx.baseName}.${ctx.extension}`,
  }, // Output: "processed-photo.jpg"
});

// Disable naming
const resizeNodeNone = yield* createResizeNode("resize", {
  width: 800,
  height: 600,
}, {
  naming: { mode: "none" }, // Output: "photo.jpg" (unchanged)
});
```

#### Available Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{baseName}}` | Filename without extension | `photo` |
| `{{extension}}` | File extension | `jpg` |
| `{{fileName}}` | Full filename | `photo.jpg` |
| `{{nodeType}}` | Type of processing node | `resize` |
| `{{nodeId}}` | Node identifier | `resize-1` |
| `{{flowId}}` | Flow identifier | `flow-abc` |
| `{{jobId}}` | Job identifier | `job-123` |
| `{{timestamp}}` | Processing timestamp | `2024-01-15T10:30:00Z` |
| `{{width}}` | Output width (when applicable) | `800` |
| `{{height}}` | Output height (when applicable) | `600` |
| `{{format}}` | Output format (when applicable) | `webp` |
| `{{quality}}` | Quality setting (when applicable) | `80` |
| `{{pageNumber}}` | Page number (for PDF split) | `1` |

#### Metadata-Only Nodes

Nodes that only extract metadata (don't transform file bytes) don't support file naming:
- `describe-image-node` - AI image description
- `describe-document-node` - PDF metadata extraction
- `describe-video-node` - Video metadata extraction
- `extract-text-node` - PDF text extraction
- `ocr-node` - OCR text extraction
- `convert-to-markdown-node` - Markdown extraction to metadata
- `scan-virus-node` - Virus scanning

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
