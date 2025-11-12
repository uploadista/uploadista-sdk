# @uploadista/core

Core engine for the Uploadista platform, providing a powerful and flexible system for file uploads and processing pipelines built with Effect-TS.

## Overview

`@uploadista/core` is the foundation of the Uploadista ecosystem, providing:

- **Flow Engine**: A DAG-based processing pipeline for transforming files through multiple processing steps
- **Upload System**: Robust file upload handling with chunked, resumable, and parallel upload strategies
- **Stream Utilities**: Advanced stream manipulation tools for splitting, combining, and limiting data streams
- **Error Handling**: Comprehensive error types and error management with Effect-TS integration
- **Type Safety**: Full TypeScript support with Zod schema validation throughout

## Installation

```bash
npm install @uploadista/core
# or
pnpm add @uploadista/core
# or
yarn add @uploadista/core
```

## Core Dependencies

- **effect**: For functional effect system and dependency injection
- **zod**: For runtime type validation and schema definition
- **@uploadista/observability**: For tracing and monitoring

## Architecture Overview

### Effect-TS First

`@uploadista/core` is built on Effect-TS, providing:

- **Type-safe effects**: All operations return Effect types for composable, type-safe error handling
- **Dependency injection**: Uses Effect's Context system for managing dependencies
- **Resource management**: Automatic cleanup and resource disposal
- **Observability**: Built-in tracing and logging support

### Core Components

1. **Flow Engine** (`/flow`): DAG-based processing pipeline with nodes and edges
2. **Upload System** (`/upload`): File upload handling with multiple strategies
3. **Streams** (`/streams`): Stream manipulation utilities for data processing
4. **Types** (`/types`): Core type definitions and interfaces
5. **Errors** (`/errors`): Comprehensive error handling system
6. **Utils** (`/utils`): Utility functions for common operations
7. **Logger** (`/logger`): Simple logging utilities
8. **WebSocket** (`/websocket`): Real-time event streaming

## Module Exports

### Main Entry Point (`.`)

```typescript
import {
  // Flow Engine
  createFlow,
  createFlowNode,
  FlowServer,

  // Upload System
  UploadServer,
  createUploadServer,

  // Error Handling
  UploadistaError,
  ERRORS,

  // Types
  type Flow,
  type FlowNode,
  type UploadFile,
  type DataStore,
  type KvStore,
} from "@uploadista/core";
```

### Errors Module (`/errors`)

```typescript
import { UploadistaError, ERRORS } from "@uploadista/core/errors";

// Create error from error code
const error = UploadistaError.fromCode("FLOW_NODE_NOT_FOUND");

// Create error with overrides
const customError = UploadistaError.fromCode("FLOW_NODE_ERROR", {
  body: "Custom error message",
  cause: originalError,
  details: { nodeId: "abc123" }
});

// Convert to Effect
const errorEffect = error.toEffect<void>();
```

**Available Error Codes**:
- Upload errors: `MISSING_OFFSET`, `INVALID_OFFSET`, `ERR_SIZE_EXCEEDED`, `INVALID_LENGTH`
- Flow errors: `FLOW_NODE_NOT_FOUND`, `FLOW_NODE_ERROR`, `FLOW_CYCLE_ERROR`, `FLOW_JOB_NOT_FOUND`
- Storage errors: `DATASTORE_NOT_FOUND`, `FILE_NOT_FOUND`, `STORAGE_NOT_AUTHORIZED`
- Validation errors: `VALIDATION_ERROR`, `FLOW_INPUT_VALIDATION_ERROR`, `FLOW_OUTPUT_VALIDATION_ERROR`

### Types Module (`/types`)

Core type definitions for the system:

```typescript
import type {
  // Storage
  DataStore,
  DataStoreCapabilities,
  DataStoreWriteOptions,

  // KV Store
  KvStore,
  BaseKvStore,

  // Upload
  UploadFile,
  InputFile,
  UploadEvent,

  // Events
  EventEmitter,
  EventBroadcaster,

  // WebSocket
  WebSocketConnection,
  WebSocketMessage,

  // Middleware
  Middleware,
} from "@uploadista/core/types";
```

### Flow Module (`/flow`)

The Flow Engine provides a powerful DAG-based processing system:

```typescript
import {
  createFlow,
  createFlowNode,
  createFlowEdge,
  FlowServer,
  NodeType,
  EventType,
  type Flow,
  type FlowNode,
  type FlowEdge,
  type FlowJob,
} from "@uploadista/core/flow";
```

