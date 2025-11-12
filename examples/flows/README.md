# @uploadista/example-flows

Example flow definitions for Uploadista SDK server examples.

## Overview

This package provides a comprehensive library of example flows demonstrating the capabilities of the Uploadista Flow Engine. It includes 20 pre-configured flows spanning image processing, video processing, utility operations, and complex multi-stage pipelines.

**Purpose:**
- Single source of truth for example flow definitions
- Demonstrate all major node types available in the SDK
- Provide reusable flows for server examples
- Reduce code duplication across server implementations
- Improve developer onboarding with diverse use cases

## Installation

This package is part of the Uploadista SDK workspace and is used internally by server examples.

```bash
# In your server example package.json
{
  "dependencies": {
    "@uploadista/example-flows": "workspace:*"
  }
}
```

## Quick Start

### Direct Import Pattern

Import specific flows directly for better TypeScript types and tree-shaking:

```typescript
import { optimizeFlow, resizeFlow } from '@uploadista/example-flows';
import { executeFlow } from '@uploadista/server';

// Execute a specific flow
const result = await executeFlow(optimizeFlow, imageFile, storage);
console.log(result); // Success result with optimized image
```

### Registry Pattern

Use the registry function for dynamic flow selection by ID (useful for HTTP APIs):

```typescript
import { getFlow } from '@uploadista/example-flows';
import { executeFlow } from '@uploadista/server';

// Get flow by ID (e.g., from URL parameter)
const flow = getFlow('optimize-flow');
const result = await executeFlow(flow, imageFile, storage);
```

## Available Flows

### Basic Image Flows (4 flows)

| Flow ID | Export | Description |
|---------|--------|-------------|
| `simple-flow` | `simpleFlow` | Minimal input → output flow (baseline example) |
| `optimize-flow` | `optimizeFlow` | Compress and convert images to WebP |
| `resize-flow` | `resizeFlow` | Resize images to 800x600 cover |
| `transform-flow` | `transformFlow` | Apply transformations (rotate, flip) |

**Example:**
```typescript
import { optimizeFlow } from '@uploadista/example-flows';

// Optimize uploaded image to WebP quality 80
const result = await executeFlow(optimizeFlow, imageFile, storage);
```

### Advanced Image Flows (2 flows)

| Flow ID | Export | Description |
|---------|--------|-------------|
| `describe-image-flow` | `describeImageFlow` | AI-powered image description |
| `remove-background-flow` | `removeBackgroundFlow` | Background removal using AI |

**Note:** These flows require AI service credentials (OpenAI, Replicate, etc.) to be configured in your server.

**Example:**
```typescript
import { describeImageFlow } from '@uploadista/example-flows';

// Generate AI description of image content
const result = await executeFlow(describeImageFlow, imageFile, storage);
console.log(result.metadata.description); // "A sunset over mountains with orange sky"
```

### Video Flows (5 flows)

| Flow ID | Export | Description |
|---------|--------|-------------|
| `transcode-video-flow` | `transcodeVideoFlow` | Convert to WebM VP9 format |
| `trim-video-flow` | `trimVideoFlow` | Extract 5-30 second clip |
| `thumbnail-flow` | `thumbnailFlow` | Extract JPEG frame at 10 seconds |
| `resize-video-flow` | `resizeVideoFlow` | Resize to 1280x720 (720p) |
| `describe-video-flow` | `describeVideoFlow` | AI-powered video description |

**Example:**
```typescript
import { transcodeVideoFlow } from '@uploadista/example-flows';

// Convert video to web-friendly WebM format
const result = await executeFlow(transcodeVideoFlow, videoFile, storage);
```

### Utility Flows (4 flows)

| Flow ID | Export | Description |
|---------|--------|-------------|
| `conditional-flow` | `conditionalFlow` | Route based on file size (>1MB) |
| `merge-flow` | `mergeFlow` | Combine multiple inputs into single stream |
| `multiplex-flow` | `multiplexFlow` | Split single input into parallel paths |
| `zip-flow` | `zipFlow` | Archive multiple files into ZIP |

**Example:**
```typescript
import { conditionalFlow } from '@uploadista/example-flows';

// Route large files to different output than small files
const result = await executeFlow(conditionalFlow, file, storage);
```

### Complex Multi-Stage Flows (4 flows)

