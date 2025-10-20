# Unified Adapter

The Unified Adapter combines the functionality of both the Upload Server and Flow Server into a single, cohesive API. This approach treats **every upload as a simple flow** using the streaming input node, providing a consistent interface for both simple uploads and complex processing pipelines.

## Core Concept

Instead of having separate upload and flow servers, the unified adapter:

1. **Converts uploads to flows** - Simple uploads become flows with a streaming input node
2. **Unifies job tracking** - Both uploads and flows use the same job system
3. **Provides consistent events** - WebSocket events work the same for uploads and flows
4. **Simplifies the API** - Single adapter handles both use cases

## Architecture

```
Upload Request → Unified Server → Flow with Streaming Input Node → Job Tracking
Custom Flow   → Unified Server → Flow Execution             → Job Tracking
                     ↓
                WebSocket Events (unified)
```

## API Routes

### Upload Operations (converted to flows internally)

```typescript
// Create upload (starts a flow with streaming input node)
POST /api/upload
{
  "storageId": "default",
  "fileName": "photo.jpg",
  "type": "image/jpeg", 
  "size": 1024000
}

// Upload chunk (continues flow execution)
PATCH /api/upload/:uploadId
[binary data]

// Get upload status (delegates to job status)
GET /api/upload/:uploadId
```

### Flow Operations

```typescript
// Execute custom flow
POST /api/flow/:flowId/:storageId
{
  "inputs": { ... }
}

// Get flow metadata
GET /api/flow/:flowId
```

### Unified Job Tracking

```typescript
// Get job status (works for both uploads and flows)
GET /api/jobs/:jobId/status
```

### WebSocket Events

```typescript
// Real-time events for both uploads and flows
WS /ws/unified
```

## Usage Examples

### Simple Upload

```typescript
import { createHonoUnifiedAdapter } from '@uploadista/servers/adapters-hono';

const adapter = await createHonoUnifiedAdapter({
  flowProvider,
  flowEventEmitter,
  uploadEventEmitter,
  dataStore,
  kvStore,
});

// Set up routes
app.post('/api/upload', adapter.handler);
app.patch('/api/upload/:id', adapter.handler);
app.get('/api/upload/:id', adapter.handler);
```

### Custom Flow Integration

```typescript
const flowProvider = Layer.succeed({
  getFlow: (flowId: string) => {
    switch (flowId) {
      case 'image-resize':
        return createImageResizeFlow();
      case 'document-process': 
        return createDocumentProcessingFlow();
      default:
        throw new Error(\`Flow \${flowId} not found\`);
    }
  },
});

const adapter = await createHonoUnifiedAdapter({
  flowProvider,
  // ... other options
});
```

### WebSocket Events

```typescript
const ws = new WebSocket('ws://localhost:3000/ws/unified');

// Subscribe to job events
ws.send(JSON.stringify({
  type: 'subscribe',
  jobId: 'job-123'
}));

// Receive updates for both uploads and flows
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data.type, data);
};
```

## Benefits

### 1. Unified Interface
- Single adapter for all upload and flow operations
- Consistent API patterns across different use cases
- Simplified client integration

### 2. Consistent Job Tracking
- Same job status format for uploads and flows
- Unified progress tracking and error handling
- Single WebSocket endpoint for all events

### 3. Seamless Upgrades
- Start with simple uploads
- Gradually add custom processing flows
- No API changes required for clients

### 4. Better Composability  
- Uploads can be enhanced into complex flows
- Reuse existing flow nodes and processing logic
- Effect-based dependency injection throughout

## Implementation Details

### Upload-to-Flow Conversion

When an upload is created:

1. A unique flow ID is generated (`upload-flow-{uploadId}`)
2. A flow is created with a streaming input node
3. The flow is executed with init operation
4. Chunks are sent as additional flow operations
5. Job tracking maps upload IDs to flow job IDs

### Streaming Input Node Integration

The streaming input node provides the bridge between uploads and flows:

```typescript
// Init operation (create upload)
{
  operation: "init",
  storageId: "default",
  metadata: { originalName: "file.jpg" }
}

// Chunk operation (upload data)
{
  operation: "chunk", 
  uploadId: "upload-123",
  chunk: ReadableStream
}

// Finalize operation (complete upload)
{
  operation: "finalize",
  uploadId: "upload-123"
}
```

### Effect Layer Composition

The unified server composes layers from both upload and flow servers:

```typescript
const unifiedServerLayers = Layer.mergeAll(
  uploadServerLayer,
  flowServerLayer, 
  flowJobKVStoreLayer,
  uploadDataStoreLayer,
  generateId,
);
```

## Migration Guide

### From Separate Adapters

If you're currently using separate upload and flow adapters:

1. Replace both adapters with the unified adapter
2. Update route handlers to use the unified handler
3. Update WebSocket connections to use the unified endpoint
4. No changes needed for client upload/flow logic

### Configuration Changes

```typescript
// Before: Separate adapters
const uploadAdapter = await createHonoUploadAdapter({ ... });
const flowAdapter = await createHonoFlowAdapter({ ... });

// After: Unified adapter  
const unifiedAdapter = await createHonoUnifiedAdapter({
  // Upload config
  uploadEventEmitter,
  dataStore,
  
  // Flow config
  flowProvider,
  flowEventEmitter,
  
  // Shared config
  kvStore,
});
```

## Advanced Usage

### Custom Upload Flows

You can create custom upload flows by defining flows with streaming input nodes:

```typescript
const customUploadFlow = createFlow({
  flowId: 'custom-upload',
  nodes: [
    inputNodeId,
    imageOptimizationNode,
    virusScanNode, 
    storageOutputNode,
  ],
  edges: [...],
});
```

### Flow Templates

Create reusable flow templates for common upload scenarios:

```typescript
const imageUploadTemplate = (uploadId: string) => createFlow({
  flowId: \`image-upload-\${uploadId}\`,
  nodes: [
    createInputNode(uploadId),
    createImageResizeNode(['thumbnail', 'medium', 'large']),
    createStorageOutputNode(),
  ],
  // ...
});
```

## See Also

- [Quick Start Example](./examples/quick-start.ts)
- [Comprehensive Example](./examples/unified-adapter-example.ts)
- [Streaming Input Node Documentation](../../flow/input-nodes/README.md)
- [Flow Server Documentation](../../core/src/flow/README.md)