#### Creating a Flow

```typescript
import { createFlow, createFlowNode, NodeType } from "@uploadista/core/flow";
import { z } from "zod";
import { Effect } from "effect";

// Define schemas
const inputSchema = z.object({
  id: z.string(),
  stream: z.instanceof(Uint8Array),
  metadata: z.record(z.unknown()),
});

const outputSchema = z.object({
  id: z.string(),
  url: z.string(),
  size: z.number(),
});

// Create nodes
const inputNode = createFlowNode({
  id: "input-1",
  name: "File Input",
  description: "Accepts incoming files",
  type: NodeType.input,
  inputSchema,
  outputSchema: inputSchema,
  run: ({ data }) => Effect.succeed({ type: "complete", data }),
});

const processNode = createFlowNode({
  id: "process-1",
  name: "Process File",
  description: "Processes the file",
  type: NodeType.process,
  inputSchema,
  outputSchema,
  run: ({ data, storageId, jobId }) =>
    Effect.gen(function* () {
      // Processing logic here
      const result = {
        id: data.id,
        url: `https://storage.example.com/${data.id}`,
        size: data.stream.byteLength,
      };
      return { type: "complete", data: result };
    }),
});

// Create flow
const flow = yield* createFlow({
  flowId: "my-flow",
  name: "My Processing Flow",
  inputSchema,
  outputSchema,
  nodes: [inputNode, processNode],
  edges: [
    { source: "input-1", target: "process-1" }
  ],
});

// Run the flow
const result = yield* flow.run({
  inputs: {
    "input-1": { id: "file-1", stream: new Uint8Array([...]), metadata: {} }
  },
  storageId: "storage-1",
  jobId: "job-1",
  clientId: "client-1",
});
```

#### Flow Execution Results

Flows can complete or pause (for nodes that wait for additional data):

```typescript
type FlowExecutionResult<TOutput> =
  | { type: "completed"; result: TOutput }
  | {
      type: "paused";
      nodeId: string;
      executionState: {
        executionOrder: string[];
        currentIndex: number;
        inputs: Record<string, unknown>;
      };
    };
```

#### Node Types

- **input**: Entry point for data into the flow
- **process**: Transforms data
- **output**: Saves data to storage
- **conditional**: Routes data based on conditions
- **multiplex**: Splits data to multiple outputs
- **merge**: Combines multiple inputs

#### Node Features

**Conditional Execution**:
```typescript
createFlowNode({
  // ... other config
  condition: {
    field: "mimeType",
    operator: "equals",
    value: "image/jpeg"
  }
});
```

**Multi-Input Nodes**:
```typescript
createFlowNode({
  // ... other config
  multiInput: true,
  run: ({ inputs }) => {
    // inputs is Record<string, unknown>
    // Process all inputs together
  }
});
```

**Retry Configuration**:
```typescript
createFlowNode({
  // ... other config
  retry: {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true
  }
});
```

**Pausable Nodes**:
```typescript
createFlowNode({
  // ... other config
  pausable: true,
  run: ({ data }) => {
    if (needsMoreData) {
      return Effect.succeed({
        type: "waiting",
        partialData: data
      });
    }
    return Effect.succeed({
      type: "complete",
      data: processedData
    });
  }
});
```

#### Flow Events

Monitor flow execution with event callbacks:

```typescript
createFlow({
  // ... other config
  onEvent: (event) => Effect.gen(function* () {
    switch (event.eventType) {
      case EventType.FlowStart:
        console.log("Flow started", event.flowId);
        break;
      case EventType.NodeStart:
        console.log("Node started", event.nodeId);
        break;
      case EventType.NodeEnd:
        console.log("Node completed", event.nodeId, event.result);
        break;
      case EventType.NodeError:
        console.error("Node failed", event.nodeId, event.error);
        break;
      case EventType.FlowEnd:
        console.log("Flow completed", event.result);
        break;
    }
  })
});
```

#### FlowServer

The FlowServer provides a high-level interface for managing flow execution:

```typescript
import { FlowServer, createFlowServer } from "@uploadista/core/flow";
import { Effect, Context, Layer } from "effect";

// Create a flow provider
const flowProvider = Layer.succeed(FlowProvider, {
  getFlow: (flowId, clientId) => Effect.succeed(myFlow)
});