| Flow ID | Export | Description |
|---------|--------|-------------|
| `image-pipeline-flow` | `imagePipelineFlow` | Resize → Optimize → Describe pipeline |
| `video-pipeline-flow` | `videoPipelineFlow` | Trim → Transcode → Thumbnail pipeline |
| `conditional-image-flow` | `conditionalImageFlow` | Size-based branching with processing |
| `multi-format-flow` | `multiFormatFlow` | Generate WebP, JPEG, PNG and ZIP them |

**Example:**
```typescript
import { imagePipelineFlow } from '@uploadista/example-flows';

// Complete image processing: resize + optimize + AI description
const result = await executeFlow(imagePipelineFlow, rawImage, storage);
```

## Usage Patterns

### Server Integration

Replace your custom flow definitions with imports from this library:

```typescript
// Before
import { createFlow, createInputNode, createStorageNode } from '@uploadista/core';
import { createOptimizeNode } from '@uploadista/flow-images-nodes';

export const optimizeFlow = createFlow({
  flowId: 'optimize-flow',
  // ... full flow definition
});

// After
import { getFlow } from '@uploadista/example-flows';

// Use directly in route handlers
app.post('/upload/:flowId', async (req, res) => {
  const flow = getFlow(req.params.flowId);
  const result = await executeFlow(flow, req.file, storage);
  res.json(result);
});
```

### List All Available Flows

```typescript
import { getAllFlowIds } from '@uploadista/example-flows';

const flowIds = getAllFlowIds();
console.log(flowIds); // ['simple-flow', 'optimize-flow', 'resize-flow', ...]

// Use in an API endpoint to list available flows
app.get('/flows', (req, res) => {
  res.json({ flows: getAllFlowIds() });
});
```

### Type-Safe Flow IDs

The package exports a `FlowId` type for type-safe flow ID handling:

```typescript
import { getFlow, type FlowId } from '@uploadista/example-flows';

function processUpload(flowId: FlowId, file: File) {
  const flow = getFlow(flowId);
  return executeFlow(flow, file, storage);
}

// TypeScript will ensure flowId is valid
processUpload('optimize-flow', file); // ✓ OK
processUpload('invalid-flow', file);  // ✗ TypeScript error
```

## Customizing Flows

These flows are examples with sensible defaults. For production use, you may want to customize them:

### Option 1: Modify Flow Constants

```typescript
import { optimizeFlow } from '@uploadista/example-flows';

// Clone and modify the flow
const customOptimizeFlow = {
  ...optimizeFlow,
  nodes: {
    ...optimizeFlow.nodes,
    optimize: createOptimizeNode('optimize', {
      quality: 90, // Higher quality
      format: 'jpeg', // Different format
    }),
  },
};
```

### Option 2: Create Custom Flows

Use these examples as templates for your own flows:

```typescript
import { createFlow, createInputNode, createStorageNode } from '@uploadista/core';
import { createResizeNode, createOptimizeNode } from '@uploadista/flow-images-nodes';

// Create a custom flow based on the example patterns
export const customFlow = createFlow({
  flowId: 'custom-flow',
  name: 'Custom Flow',
  nodes: {
    input: createInputNode('input'),
    resize: createResizeNode('resize', {
      width: 1920,
      height: 1080,
      fit: 'cover',
    }),
    optimize: createOptimizeNode('optimize', {
      quality: 95,
      format: 'webp',
    }),
    output: createStorageNode('output'),
  },
  edges: [
    { source: 'input', target: 'resize' },
    { source: 'resize', target: 'optimize' },
    { source: 'optimize', target: 'output' },
  ],
});
```

## Node Configuration Options

Each flow uses specific node types with configuration options. For detailed documentation on node configuration, refer to the respective node package documentation:

### Image Nodes
- **@uploadista/flow-images-nodes** - `createOptimizeNode`, `createResizeNode`, `createTransformImageNode`, `createDescribeImageNode`, `createRemoveBackgroundNode`

### Video Nodes
- **@uploadista/flow-videos-nodes** - `createTranscodeVideoNode`, `createTrimVideoNode`, `createVideoThumbnailNode`, `createVideoResizeNode`, `createDescribeVideoNode`

### Utility Nodes
- **@uploadista/flow-utility-nodes** - `createConditionalNode`, `createMergeNode`, `createMultiplexNode`, `createZipNode`

## Flow Execution Requirements

Different flows have different requirements:

