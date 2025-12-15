# @uploadista/flow-utility-nodes

Flow utility nodes for Uploadista. Provides conditional routing, merging, multiplexing, and data transformation operations in upload pipelines.

## Overview

Utility nodes enable complex flow logic without custom code:

- **Conditional Node**: Route uploads based on file properties
- **Merge Node**: Combine multiple inputs into one
- **Multiplex Node**: Split single input across multiple outputs
- **Zip Node**: Archive multiple files together

## Installation

```bash
npm install @uploadista/flow-utility-nodes
# or
pnpm add @uploadista/flow-utility-nodes
```

## Quick Start

```typescript
import {
  createConditionalNode,
  createMergeNode,
  createMultiplexNode,
  createZipNode,
} from "@uploadista/flow-utility-nodes";
```

## Node Types

### Conditional Node

Routes inputs based on file properties.

```typescript
import { createConditionalNode } from "@uploadista/flow-utility-nodes";

// Route images > 1MB to compression
const sizeRouter = createConditionalNode("size-router", {
  field: "size",
  operator: "greaterThan",
  value: 1024 * 1024, // 1MB
});

// Route by MIME type
const mimeRouter = createConditionalNode("mime-router", {
  field: "mimeType",
  operator: "contains",
  value: "image",
});
```

#### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `field` | `"mimeType" \| "size" \| "width" \| "height" \| "extension"` | Yes | File property to evaluate |
| `operator` | `"equals" \| "notEquals" \| "greaterThan" \| "lessThan" \| "contains" \| "startsWith"` | Yes | Comparison operator |
| `value` | `string \| number` | Yes | Value to compare against |

### Merge Node

Combine multiple inputs into batch.

```typescript
import { createMergeNode } from "@uploadista/flow-utility-nodes";

// Concatenate 3 files into one
const mergeNode = createMergeNode("file-merger", {
  strategy: "concat",
  inputCount: 3,
});

// Batch 5 uploads before processing
const batchNode = createMergeNode("batch-collector", {
  strategy: "batch",
  inputCount: 5,
  separator: "\n",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `strategy` | `"concat" \| "batch"` | No | `"batch"` | Merge strategy |
| `inputCount` | `number` (2-10) | No | `2` | Number of inputs to wait for |
| `separator` | `string` | No | `"\n"` | Separator for concat strategy |

### Multiplex Node

Split input to multiple independent paths.

```typescript
import { createMultiplexNode } from "@uploadista/flow-utility-nodes";

// Send to 3 different destinations
const multiplexNode = createMultiplexNode("multi-output", {
  outputCount: 3,
  strategy: "copy",
});

// Duplicate to 2 storage backends
const backupNode = createMultiplexNode("backup-splitter", {
  outputCount: 2,
  strategy: "copy",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `outputCount` | `number` (1-10) | Yes | - | Number of output copies |
| `strategy` | `"copy" \| "split"` | No | `"copy"` | `copy` duplicates the file, `split` divides it |

### Zip Node

Archive multiple files into a ZIP.

```typescript
import { createZipNode } from "@uploadista/flow-utility-nodes";

// Archive multiple files with metadata
const zipNode = createZipNode("archiver", {
  zipName: "backup.zip",
  includeMetadata: true,
  inputCount: 5,
});

// Simple archive
const simpleZip = createZipNode("simple-archive", {
  zipName: "files.zip",
});
```

#### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `zipName` | `string` | No | `"archive.zip"` | Output ZIP filename |
| `includeMetadata` | `boolean` | No | `false` | Include file metadata in archive |
| `inputCount` | `number` (2-10) | No | `2` | Number of files to archive |

## Use Cases

### Case 1: Smart Routing

```
Input -> Conditional
         |-- Image -> Resize
         |-- PDF -> Compress
         +-- Document -> Archive
         -> Output
```

### Case 2: Batch Processing

```
Input 1 -+
Input 2 -+-- Merge (batch 3) -> Process -> Output
Input 3 -+
```

### Case 3: Multi-Destination

```
Input -> Multiplex -+-- Store to S3
                    +-- Archive to GCS
                    +-- Notify Webhook
```

## Related Packages

- [@uploadista/core](../../core) - Core flow types
- [@uploadista/flow-image-nodes](../images/nodes) - Image utilities
- [@uploadista/server](../../servers/server) - Upload server

## License

See [LICENSE](../../../LICENSE) in the main repository.