// Build the FlowServer with dependencies
const program = Effect.gen(function* () {
  const flowServer = yield* FlowServer;

  // Run a flow
  const job = yield* flowServer.runFlow({
    flowId: "my-flow",
    storageId: "storage-1",
    clientId: "client-1",
    inputs: { "input-1": fileData }
  });

  // Monitor job status
  const status = yield* flowServer.getJobStatus(job.id);

  // Continue a paused flow
  if (status.status === "paused" && status.pausedAt) {
    yield* flowServer.resumeFlow({
      jobId: job.id,
      nodeId: status.pausedAt,
      newData: additionalData,
      clientId: "client-1"
    });
  }
});

// Run with dependencies
Effect.runPromise(
  program.pipe(
    Effect.provide(flowProvider),
    Effect.provide(uploadFileKvStore),
    Effect.provide(flowJobKvStore),
    Effect.provide(eventEmitter)
  )
);
```

### Upload Module (`/upload`)

Handles file uploads with multiple strategies:

```typescript
import {
  UploadServer,
  createUploadServer,
  uploadServer,
  type UploadServerShape,
} from "@uploadista/core/upload";
```

#### UploadServer

```typescript
import { UploadServer } from "@uploadista/core/upload";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const uploadServer = yield* UploadServer;

  // Create an upload
  const upload = yield* uploadServer.createUpload(
    {
      filename: "image.jpg",
      size: 1024000,
      mimeType: "image/jpeg",
      storageId: "storage-1",
      metadata: { description: "Profile photo" }
    },
    "client-1"
  );

  // Upload chunks
  const completed = yield* uploadServer.uploadChunk(
    upload.id,
    "client-1",
    readableStream
  );

  // Upload directly with stream
  const file = yield* uploadServer.upload(
    inputFile,
    "client-1",
    readableStream
  );

  // Upload from URL
  const fromUrl = yield* uploadServer.uploadFromUrl(
    inputFile,
    "client-1",
    "https://example.com/image.jpg"
  );

  // Read file data
  const data = yield* uploadServer.read(upload.id, "client-1");

  // Delete file
  yield* uploadServer.delete(upload.id, "client-1");

  // Get storage capabilities
  const capabilities = yield* uploadServer.getCapabilities(
    "storage-1",
    "client-1"
  );
});
```

#### Upload Strategies

DataStores can support different upload strategies:

- **Single**: Upload file in one request
- **Parallel**: Upload chunks in parallel (S3, GCS, Azure)
- **Resumable**: Resume interrupted uploads
- **Transactional**: Atomic commit after all chunks

Check capabilities:
```typescript
const capabilities = yield* uploadServer.getCapabilities(storageId, clientId);

if (capabilities.supportsParallelUploads) {
  // Use parallel upload strategy
  console.log("Max parts:", capabilities.maxParts);
  console.log("Optimal chunk size:", capabilities.optimalChunkSize);
}
```

### Streams Module (`/streams`)

Advanced stream manipulation utilities:

#### StreamLimiter

Limit stream data rate or total size:

```typescript
import { StreamLimiter } from "@uploadista/core/streams/stream-limiter";

const limiter = new StreamLimiter({
  maxSize: 100 * 1024 * 1024, // 100MB max
  onProgress: (bytesRead) => {
    console.log(`Progress: ${bytesRead} bytes`);
  }
});

const limited = inputStream.pipeThrough(limiter.transform);
```

### Utils Module (`/utils`)

Utility functions for common operations:

#### Debounce

```typescript
import { debounce } from "@uploadista/core/utils";

const debouncedFn = debounce(
  (value: string) => console.log("Search:", value),
  300,
  { leading: false, trailing: true }
);

// Only logs once after 300ms of no calls
debouncedFn("a");
debouncedFn("ab");
debouncedFn("abc"); // Logs "Search: abc" after 300ms
```

#### Throttle

```typescript
import { throttle } from "@uploadista/core/utils";

const throttledFn = throttle(
  (value: number) => console.log("Value:", value),
  1000
);

// Logs immediately, then at most once per second
throttledFn(1); // Logs immediately
throttledFn(2); // Ignored (within 1s)
throttledFn(3); // Ignored (within 1s)
// After 1s
throttledFn(4); // Logs "Value: 4"
```

#### Once

Ensure a function runs only once:

```typescript
import { once } from "@uploadista/core/utils";

const initialize = once(() => {
  console.log("Initializing...");
  // Expensive setup
});

