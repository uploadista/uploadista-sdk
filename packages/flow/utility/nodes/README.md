# @uploadista/flow-utility-nodes

Flow utility nodes for Uploadista. Provides conditional routing, merging, multiplexing, and data transformation operations in upload pipelines.

## Overview

Utility nodes enable complex flow logic without custom code:

- **Conditional Node**: Route uploads based on file properties
- **Merge Node**: Combine multiple inputs into one
- **Multiplex Node**: Split single input across multiple outputs
- **Zip Node**: Archive multiple files together

Perfect for building sophisticated upload workflows.

## Installation

```bash
npm install @uploadista/flow-utility-nodes
# or
pnpm add @uploadista/flow-utility-nodes
```

## Quick Start

```typescript
import { conditionalNode, mergeNode, multiplexNode, zipNode } from "@uploadista/flow-utility-nodes";
import { Effect } from "effect";

// Route based on file properties
const flow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "router",
      type: "conditional",
      params: {
        field: "mimeType",
        operator: "contains",
        value: "image",
      },
    },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "router" },
    { from: "router", to: "output" },
  ],
};
```

## Features

- ✅ **Conditional Routing**: Route based on file properties
- ✅ **Data Merging**: Combine multiple streams
- ✅ **Multiplexing**: Split to multiple outputs
- ✅ **Type Safe**: Full TypeScript support
- ✅ **No Custom Code**: Visual flow building

## Node Types

### Conditional Node

Route inputs based on file properties.

**Parameters**:
```typescript
{
  field: "mimeType" | "size" | "width" | "height" | "extension",
  operator: "equals" | "notEquals" | "greaterThan" | "lessThan" | "contains" | "startsWith",
  value: string | number
}
```

**Example**: Route images to resize, documents to compress
```typescript
{
  type: "conditional",
  params: {
    field: "mimeType",
    operator: "contains",
    value: "image",
  },
}
```

### Merge Node

Combine multiple inputs into batch.

**Parameters**:
```typescript
{
  strategy: "concat" | "batch",
  separator?: string,
  inputCount: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
}
```

**Example**: Batch 5 uploads before processing
```typescript
{
  type: "merge",
  params: {
    strategy: "batch",
    inputCount: 5,
  },
}
```

### Multiplex Node

Split input to multiple independent paths.

**Parameters**:
```typescript
{
  outputCount: 2 | 3 | 4 | 5
}
```

**Example**: Send to S3 and archive simultaneously
```typescript
{
  type: "multiplex",
  params: {
    outputCount: 2,
  },
}
```

### Zip Node

Archive multiple files (see `@uploadista/flow-utility-zipjs`).

## Use Cases

### Case 1: Smart Routing

```
Input → Conditional
        ├─ Image → Resize
        ├─ PDF → Compress
        └─ Document → Archive
        → Output
```

### Case 2: Batch Processing

```
Input 1 ┐
Input 2 ├─ Merge (batch 3) → Process → Output
Input 3 ┘
```

### Case 3: Multi-Destination

```
Input → Multiplex ├─ Store to S3
                  ├─ Archive to GCS
                  └─ Notify Webhook
```

## API Reference

All nodes exported from main entry point.

```typescript
import {
  conditionalNode,
  mergeNode,
  multiplexNode,
  zipNode,
} from "@uploadista/flow-utility-nodes";
```

## Examples

### Example 1: Image/Document Routing

```typescript
const flow = {
  nodes: [
    { id: "input", type: "input" },
    {
      id: "router",
      type: "conditional",
      params: {
        field: "mimeType",
        operator: "contains",
        value: "image",
      },
    },
    { id: "resize", type: "resize", params: { width: 800 } },
    { id: "s3", type: "s3", params: { bucket: "images" } },
    { id: "pdf-store", type: "s3", params: { bucket: "documents" } },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "router" },
    { from: "router", true: "resize", false: "pdf-store" },
    { from: "resize", to: "s3" },
    { from: "s3", to: "output" },
    { from: "pdf-store", to: "output" },
  ],
};
```

### Example 2: Batch Processing

```typescript
const batchFlow = {
  nodes: [
    { id: "input1", type: "input" },
    { id: "input2", type: "input" },
    { id: "input3", type: "input" },
    {
      id: "merge",
      type: "merge",
      params: { strategy: "batch", inputCount: 3 },
    },
    { id: "process", type: "custom", params: {} },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input1", to: "merge" },
    { from: "input2", to: "merge" },
    { from: "input3", to: "merge" },
    { from: "merge", to: "process" },
    { from: "process", to: "output" },
  ],
};
```

### Example 3: Multi-Path Distribution

```typescript
const multiPath = {
  nodes: [
    { id: "input", type: "input" },
    { id: "split", type: "multiplex", params: { outputCount: 3 } },
    { id: "s3", type: "s3", params: { bucket: "primary" } },
    { id: "gcs", type: "gcs", params: { bucket: "backup" } },
    { id: "archive", type: "zip", params: {} },
    { id: "output", type: "output" },
  ],
  edges: [
    { from: "input", to: "split" },
    { from: "split", index: 0, to: "s3" },
    { from: "split", index: 1, to: "gcs" },
    { from: "split", index: 2, to: "archive" },
    { from: "s3", to: "output" },
    { from: "gcs", to: "output" },
    { from: "archive", to: "output" },
  ],
};
```

## Configuration

Nodes configured via `params` object in flow definition:

```typescript
{
  id: "node-id",
  type: "conditional",
  params: {
    field: "mimeType",
    operator: "contains",
    value: "image",
  },
}
```

## Related Packages

- [@uploadista/core](../../core) - Core flow types
- [@uploadista/flow-utility-zipjs](../zipjs) - Archive node
- [@uploadista/flow-images-nodes](../images/nodes) - Image utilities
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [FLOW_NODES.md](../FLOW_NODES.md) - Complete node gallery
- [Server Setup Guide](../../../SERVER_SETUP.md) - Flow integration