### Basic Flows
- **Input/Output nodes:** Require storage configuration (S3, Azure, GCS, filesystem)
- **No external dependencies** for basic image/video processing

### AI-Powered Flows
- **Describe Image/Video:** Requires AI service credentials (OpenAI, Replicate)
- **Remove Background:** Requires background removal service credentials

Configure these in your server's environment variables or configuration file.

## Examples

### Example 1: Express Server

```typescript
import express from 'express';
import multer from 'multer';
import { getFlow } from '@uploadista/example-flows';
import { executeFlow } from '@uploadista/server';

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.post('/upload/:flowId', upload.single('file'), async (req, res) => {
  try {
    const flow = getFlow(req.params.flowId);
    const result = await executeFlow(flow, req.file, storage);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3000);
```

### Example 2: Hono Server (Cloudflare Workers)

```typescript
import { Hono } from 'hono';
import { getFlow } from '@uploadista/example-flows';
import { executeFlow } from '@uploadista/server';

const app = new Hono();

app.post('/upload/:flowId', async (c) => {
  const flowId = c.req.param('flowId');
  const formData = await c.req.formData();
  const file = formData.get('file');

  const flow = getFlow(flowId);
  const result = await executeFlow(flow, file, storage);

  return c.json({ success: true, result });
});

export default app;
```

### Example 3: Fastify Server

```typescript
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import { getFlow } from '@uploadista/example-flows';
import { executeFlow } from '@uploadista/server';

const fastify = Fastify();
await fastify.register(multipart);

fastify.post('/upload/:flowId', async (request, reply) => {
  const data = await request.file();
  const flowId = request.params.flowId;

  const flow = getFlow(flowId);
  const result = await executeFlow(flow, data, storage);

  return { success: true, result };
});

await fastify.listen({ port: 3000 });
```

## Architecture

### Flow Structure

All flows follow the Uploadista Flow Engine architecture:

```
Flow
├── flowId: string          (unique identifier)
├── name: string            (human-readable name)
├── nodes: Record<id, Node> (processing units)
└── edges: Edge[]           (connections between nodes)
```

### Node Types

- **Input Node:** Entry point for files
- **Processing Nodes:** Transform data (resize, optimize, transcode, etc.)
- **Utility Nodes:** Control flow (conditional, merge, multiplex, zip)
- **Storage Node:** Output destination

### Flow Patterns

1. **Linear:** input → process → output
2. **Branching:** input → conditional → [path A, path B] → outputs
3. **Merging:** [input A, input B] → merge → output
4. **Parallel:** input → multiplex → [process A, process B, process C] → outputs
5. **Pipeline:** input → process1 → process2 → process3 → output

## Troubleshooting

### Flow Not Found

**Problem:** `getFlow()` returns `simpleFlow` for unknown flow ID

**Solution:**
- Check the flow ID spelling
- Use `getAllFlowIds()` to see available flows
- Ensure you're using the correct flow ID format (kebab-case)

### TypeScript Errors

**Problem:** Import errors or type mismatches

**Solution:**
- Ensure workspace dependencies are installed: `pnpm install`
- Build the package: `cd examples/flows && pnpm build`
- Restart TypeScript server in your editor

### Node Package Not Found

**Problem:** `Cannot find module '@uploadista/flow-images-nodes'`

**Solution:**
- Install workspace dependencies: `pnpm install`
- Build all packages: `turbo run build`
- Check that node packages are in your package.json

### AI Nodes Failing

**Problem:** `describe-image-flow` or `remove-background-flow` fails

**Solution:**
- Configure AI service credentials in your server environment
- Check that you have API keys for OpenAI, Replicate, or other AI services
- Verify your account has sufficient credits/quota

## Contributing

To add new example flows:

1. Create flow definition in appropriate file (`basic-image-flows.ts`, etc.)
2. Add JSDoc documentation with usage examples
3. Export from `src/index.ts`
4. Add to registry in `src/registry.ts`
5. Update flow ID type union in `src/registry.ts`
6. Update this README with new flow documentation
7. Update server examples to use new flow

## License

MIT

## Related Packages

- **@uploadista/core** - Flow engine and core types
- **@uploadista/flow-images-nodes** - Image processing nodes
- **@uploadista/flow-videos-nodes** - Video processing nodes
- **@uploadista/flow-utility-nodes** - Utility nodes (conditional, merge, etc.)
- **@uploadista/server** - Server runtime for flow execution