initialize(); // Logs "Initializing..."
initialize(); // Does nothing
initialize(); // Does nothing
```

#### Generate ID

Generate unique identifiers:

```typescript
import { GenerateId } from "@uploadista/core/utils";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const generateId = yield* GenerateId;
  const id = yield* generateId.generate();
  console.log("ID:", id); // e.g., "abc123def456"
});
```

### WebSocket Module (`/websocket`)

Real-time event streaming:

```typescript
import type {
  WebSocketConnection,
  WebSocketMessage,
} from "@uploadista/core/websocket";

// Platform-agnostic WebSocket interface
const connection: WebSocketConnection = {
  id: "conn-123",
  readyState: 1, // OPEN
  send: (data: string) => ws.send(data),
  close: (code?: number, reason?: string) => ws.close(code, reason),
};

// Subscribe to events
yield* uploadServer.subscribeToUploadEvents(uploadId, connection);
yield* flowServer.subscribeToFlowEvents(jobId, connection);

// Message types
type WebSocketMessage =
  | { type: "upload_event"; payload: UploadEvent }
  | { type: "flow_event"; payload: FlowEvent }
  | { type: "subscribed"; payload: { eventKey: string } }
  | { type: "error"; message: string }
  | { type: "ping" | "pong"; timestamp?: string };
```

## Plugin System

`@uploadista/core` provides plugin interfaces for extending functionality:

### Image Plugin

Image processing operations (resize, optimize):

```typescript
import { ImagePlugin } from "@uploadista/core/flow";
import { Effect, Layer } from "effect";

// Implement the plugin
const imagePlugin = Layer.succeed(ImagePlugin, {
  resize: (input, options) => Effect.gen(function* () {
    // Resize implementation
    return resizedImage;
  }),
  optimize: (input, options) => Effect.gen(function* () {
    // Optimize implementation
    return optimizedImage;
  })
});

// Use in flows
const resizeNode = createFlowNode({
  // ... config
  run: ({ data }) => Effect.gen(function* () {
    const plugin = yield* ImagePlugin;
    const resized = yield* plugin.resize(data.stream, {
      width: 800,
      height: 600,
      fit: "cover"
    });
    return { type: "complete", data: { ...data, stream: resized } };
  })
});
```

### Image AI Plugin

AI-powered image operations:

```typescript
import { ImageAIPlugin } from "@uploadista/core/flow";

// Implement the plugin
const imageAIPlugin = Layer.succeed(ImageAIPlugin, {
  describeImage: (input, options) => Effect.gen(function* () {
    // AI description implementation
    return "A beautiful sunset over mountains";
  }),
  removeBackground: (input, options) => Effect.gen(function* () {
    // Background removal implementation
    return imageWithoutBackground;
  })
});
```

### Zip Plugin

Create ZIP archives from multiple files:

```typescript
import { ZipPlugin } from "@uploadista/core/flow";

const zipPlugin = Layer.succeed(ZipPlugin, {
  zip: (inputs, options) => Effect.gen(function* () {
    // ZIP creation implementation
    return zipFileData;
  })
});

// Use in a merge node
const zipNode = createFlowNode({
  id: "zip-1",
  type: NodeType.merge,
  multiInput: true,
  run: ({ inputs }) => Effect.gen(function* () {
    const plugin = yield* ZipPlugin;

    const zipInputs = Object.entries(inputs).map(([id, data]) => ({
      id,
      data: data.stream,
      metadata: data.metadata
    }));

    const zipData = yield* plugin.zip(zipInputs, {
      zipName: "archive.zip",
      includeMetadata: true
    });

    return {
      type: "complete",
      data: { stream: zipData, filename: "archive.zip" }
    };
  })
});
```

### Credential Provider

Secure credential management for plugins:

```typescript
import { CredentialProvider } from "@uploadista/core/flow";

const credentialProvider = Layer.succeed(CredentialProvider, {
  getCredential: (credentialId, clientId) => Effect.gen(function* () {
    // Fetch credential securely
    return {
      id: credentialId,
      value: "api-key-value",
      metadata: {}
    };
  })
});
```

## Data Stores

`@uploadista/core` defines the `DataStore` interface for storage backends. Implementations are provided in separate packages:

- `@uploadista/data-stores-s3` - AWS S3
- `@uploadista/data-stores-azure` - Azure Blob Storage
- `@uploadista/data-stores-gcs` - Google Cloud Storage
- `@uploadista/data-stores-filesystem` - Local filesystem

### DataStore Interface

```typescript
type DataStore<TData> = {
  readonly bucket?: string;
  readonly path?: string;
  readonly create: (file: TData) => Effect.Effect<TData, UploadistaError>;
  readonly remove: (file_id: string) => Effect.Effect<void, UploadistaError>;
  readonly read: (file_id: string) => Effect.Effect<Uint8Array, UploadistaError>;
  readonly write: (
    options: DataStoreWriteOptions,
    dependencies: { onProgress?: (chunkSize: number) => void }
  ) => Effect.Effect<number, UploadistaError>;
  readonly deleteExpired?: () => Effect.Effect<number, UploadistaError>;
  readonly getCapabilities: () => DataStoreCapabilities;
  readonly validateUploadStrategy: (
    strategy: UploadStrategy
  ) => Effect.Effect<boolean, never>;
};
```

### Using DataStores

```typescript
import { createDataStoreLayer } from "@uploadista/core/types";
import { S3DataStore } from "@uploadista/data-stores-s3";

// Single store
const dataStoreLayer = await createDataStoreLayer(s3Store);

// Multiple stores with routing
const dataStoreLayer = await createDataStoreLayer({
  stores: {
    "s3-prod": s3Store,
    "azure-backup": azureStore,
  },
  default: "s3-prod"
});
```

## KV Stores

`@uploadista/core` defines the `KvStore` interface for metadata storage. Implementations are provided in separate packages:

- `@uploadista/kv-stores-cloudflare-kv` - Cloudflare KV
- `@uploadista/kv-stores-cloudflare-do` - Cloudflare Durable Objects
- `@uploadista/kv-stores-redis` - Redis
- `@uploadista/kv-stores-ioredis` - IORedis
- `@uploadista/kv-stores-memory` - In-memory (for testing)
- `@uploadista/kv-stores-filesystem` - File-based

### KvStore Interface

```typescript
type KvStore<TData> = {
  readonly get: (key: string) => Effect.Effect<TData, UploadistaError>;
  readonly set: (key: string, value: TData) => Effect.Effect<void, UploadistaError>;
  readonly delete: (key: string) => Effect.Effect<void, UploadistaError>;
  readonly list?: () => Effect.Effect<Array<string>, UploadistaError>;
};
```

### Creating Typed KV Stores

```typescript
import { TypedKvStore, jsonSerializer } from "@uploadista/core/types";

const uploadStore = new TypedKvStore<UploadFile>(
  baseKvStore,
  "uploadista:upload:",
  jsonSerializer.serialize,
  jsonSerializer.deserialize
);

// Use with Effect
const file = yield* uploadStore.get("file-123");
yield* uploadStore.set("file-123", updatedFile);
yield* uploadStore.delete("file-123");
```

## Effect-TS Patterns

### Dependency Injection

Use Effect's Context system to inject dependencies:

```typescript
import { Effect, Context, Layer } from "effect";

// Define your service
class MyService extends Context.Tag("MyService")<
  MyService,
  { doSomething: () => Effect.Effect<string, never> }
>() {}

// Create implementation
const myServiceLive = Layer.succeed(MyService, {
  doSomething: () => Effect.succeed("done")
});

// Use in program
const program = Effect.gen(function* () {
  const service = yield* MyService;
  const result = yield* service.doSomething();
  console.log(result);
});

// Run with dependencies
Effect.runPromise(program.pipe(Effect.provide(myServiceLive)));
```

### Error Handling

All operations return Effects that can fail with `UploadistaError`:

```typescript
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const uploadServer = yield* UploadServer;

  // Try to upload
  const result = yield* uploadServer.upload(file, clientId, stream).pipe(
    Effect.catchTag("UploadistaError", (error) => {
      console.error("Upload failed:", error.body);
      // Handle error or provide fallback
      return Effect.succeed(fallbackFile);
    })
  );

  return result;
});
```

### Combining Effects

Chain multiple operations:

```typescript
const program = Effect.gen(function* () {
  const uploadServer = yield* UploadServer;
  const flowServer = yield* FlowServer;

  // Upload file
  const file = yield* uploadServer.upload(inputFile, clientId, stream);

  // Process with flow
  const job = yield* flowServer.runFlow({
    flowId: "process-image",
    storageId: file.storage.id,
    clientId,
    inputs: { "input-1": file }
  });

  // Wait for completion (in real app, use WebSocket events)
  let status = yield* flowServer.getJobStatus(job.id);
  while (status.status === "running") {
    yield* Effect.sleep(1000);
    status = yield* flowServer.getJobStatus(job.id);
  }

  if (status.status === "completed") {
    return status.result;
  } else {
    return yield* Effect.fail(
      UploadistaError.fromCode("FLOW_JOB_ERROR", {
        body: status.error || "Flow failed"
      })
    );
  }
});
```

## Testing

The core package includes unit tests using Vitest:

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests once
pnpm test:run
```

### Testing with Effect

Use Effect's testing utilities:

```typescript
import { Effect, Layer } from "effect";
import { describe, it, expect } from "vitest";

describe("MyFlow", () => {
  it("should process file", async () => {
    const testLayer = Layer.mergeAll(
      mockDataStore,
      mockKvStore,
      mockEventEmitter
    );

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(testLayer))
    );

    expect(result).toBeDefined();
  });
});
```

## Type Safety

Full TypeScript support with strict typing:

```typescript
import type { Flow, FlowNode, FlowEdge } from "@uploadista/core/flow";
import type { UploadFile, DataStore } from "@uploadista/core/types";
import { z } from "zod";

// Define schemas
const myInputSchema = z.object({
  file: z.instanceof(Uint8Array),
  metadata: z.record(z.string()),
});

type MyInput = z.infer<typeof myInputSchema>;

// TypeScript ensures type safety
const node = createFlowNode<MyInput, ProcessedOutput>({
  inputSchema: myInputSchema,
  outputSchema: outputSchema,
  run: ({ data }) => {
    // data is typed as MyInput
    return Effect.succeed({
      type: "complete",
      data: processedOutput // Must match ProcessedOutput type
    });
  }
});
```

## Best Practices

### 1. Use Effect-TS Patterns

Always use Effect for async operations:

```typescript
// Good
const upload = yield* uploadServer.upload(file, clientId, stream);

// Avoid
const upload = await Effect.runPromise(
  uploadServer.upload(file, clientId, stream)
);
```

### 2. Handle Errors Properly

Use Effect's error handling:

```typescript
const program = uploadServer.upload(file, clientId, stream).pipe(
  Effect.retry({ times: 3 }),
  Effect.timeout(30000),
  Effect.catchAll((error) => {
    // Log and handle
    return fallbackEffect;
  })
);
```

### 3. Validate Inputs

Always validate inputs with Zod schemas:

```typescript
const inputSchema = z.object({
  filename: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string(),
});

// Schema validation is automatic in Flow nodes
```

### 4. Use Typed Stores

Create typed wrappers for KV stores:

```typescript
const uploadStore = new TypedKvStore<UploadFile>(
  baseStore,
  "uploads:",
  jsonSerializer.serialize,
  jsonSerializer.deserialize
);
```

### 5. Manage Resources

Use Effect's resource management:

```typescript
const program = Effect.acquireUseRelease(
  // Acquire
  Effect.sync(() => openFile(path)),
  // Use
  (file) => processFile(file),
  // Release
  (file) => Effect.sync(() => file.close())
);
```

## Related Packages

### Data Stores
- `@uploadista/data-stores-s3` - AWS S3 storage
- `@uploadista/data-stores-azure` - Azure Blob Storage
- `@uploadista/data-stores-gcs` - Google Cloud Storage
- `@uploadista/data-stores-filesystem` - Local filesystem storage

### KV Stores
- `@uploadista/kv-stores-cloudflare-kv` - Cloudflare KV
- `@uploadista/kv-stores-cloudflare-do` - Cloudflare Durable Objects
- `@uploadista/kv-stores-redis` - Redis
- `@uploadista/kv-stores-ioredis` - IORedis
- `@uploadista/kv-stores-memory` - In-memory store
- `@uploadista/kv-stores-filesystem` - File-based store

### Flow Nodes
- `@uploadista/flow-input-nodes` - File input nodes
- `@uploadista/flow-output-nodes` - Storage output nodes
- `@uploadista/flow-image-nodes` - Image processing nodes
- `@uploadista/flow-utility-nodes` - Utility nodes (conditional, merge, etc.)

### Client & Server
- `@uploadista/client` - Browser upload client
- `@uploadista/server` - Server-side utilities

## Development

### Build

```bash
pnpm build
```

### Lint and Format

```bash
pnpm lint
pnpm format
pnpm check
```

### Type Check

```bash
pnpm typecheck
```

## License

See the main repository for license information.

## Contributing

See the main repository for contribution guidelines.
