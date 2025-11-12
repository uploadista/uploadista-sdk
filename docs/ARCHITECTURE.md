# System Architecture

Complete technical overview of Uploadista SDK architecture.

## System Overview

Uploadista is a modular, plugin-based file upload and processing system built on a **Flow Engine** (DAG processor) with support for multiple clouds and frameworks.

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Applications                   │
│  (React / Vue / React Native / Browser)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                   API Layer                                 │
│  (Hono / Express / Fastify + Authentication)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ↓
┌───────────────────────────────────────────────────────────────────────────┐
│              Upload & Flow Processing                                     │
│  (Core upload logic, chunking, resumable uploads)                         │
│  (Flow Engine: DAG-based pipeline processing)                             │
└────┬────────────────────┬──────────────────────────┬──────────────────┬───┘
     │                    │                          │                  │
     ↓                    ↓                          ↓                  ↓
┌──────────────┐ ┌──────────────────┐       ┌──────────────┐  ┌─────────────────┐
│ Data Stores  │ │ KV Stores        │       │Event System  │  │   Plugins       │
│              │ │                  │       │              │  │                 │
│ • S3         │ │ • Memory         │       │ • Broadcast  │  │ • Image Nodes   │
│ • Azure      │ │ • Redis          │       │ • WebSocket  │  │ • AI Processing │
│ • GCS        │ │ • IORedis        │       │ • Emitters   │  │ • Compression   │
│ • Filesystem │ │ • Cloudflare KV  │       │              │  │ • Custom Nodes  │
│              │ │ • Cloudflare DO  │       │              │  │ • Archiving     │
│              │ │ • Filesystem     │       │              │  │                 │
└──────────────┘ └──────────────────┘       └──────────────┘  └─────────────────┘

  File Storage    State & Sessions   Real-time Events   Processing Extensions
  (Durable)      (Upload Progress)   (Progress/Status)   (Flow Nodes)
```

## Foundational Pattern: Effect-TS

Before diving into components, understand that **all** of Uploadista's architecture is built on **Effect-TS**, a functional effect system for TypeScript. This provides:

- **Composable error handling**: `Effect.Effect<Success, Error, Requirements>`
- **Dependency injection**: `Context.Tag` for type-safe service discovery
- **Layered architecture**: `Layer` for composing services
- **Streaming support**: `Effect.Stream` for memory-efficient processing
- **Type safety**: Full end-to-end typed error handling

Example pattern:
```typescript
// Define a requirement using Context.Tag
const MyService = Context.Tag<MyService, { doSomething: () => Effect<string> }>();

// Create an Effect that requires this service
const myEffect = Effect.gen(function* () {
  const service = yield* MyService;
  return yield* service.doSomething();
});

// Provide the service via Layer
const program = myEffect.pipe(
  Effect.provide(Layer.succeed(MyService, { /* implementation */ }))
);
```

All core types use this pattern: `UploadServer`, `UploadFileDataStores`, `UploadFileKVStore`, `EventBroadcaster`, etc.

## Core Concepts

### 1. Upload Server

A **business logic service** (not an HTTP handler) that manages the complete file upload lifecycle. It's implemented as an Effect service that can be composed with other services.

**Key Methods**:
- `createUpload(inputFile, clientId)` - Create upload metadata
- `uploadChunk(uploadId, clientId, stream)` - Upload a chunk of data
- `upload(file, clientId, stream)` - Complete upload in one operation
- `uploadFromUrl(inputFile, clientId, url)` - Fetch and upload from remote URL
- `getUpload(uploadId)` - Retrieve upload metadata
- `read(uploadId, clientId)` - Read complete uploaded file
- `delete(uploadId, clientId)` - Delete upload and data
- `getCapabilities(storageId, clientId)` - Query storage backend capabilities
- `subscribeToUploadEvents(uploadId, connection)` - Subscribe WebSocket to progress
- `unsubscribeFromUploadEvents(uploadId)` - Unsubscribe from events

**HTTP Handling**: HTTP routing and middleware are handled by separate adapter packages (`@uploadista/adapters-hono`, `@uploadista/adapters-express`, etc.), not in core.

**HTTP Upload Sequence**:

```
Client (Browser)                HTTP Adapter                UploadServer
        │                             │                           │
        ├─ POST /uploads ────────────→│ handleUploadPost          │
        │  { fileName, size, type }   ├─ validateInput ──────────→│
        │                             │                           │
        │                             │ createUpload()            │
        │                             │←──────────────────────────┤ Creates metadata
        │←─ 200 { uploadId } ─────────┤                           │ Stores in KV
        │    (Auth cached)            │                           │
        │                             │                           │
        ├─ PATCH /uploads/{id} ──────→│ handleUploadPatch         │
        │  { chunk data }             ├─ getAuth (cached) ───────→│
        │                             │                           │
        │                             │ uploadChunk()             │
        │                             │←──────────────────────────┤ Writes to DataStore
        │                             │                           │ Updates KV offset
        │←─ 200 { offset, size } ─────┤                           │
        │  ◄─── WebSocket: progress ◄─┤ emitEvent()               │
        │       { progress: 25% }     │←──────────────────────────┤ Broadcasts event
        │                             │                           │
        ├─ PATCH /uploads/{id} ──────→│ handleUploadPatch         │
        │  { chunk 2 }                ├─ getAuth (cached) ───────→│
        │                             │  uploadChunk()            │
        │←─ 200 { offset, size } ─────┤←──────────────────────────┤
        │  ◄─── WebSocket: progress   │                           │
        │       { progress: 100% }    │                           │
        │                             │                           │
        │                         VALIDATION (if complete)        │
        │                             │    validateUpload()       │
        │                             │                           │
        │                             │    ├─ Check capabilities  │
        │                             │    ├─ Read file bytes     │
        │                             │    ├─ Checksum validation │
        │                             │    └─ MIME type check     │
        │                             │←──────────────────────────┤
        │  ◄─── WS: validation-event ─┤                           │
        │       { success or failed}  │                           │
        │                             │    If failed:             │
        │                             │    ├─ Delete from store   │
        │                             │    └─ Return error        │
        │                             │                           │
```

**Validation Flow** (triggered when upload is complete):
- **Checksum Validation** (if provided by client):
  - Compute checksum of uploaded file using specified algorithm (SHA256)
  - Compare with expected checksum
  - Emit `UPLOAD_VALIDATION_SUCCESS` or `UPLOAD_VALIDATION_FAILED` event
  - If failed: Delete file from DataStore and fail with CHECKSUM_MISMATCH error

- **MIME Type Validation** (if required by DataStore capabilities):
  - Detect actual MIME type from file bytes
  - Compare with declared MIME type
  - Emit validation success/failure event
  - If failed: Delete file from DataStore and fail with MIMETYPE_MISMATCH error

- **Size Validation** (automatic):
  - Check if file exceeds max validation size (from capabilities)
  - If exceeded: Emit UPLOAD_VALIDATION_WARNING and skip detailed validation
  - Otherwise: Proceed with checksum and MIME type checks

**Validation Events**:
- `UPLOAD_VALIDATION_SUCCESS` - Validation passed (checksum or MIME type)
- `UPLOAD_VALIDATION_WARNING` - File too large for validation, skipped
- `UPLOAD_VALIDATION_FAILED` - Validation failed, file will be cleaned up

**Example Usage**:
```typescript
const uploadEffect = Effect.gen(function* () {
  const server = yield* UploadServer;

  // Create upload session
  const upload = yield* server.createUpload({
    storageId: "s3-production",
    size: 1024000,
    type: "image/jpeg",
    fileName: "photo.jpg"
  }, "client123");

  // Upload chunk
  const stream = new ReadableStream(...);
  const updated = yield* server.uploadChunk(upload.id, "client123", stream);

  return updated;
});
```

### 2. Flow Engine (DAG Processor)

A sophisticated **Directed Acyclic Graph (DAG)** processor with advanced features for file processing pipelines.

**Advanced Features**:
- **Type-safe validation**: Zod schema validation for node input/output
- **Pausable & resumable**: Pause flows at any node and resume with execution state
- **Parallel execution**: Concurrent execution of independent nodes with configurable max concurrency
- **Conditional routing**: Built-in condition evaluation before node execution
- **Per-node retry**: Exponential backoff with configurable retry strategies
- **Stream support**: Memory-efficient Effect.Stream processing
- **Multi-input/output**: Nodes can accept multiple inputs and output to multiple targets
- **Event lifecycle**: Full tracking of flow and node lifecycle (start/end/error/pause/resume)

**Key Components**:
- **Nodes**: Processing units with typed inputs/outputs and optional conditions
  - Input: File entry point
  - Processing: Transformations (resize, optimize, remove-background, etc.)
  - Utility: Control flow (conditional, merge, multiplex, zip)
  - Output: Storage backends
- **Edges**: Data flow connections between nodes
- **Flow**: Collection of nodes + edges with metadata
- **Executor**: Runs nodes respecting dependencies, with parallel scheduling
- **FlowJob**: Tracks execution state, status, and intermediate results

**Example Flow with Advanced Features**:

```
Input (file)
    ↓
Conditional (is image?)  ← Built-in condition evaluation
    ├─ YES → Resize → [Parallel: Optimize (webp) + Optimize (avif)] → S3 → Output
    └─ NO → Archive → S3 → Output

Features shown:
- Conditional node routes based on MIME type
- Parallel execution of two optimize nodes
- Pause/Resume support at any node
- Zod validation on inputs/outputs
- Retry with exponential backoff for network operations
```

**Node Definition Example**:

```typescript
import { createTransformNode, ImagePlugin } from "@uploadista/core/flow";
import { Effect } from "effect";

// Real example: Resize node from @uploadista/flow-images-nodes
function createResizeNode(
  id: string,
  { width, height, fit }: ResizeParams,
) {
  return Effect.gen(function* () {
    const imageService = yield* ImagePlugin;

    return yield* createTransformNode({
      id,
      name: "Resize",
      description: "Resizes an image to the specified dimensions",
      // Transform function: takes input bytes, returns transformed bytes
      transform: (inputBytes) =>
        imageService.resize(inputBytes, { height, width, fit }),
    });
  });
}

// Usage in a flow
const resizeNode = yield* createResizeNode("resize", {
  width: 1200,
  height: 1200,
  fit: "cover",
});
```

**Node Types Available**:

1. **Transform Nodes** (`createTransformNode`):
   - Take input data, apply transformation, return output
   - Used for image resize, optimize, compress, etc.
   - Example: `@uploadista/flow-images-nodes` (resize, optimize)

2. **Utility Nodes** (`createConditionalNode`, `createMergeNode`, etc.):
   - `createConditionalNode` - Route based on conditions
   - `createMergeNode` - Merge multiple inputs
   - `createMultiplexNode` - Split single input to multiple outputs
   - `createZipNode` - Combine multiple inputs

3. **Input/Output Nodes**:
   - Input nodes: File entry point for flow
   - Output nodes: Storage backends (S3, Azure, GCS, etc.)

**Node Composition via Effect**:
- Nodes are created using Effect.gen() for dependency injection
- `yield* PluginService` to access required services (ImagePlugin, etc.)
- Nodes can be composed with other services and layers
- Full type safety and error handling through Effect system

**Full Flow Configuration**:

```typescript
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import {
  createOptimizeNode,
  createRemoveBackgroundNode,
  createDescribeImageNode,
} from "@uploadista/flow-images-nodes";

// Create individual nodes
const inputNode = createInputNode("input");
const outputNode = createStorageNode("output");

const optimizeNode = createOptimizeNode("optimize", {
  quality: 80,
  format: "webp",
});

const removeBackgroundNode = createRemoveBackgroundNode("remove-background");
const describeImageNode = createDescribeImageNode("describe-image");

// Simple flow: Input → Output
export const simpleFlow = createFlow({
  flowId: "simple-flow",
  name: "Simple Flow",
  nodes: {
    input: inputNode,
    output: outputNode,
  },
  edges: [
    { source: "input", target: "output" },
  ],
});

// Optimize flow: Input → Optimize → Output
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

// Remove background flow: Input → RemoveBackground → Output
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

// Describe image flow: Input → DescribeImage → Output
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

// FlowProvider function: Maps flowId to flow definition
export const getFlow = (flowId: string) => {
  switch (flowId) {
    case "optimize-flow":
      return optimizeFlow;
    case "remove-background-flow":
      return removeBackgroundFlow;
    case "describe-image-flow":
      return describeImageFlow;
    default:
      return simpleFlow;
  }
};
```

**Execution with Pause/Resume**:

```typescript
const flowEffect = Effect.gen(function* () {
  const flowServer = yield* FlowServer;

  // Start execution
  const job = yield* flowServer.executeFlow(flow, fileId, clientId);

  // Client can pause at any point
  yield* flowServer.pauseFlow(job.id);

  // Execution state is saved
  const pausedJob = yield* flowServer.getJob(job.id);
  console.log(pausedJob.executionState); // Full execution state

  // Resume later with execution continuing from where it paused
  yield* flowServer.resumeFlow(job.id);
});
```

### 3. KV Store (State Management)

A **two-tier architecture** for type-safe state management of uploads and flow jobs.

**Architecture Layers**:

1. **BaseKvStore** (Low-level):
   - Raw string key-value operations
   - `get(key)`, `set(key, value)`, `delete(key)`, `list?(prefix)`
   - Implemented by storage adapters (Redis, Cloudflare KV, memory, filesystem)

2. **TypedKvStore** (High-level):
   - Wraps BaseKvStore with automatic JSON serialization/deserialization
   - Type-safe storage: `KvStore<UploadFile>`, `KvStore<FlowJob>`
   - Handles type conversion automatically

3. **Context.Tag Service Layer**:
   - `UploadFileKVStore` - Type-safe access to upload metadata
   - `FlowJobKVStore` - Type-safe access to flow job state
   - Accessed via `yield* UploadFileKVStore` in Effect contexts

**Key Data Stored for Uploads**:
```typescript
export type UploadFile = {
  id: string;
  offset: number;
  storage: {
    id: string;
    type: string;
    path?: string;
    uploadId?: string;
    bucket?: string;
  };
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
  size?: number;
  metadata?: Record<string, string | number | boolean>;
  creationDate?: string;
  url?: string;
  sizeIsDeferred?: boolean;
  checksum?: string;
  checksumAlgorithm?: string;
};
```

**Key Data Stored for Flow Jobs**:
```typescript
export type FlowJob = {
  id: string;
  flowId: string;
  storageId: string;
  clientId: string | null;
  status: FlowJobStatus;
  createdAt: Date;
  updatedAt: Date;
  tasks: FlowJobTask[];
  error?: string;
  endedAt?: Date;
  result?: unknown;
  pausedAt?: string;
  executionState?: FlowExecutionState;
  intermediateFiles?: string[];
};
```

**Implementation Options**:

```
┌──────────────────────────────────────────────┐
│ TypedKvStore<T>                              │
│ (automatic JSON serialization)                │
├──────────────────────────────────────────────┤
│ • get(key): T                                │
│ • set(key, value: T)                         │
│ • delete(key)                                │
│ • list?(): string[]                          │
└──────────────────────────────────────────────┘
             ↓
┌──────────────────────────────────────────────┐
│ BaseKvStore                                  │
│ (raw string operations)                      │
├──────────────────────────────────────────────┤
│ • get(key): string | null                    │
│ • set(key, value: string)                    │
│ • delete(key)                                │
│ • list?(prefix): string[]                    │
└──────────────────────────────────────────────┘
             │
    ┌────────┴───────────┬──────────────┬─────────────┐
    ↓                    ↓              ↓             ↓
┌────────┐ ┌────────┐ ┌────────────┐ ┌──────────┐ ┌──────────┐
│Memory  │ │Redis   │ │CloudflareKV│ │Cloudflare│ │Filesystem│
│(dev)   │ │        │ │(edge)      │ │  DO      │ │          │
└────────┘ └────────┘ └────────────┘ └──────────┘ └──────────┘
```

**Usage Example**:
```typescript
const uploadEffect = Effect.gen(function* () {
  const kvStore = yield* UploadFileKVStore;

  // Automatic deserialization with type safety
  const file = yield* kvStore.get("upload123");
  console.log(file.offset); // TypeScript knows this is a number

  // Automatic serialization
  const updated = { ...file, offset: 1000 };
  yield* kvStore.set("upload123", updated);
});
```

### 4. Data Store (File Storage)

Persists uploaded files to cloud storage or filesystem using an **Effect-TS based interface**.

**DataStoreCapabilities** - Feature negotiation:
Each DataStore declares what features it supports via `getCapabilities()`. This allows clients to choose optimal upload strategies:

```typescript
type DataStoreCapabilities = {
  supportsParallelUploads: boolean;        // S3 multipart, Azure parallel blocks
  supportsConcatenation: boolean;          // Combine multiple uploads into one
  supportsDeferredLength: boolean;         // Start upload without knowing final size
  supportsResumableUploads: boolean;       // Resume from last offset
  supportsTransactionalUploads: boolean;   // Atomic upload success/failure
  maxConcurrentUploads?: number;           // Max parallel parts (e.g., 10 for S3)
  minChunkSize?: number;                   // Minimum chunk size in bytes
  maxChunkSize?: number;                   // Maximum chunk size in bytes
  maxParts?: number;                       // Max number of parts
  optimalChunkSize?: number;               // Recommended chunk size (e.g., 5MB)
  requiresOrderedChunks: boolean;          // Must receive chunks sequentially
  requiresMimeTypeValidation?: boolean;    // Validates MIME type
  maxValidationSize?: number;              // Max file size for MIME validation
};
```

**Core Interface**:

```typescript
type DataStore<TData = UploadFile> = {
  readonly bucket?: string;                           // Optional bucket/container name
  readonly path?: string;                             // Optional base path prefix

  readonly create: (file: TData) => Effect<TData>;    // Create file record
  readonly remove: (file_id: string) => Effect<void>; // Delete file
  readonly read: (file_id: string) => Effect<Uint8Array>; // Read complete file
  readonly write: (
    options: DataStoreWriteOptions,
    dependencies: { onProgress?: (bytes: number) => void }
  ) => Effect<number>;                                // Write stream at offset, returns bytes written
  readonly deleteExpired?: () => Effect<number>;            // Optional cleanup
  readonly getCapabilities: () => DataStoreCapabilities;
  readonly validateUploadStrategy: (strategy) => Effect<boolean>;
};

type DataStoreWriteOptions = {
  file_id: string;
  stream: Effect.Stream<Uint8Array>;  // Memory-efficient streaming
  offset: number;                      // For resumable uploads
};
```

**Implementations**:

```
┌──────────────────────────────────────────────────────────┐
│ DataStore<UploadFile>                                    │
│ Effect-TS based, with capability negotiation             │
├──────────────────────────────────────────────────────────┤
│ • create(file): Create file metadata                     │
│ • remove(id): Delete file                               │
│ • read(id): Read as Uint8Array                           │
│ • write(options): Stream-based writing with offset       │
│ • getCapabilities(): Declares supported features         │
│ • validateUploadStrategy(strategy): Check compatibility  │
└──────────────────────────────────────────────────────────┘
         │
    ┌────┴─────┬──────────┬──────────────┬─────────────┐
    ↓          ↓          ↓              ↓             ↓
┌──────┐ ┌────────┐ ┌─────┐ ┌──────────┐ ┌─────────┐
│ S3   │ │Azure   │ │GCS  │ │Filesystem│ │R2/Edge  │
│      │ │Blob    │ │     │ │          │ │(Durable)│
└──────┘ └────────┘ └─────┘ └──────────┘ └─────────┘
```

**Usage Example**:
```typescript
const uploadEffect = Effect.gen(function* () {
  const dataStores = yield* UploadFileDataStores;
  const dataStore = yield* dataStores.getDataStore("s3-production", clientId);

  // Check capabilities to choose strategy
  const capabilities = dataStore.getCapabilities();
  if (capabilities.supportsParallelUploads && fileSize > 10_000_000) {
    // Use parallel upload strategy
    const chunkSize = capabilities.optimalChunkSize || 5_242_880;
  }

  // Stream-based writing with progress tracking
  const bytesWritten = yield* dataStore.write({
    file_id: uploadId,
    stream: fileStream,
    offset: resumeFromByte
  }, {
    onProgress: (bytes) => console.log(`Written: ${bytes}`);
  });
});
```

### 5. Flow Server (Flow Execution Service)

A critical service that manages the **complete lifecycle of flow execution**. This is separate from the Flow Engine (which handles DAG execution) and acts as the orchestrator.

**Key Responsibilities**:
- Manages flow job lifecycle (create, execute, pause, resume, cancel)
- Tracks execution state and job status
- Coordinates with Flow Engine for actual execution
- Requires a `FlowProvider` implementation to load flow definitions

**FlowProvider Pattern** - Applications must implement:
```typescript
interface FlowProvider {
  getFlow(flowId: string, clientId: string | null): Effect<Flow>;
}
```

This allows the FlowServer to dynamically load flow definitions at runtime based on application needs.

**FlowServer Methods**:
```typescript
type FlowServerShape = {
  // Start a flow execution
  executeFlow: (
    flowId: string,
    fileId: string,
    clientId: string | null,
    params?: Record<string, unknown>
  ) => Effect<FlowJob>;

  // Pause an executing flow (saves execution state)
  pauseFlow: (jobId: string) => Effect<void>;

  // Resume a paused flow
  resumeFlow: (jobId: string) => Effect<void>;

  // Cancel a flow
  cancelFlow: (jobId: string) => Effect<void>;

  // Get job status and details
  getJob: (jobId: string) => Effect<FlowJob>;

  // List all jobs for a file
  listJobs: (fileId: string) => Effect<FlowJob[]>;
};
```

**Example Implementation**:
```typescript
// Define available flows in your application
const flows: Record<string, Flow> = {
  "image-processing": createImageProcessingFlow(),
  "video-transcoding": createVideoTranscodingFlow(),
  "document-analysis": createDocumentAnalysisFlow(),
};

// Implement FlowProvider
const flowProvider: FlowProvider = {
  getFlow: (flowId: string, clientId: string | null) => Effect.gen(function* () {
    const flow = flows[flowId];
    if (!flow) {
      return yield* Effect.fail(
        UploadistaError.fromCode("NOT_FOUND", { cause: `Flow ${flowId} not found` })
      );
    }

    // Optional: Check permissions
    if (clientId && !canAccessFlow(clientId, flowId)) {
      return yield* Effect.fail(
        UploadistaError.fromCode("UNAUTHORIZED")
      );
    }

    return flow;
  }),
};

// Use in Effect context
const flowEffect = Effect.gen(function* () {
  const flowServer = yield* FlowServer;

  // Execute a flow
  const job = yield* flowServer.executeFlow(
    "image-processing",
    uploadId,
    clientId,
    { quality: 80, format: "webp" }
  );

  // Client is notified of progress via events
  // Event: flow-started
  // Event: flow-node-completed (for each node)
  // Event: flow-completed (with result)

  return job;
}).pipe(
  Effect.provide(createFlowServer(flowProvider))
);
```

**HTTP Flow Execution Sequence** (Upload + Flow Processing):

This diagram shows the complete flow of starting a flow with upload input, pausing at the input node, uploading chunks, and resuming when complete:

```
Client (Browser)            HTTP Adapter          UploadServer        FlowServer
        │                         │                     │                 │
        │       PHASE 1: START FLOW WITH INPUT          │                 │
        ├─ POST /flows/{flowId} ─→│ handleFlowPost       │                 │
        │  { storageId, inputs }  ├─ validateInput ─────→│ executeFlow()  │
        │                         │  Caches auth        │     ↓ runFlow() →│
        │←─ 200 { jobId } ───────┤                     │←──────────────→│
        │    (Flow started)       │  returns immediately│  Starts async  │
        │                         │                     │  execution     │
        │                         │                     │  ↓ Runs nodes  │
        │                         │                     │  until input   │
        │  ◄─── WS: flow-started ─┤                     │  node pauses   │
        │  ◄─── WS: node-start ───┤                     │                 │
        │       "input" node      │←──────────────────────┤ Input node     │
        │  ◄─── WS: node-pause ───┤  (waiting for data)  │ pauses here    │
        │       nodeId: "input"   │                     │ Execution state│
        │                         │                     │ saved          │
        │                         │                     │                 │
        │   PHASE 2: UPLOAD CHUNKS                       │                 │
        ├─ POST /uploads ────────→│ handleUploadPost    │                 │
        │  { fileName, size }     ├─ createUpload() ───→│                 │
        │  (for the paused flow)  │←─────────────────────┤                 │
        │←─ 200 { uploadId } ────┤  Caches auth        │                 │
        │                         │                     │                 │
        ├─ PATCH /uploads/{id} ──→│ handleUploadPatch    │                 │
        │  { chunk 1 }            ├─ uploadChunk() ────→│                 │
        │                         │←──────────────────────┤ Writes to      │
        │←─ 200 { offset } ──────┤                      │ DataStore      │
        │  ◄─── WS: progress      │                     │ Updates KV     │
        │       { progress: 50% }─┤                     │                 │
        │                         │                     │                 │
        ├─ PATCH /uploads/{id} ──→│ handleUploadPatch    │                 │
        │  { chunk 2 }            ├─ uploadChunk()      │                 │
        │←─ 200 { offset } ──────┤←─────────────────────┤ Upload complete│
        │  ◄─── WS: progress      │  Clears auth cache   │ (recordMetrics)│
        │       { progress: 100% }│                     │                 │
        │                         │                     │                 │
        │   PHASE 3: RESUME FLOW                        │                 │
        ├─ POST /flows/.../jobs/ ─→│ handleResumeFlow   │                 │
        │  {jobId}/resume/{nodeId}├─ getAuth (cached)──→│ resumeFlow()    │
        │  { newData: fileId }    │  or from cache      │     ↓ resume   │
        │                         │                     │ at input node  │
        │←─ 200 { result } ──────┤←──────────────────────┤←──────────────→│
        │                         │  Clears auth cache   │  Continue to   │
        │                         │  (if flow complete)  │  next nodes    │
        │                         │                     │                 │
        │  ◄─── WS: node-resume ──┤                     │   Input node    │
        │       nodeId: "input"   │                     │   resumes       │
        │  ◄─── WS: node-end ─────┤                     │ Execution       │
        │  ◄─── WS: node-start ───┤                     │ continues with  │
        │       "resizing..."     │                     │ downloaded data │
        │  ◄─── WS: node-end ─────┤                     │                 │
        │  ◄─── WS: node-start ───┤                     │                 │
        │       "optimizing..."   │                     │                 │
        │  ◄─── WS: node-end ─────┤                     │                 │
        │                         │                     │                 │
        │  ◄─── WS: flow-complete ─┤                     │   All nodes     │
        │       { result, outputs}│←──────────────────────┤ complete        │
        │                         │                     │ Event emitted   │
        │                         │                     │ Results ready   │
        │                         │                     │                 │
```

**Flow Execution Lifecycle** (Three Phases):

1. **Phase 1 - Start Flow**:
   - POST /flows/{flowId} with upload input info (storageId, file metadata)
   - Flow execution starts immediately, returns jobId
   - Flow engine runs through DAG until it reaches **input node**
   - Input node pauses execution and waits (NodePause event emitted)
   - Auth context cached for subsequent flow operations

2. **Phase 2 - Upload Chunks**:
   - Client creates a new upload session (POST /uploads)
   - Chunks uploaded via PATCH requests with progress tracking
   - Auth cached for chunk requests
   - When complete, upload metadata (uploadId, file location) becomes available

3. **Phase 3 - Resume Flow**:
   - Client calls resumeFlow with the paused nodeId and new upload data
   - Flow engine resumes from the paused input node
   - Input node receives the uploaded file data and resumes execution
   - Remaining nodes execute asynchronously
   - Final results delivered via flow-complete event

**Key Implementation Details**:
- Flow **starts immediately** with inputs (doesn't wait for upload)
- Flow **pauses at input node** waiting for file data to be available
- Execution state is **saved** while paused, allowing stateless server design
- Upload happens **independently** while flow is paused
- Auth context **cached multiple times**: after flow start, during chunks, before resume
- Auth cache **cleared** when flow complete or errors occur
- WebSocket events track all state transitions (start, pause, resume, node execution)
- Client uses **resumeFlow endpoint** to resume after upload completes

**Client-Side State Transitions** (via React hooks):

```
useFlowUpload Hook State Machine (Three Phases):

idle
  ↓ upload(file) called

PHASE 1: START FLOW
  ↓ POST /flows/{flowId} with inputs
processing (flow started, running to input node)
  │
  ├─ FlowStart event
  │   ↓ NodeStart event (input node)
  │   ↓ NodePause event (waiting for upload data)
  │
  ├─→ uploading (NodePause event triggers upload phase)

PHASE 2: UPLOAD CHUNKS
uploading (PATCH /uploads/{uploadId} with chunks)
  │
  ├─ UPLOAD_PROGRESS events (multiple)
  │   Updates: bytesUploaded, totalBytes, progress %
  │
  ├─ Upload complete (all chunks sent)
  │
  ├─→ processing (NodeResume event when POST resumeFlow sent)

PHASE 3: RESUME & PROCESS
processing (POST /flows/.../continue/{nodeId})
  │
  ├─ NodeResume event (input node resumes with file data)
  │ NodeEnd event (input node completes)
  │ NodeStart event (next node, e.g., "resizing")
  │ NodeEnd event
  │ ... (repeats for each remaining node)
  │
  ├─ FlowEnd event with results
  │   Calls onFlowComplete(outputs)
  │   Extracts output for onSuccess(result)
  │
  ├─→ success

OR at any phase:
  ├─ FlowError/NodeError event
  │   ├─→ error (calls onError)
  │
  ├─ User calls abort()
  │   ├─→ aborted (calls onAbort)

reset() called:
  ├─→ idle


Event Handling Details:
- FlowStart: Sets flowStarted = true, status = "processing"
- NodeStart: Updates currentNodeName, currentNodeType, status = "processing"
- NodePause (input node): Status = "uploading" (triggers upload phase)
- UPLOAD_PROGRESS: Updates bytesUploaded, totalBytes, progress %
- NodeResume: Updates currentNodeName, status = "processing"
- NodeEnd: Clears currentNodeName
- FlowEnd: status = "success", extracts outputs, calls callbacks
- FlowError/NodeError: status = "error", stores error, calls onError
```

**Example React Component Usage**:
```tsx
function FlowUploadComponent() {
  const flowUpload = useFlowUpload({
    flowConfig: {
      flowId: "image-processing",
      storageId: "s3-images"
    },
    onProgress: (progress) => console.log(`Upload progress: ${progress}%`),
    onFlowComplete: (outputs) => console.log("All flow outputs:", outputs),
    onSuccess: (result) => console.log("Final result:", result),
    onError: (error) => console.error("Error:", error),
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) flowUpload.upload(file);
        }}
      />

      {/* PHASE 1: Flow started, waiting at input node */}
      {flowUpload.state.flowStarted && !flowUpload.isUploadingFile && flowUpload.state.status === "processing" && (
        <div style={{ color: "blue" }}>
          <p>Flow initialized...</p>
          <p>Current step: {flowUpload.state.currentNodeName || "input"}</p>
          <p>Job ID: {flowUpload.state.jobId}</p>
        </div>
      )}

      {/* PHASE 2: File Upload (chunks being sent) */}
      {flowUpload.isUploadingFile && (
        <div style={{ color: "orange" }}>
          <p>Uploading file chunks... {flowUpload.state.progress}%</p>
          <p>Uploaded: {Math.round(flowUpload.state.bytesUploaded / 1024 / 1024)} MB of {Math.round((flowUpload.state.totalBytes || 0) / 1024 / 1024)} MB</p>
          <progress value={flowUpload.state.progress} max="100" />
        </div>
      )}

      {/* PHASE 3: Flow resumed and processing */}
      {flowUpload.isProcessing && !flowUpload.isUploadingFile && flowUpload.state.flowStarted && (
        <div style={{ color: "green" }}>
          <p>Processing file through flow nodes...</p>
          {flowUpload.state.currentNodeName && (
            <p>Current step: {flowUpload.state.currentNodeName}</p>
          )}
          <p>Job ID: {flowUpload.state.jobId}</p>
        </div>
      )}

      {/* Completion: Success */}
      {flowUpload.state.status === "success" && (
        <div style={{ color: "darkgreen" }}>
          <p>✓ Upload and flow processing complete!</p>
          <h3>Outputs:</h3>
          <pre>{JSON.stringify(flowUpload.state.flowOutputs, null, 2)}</pre>
          {flowUpload.state.result && (
            <div>
              <h3>Primary Output:</h3>
              <pre>{JSON.stringify(flowUpload.state.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* Error State */}
      {flowUpload.state.status === "error" && (
        <div style={{ color: "red" }}>
          <p>✗ Error: {flowUpload.state.error?.message}</p>
          <button onClick={flowUpload.reset}>Try Again</button>
        </div>
      )}

      {/* Aborted State */}
      {flowUpload.state.status === "aborted" && (
        <div style={{ color: "gray" }}>
          <p>Upload was cancelled</p>
          <button onClick={flowUpload.reset}>Reset</button>
        </div>
      )}

      {/* Cancel Button (available during upload or early processing) */}
      {(flowUpload.isUploadingFile || (flowUpload.isProcessing && flowUpload.state.currentNodeName === "input")) && (
        <button onClick={flowUpload.abort} style={{ background: "red", color: "white" }}>
          Cancel
        </button>
      )}
    </div>
  );
}
```
```

### 6. Event System (Real-Time Updates)

Broadcasts upload and flow events to connected clients using a **two-component architecture**.

**Architecture**:

1. **EventEmitter<TEvent>** (Type-safe event publishing):
   - Sends events to specific WebSocket connections
   - Generic type parameter ensures type safety: `EventEmitter<UploadEvent>`
   - Methods:
     - `subscribe(channelId, connection)` - Subscribe connection to events
     - `unsubscribe(channelId)` - Unsubscribe connection
     - `emit(channelId, event)` - Send event to all subscribers on channel

2. **EventBroadcaster** (Distributed pub/sub):
   - Publishes events across server instances
   - Implementations:
     - Memory-based (single process)
     - Redis Pub/Sub (distributed)
     - IORedis with Clustering (large scale)
   - Accessed via Context.Tag: `EventBroadcaster`

**Event Flow**:

```
Server Instance 1           EventBroadcaster          Server Instance 2
     │                            │                          │
     ├─ emit("upload:123") ──────→│ Pub/Sub across servers
     │                            ├──→ Instance 2 receives
     │                            │
Subscribers connected to:      EventEmitter              WebSocket Connections
- Instance 1 Emitter ◄───────────│───────────────────────→ Client 1
                                  │───────────────────────→ Client 2
                                  │───────────────────────→ Client 3
```

**Event Types**:

```typescript
// Upload events
{ type: "upload-progress", uploadId: "123", progress: 50, timestamp: "2024-10-22T..." }
{ type: "upload-complete", uploadId: "123", result: {...}, timestamp: "2024-10-22T..." }
{ type: "upload-failed", uploadId: "123", error: "...", timestamp: "2024-10-22T..." }

// Flow events
{ type: "flow-started", jobId: "job123", flowId: "456", timestamp: "2024-10-22T..." }
{ type: "flow-node-completed", jobId: "job123", nodeId: "resize", result: {...}, timestamp: "2024-10-22T..." }
{ type: "flow-completed", jobId: "job123", flowId: "456", result: {...}, timestamp: "2024-10-22T..." }
{ type: "flow-error", jobId: "job123", error: "...", timestamp: "2024-10-22T..." }

// All events include timestamp for ordering
```

**Implementation Pattern**:

Events are accessed through Effect Context.Tag service pattern:

```typescript
// Upload event emitter (for WebSocket progress)
const uploadEventEmitter = yield* UploadEventEmitter;
yield* uploadEventEmitter.emit("upload:123", {
  type: "upload-progress",
  uploadId: "123",
  progress: 50,
  timestamp: new Date().toISOString()
});

// Broadcaster for distributed pub/sub
const broadcaster = yield* EventBroadcaster;
yield* broadcaster.publish("uploads", {
  type: "upload-complete",
  uploadId: "123",
  // ... event data
});

// Multiple server instances subscribe to broadcaster
// Events propagate across instances automatically
```

**Usage Example**:
```typescript
const uploadEffect = Effect.gen(function* () {
  const server = yield* UploadServer;
  const eventEmitter = yield* UploadEventEmitter;

  // Subscribe WebSocket connection to upload events
  yield* server.subscribeToUploadEvents(uploadId, websocket);

  // During upload, events are automatically emitted
  const result = yield* server.upload(inputFile, clientId, stream);

  // Client receives events in real-time:
  // 1. upload-progress events (50%, 100%)
  // 2. upload-complete event with result

  return result;
});
```

## Package Architecture

### Layer 1: Core

```
@uploadista/core
├── Flow Engine (DAG processor)
├── Upload Server (base functionality)
├── Result types
├── Stream utilities
└── Logger
```

**Exports**:
- `createFlow()` - Create flow configurations
- `executeFlow()` - Run flow processing
- `createUploadServer()` - Base upload handling

### Layer 2: Clients

```
@uploadista/client-core (Platform-agnostic)
  ├── Authentication
  ├── HTTP client
  └── Upload strategy

@uploadista/client-browser
@uploadista/client-react
@uploadista/client-vue
@uploadista/client-expo
@uploadista/client-react-native
```

**Purpose**: Provide upload capability for different platforms

### Layer 3: Servers

```
@uploadista/server (Core server logic)
  ├── Authentication context
  ├── Upload request handling
  └── Middleware composition

@uploadista/adapters-hono (Cloudflare Workers)
@uploadista/adapters-express (Node.js)
@uploadista/adapters-fastify (Node.js, high performance)
```

**Purpose**: Framework-specific HTTP layer

### Layer 4: Infrastructure

```
Data Stores:
  @uploadista/data-store-s3
  @uploadista/data-store-azure
  @uploadista/data-store-gcs
  @uploadista/data-store-filesystem

KV Stores:
  @uploadista/kv-store-memory
  @uploadista/kv-store-redis
  @uploadista/kv-store-ioredis
  @uploadista/kv-store-cloudflare-kv
  @uploadista/kv-store-cloudflare-do
  @uploadista/kv-store-filesystem

Event System:
  @uploadista/event-broadcaster-memory
  @uploadista/event-broadcaster-redis
  @uploadista/event-broadcaster-ioredis
  @uploadista/event-emitter-websocket
  @uploadista/event-emitter-durable-object
```

**Purpose**: Pluggable infrastructure implementations

### Layer 5: Flow Nodes

```
@uploadista/flow-utility-nodes
  ├── Conditional
  ├── Merge
  ├── Multiplex
  └── Zip

@uploadista/flow-images-nodes
@uploadista/flow-images-sharp (Node.js)
@uploadista/flow-images-photon (Cloudflare edge)
@uploadista/flow-images-replicate (AI)
```

**Purpose**: Processing nodes for flow pipelines

## Upload Sequence

### 1. Client Initiates Upload

```
Client                                  Server
  │                                      │
  ├─ POST /uploads/init ───────────────→│
  │  { filename, size, mimeType }       │
  │                                      ├─ Create session in KV
  │                                      ├─ Validate size
  │                                      │
  │ ←─ { uploadId, chunkSize } ─────────┤
  │
```

### 2. Upload Chunks

```
Client                                  Server
  │                                      │
  ├─ PUT /uploads/{id}/chunks/0 ──────→│
  │  { binary data }                    ├─ Upload to S3
  │                                      ├─ Store chunk info in KV
  │ ←─ { etag, progress: 20% } ────────┤
  │                                      │
  ├─ WebSocket: "progress" event ◄─────┤
  │  { uploadId: "...", progress: 20% } │
  │
```

### 3. Upload Completes

```
Client                                  Server
  │                                      │
  ├─ POST /uploads/{id}/complete ─────→│
  │                                      ├─ Verify all chunks
  │                                      ├─ Complete multipart
  │                                      ├─ Update KV status
  │                                      │
  │ ←─ { result } ──────────────────────┤
  │                                      ├─ Trigger flow if needed
  │                                      ├─ Broadcast event
  │
```

### 4. Flow Processing (Async)

```
Server                              Flow Engine
  │                                    │
  ├─ Start flow ──────────────────────→│
  │  { flowId, fileId, params }        │
  │                                    ├─ Execute node 1
  │ ←─ flowStarted event ──────────────┤
  │                                    ├─ Update KV state
  │                                    ├─ Execute node 2
  │ ←─ nodeCompleted event ────────────┤
  │                                    ├─ Execute node 3
  │ ←─ flowCompleted event ────────────┤
  │
```

## Data Flow Model

### Upload File

```
File on Client
    ↓
[Chunked] (5MB default)
    ↓
HTTP PUT to Server
    ↓
DataStore (S3/Azure/GCS)
    ↓
KV Store (track progress)
    ↓
Event Broadcast (real-time updates)
    ↓
Flow Processing (async transformations)
    ↓
Result Stored (variants, metadata)
    ↓
Event: Upload Complete
```

### Process File

```
Input File in Storage
    ↓
Flow Engine
    ├─ Node 1: Conditional (is image?)
    │   ├─ YES: Resize
    │   └─ NO: Archive
    │
    ├─ Node 2: Process Variants
    │   ├─ Thumbnail (200x200)
    │   ├─ Medium (600x600)
    │   └─ Full (1200x1200)
    │
    ├─ Node 3: Optimize
    │   └─ Compress to WebP
    │
    └─ Node 4: Store Results
        └─ Upload to S3
            ↓
        Event: Processing Complete
```

## Architecture Patterns

### Pattern 1: Single Server (Development)

```
┌─────────────────────────────┐
│ Single Node.js Process      │
├─────────────────────────────┤
│ Express Server              │
│ Upload Handling             │
│ Flow Processing             │
│                             │
│ Memory:                     │
│ • KV Store (in-memory)      │
│ • Event Broadcaster         │
│                             │
│ External:                   │
│ • S3/Filesystem (storage)   │
│                             │
└─────────────────────────────┘
```

**Best For**: Development, testing, small deployments

### Pattern 2: Distributed (Production)

```
┌──────────────────────────────────────────────────────┐
│ Load Balancer (nginx/AWS ALB)                        │
└────────────┬────────────────────────────────────────┘
             │
    ┌────────┼────────┐
    ↓        ↓        ↓
┌────────┐ ┌────────┐ ┌────────┐
│Node.js │ │Node.js │ │Node.js │
│Server  │ │Server  │ │Server  │
│#1      │ │#2      │ │#3      │
└────────┘ └────────┘ └────────┘
    │        │        │
    └────────┼────────┘
             ↓
    ┌────────────────────┐
    │ Shared Redis       │
    │ • KV Store         │
    │ • Event Broadcast  │
    └────────────────────┘
             ↓
    ┌────────────────────┐
    │ S3 / Azure / GCS   │
    │ (File Storage)     │
    └────────────────────┘
```

**Best For**: Production, 10-1000 concurrent users

### Pattern 3: Global (Cloudflare Workers)

```
┌──────────────────────────────────────┐
│ Cloudflare Global Network (300+ edge)│
├──────────────────────────────────────┤
│ Hono Server @ Edge                   │
│ • Upload handling                    │
│ • Flow processing                    │
│                                      │
│ Cloudflare Infrastructure:           │
│ • KV Store (edge-deployed)           │
│ • Durable Objects (coordination)     │
│ • R2 Storage (S3-compatible)         │
└──────────────────────────────────────┘
```

**Best For**: Global users, serverless, zero ops

### Pattern 4: Hybrid (Serverless + Traditional)

```
┌────────────────────────────────────────────┐
│ CloudFlare Workers @ Edge                  │
│ • Fast upload reception                    │
│ • Distributed queuing                      │
└──────────────────────────────────────────┘
             ↓
┌────────────────────────────────────────────┐
│ AWS Lambda / GCP Cloud Functions           │
│ • Heavy processing (flows)                 │
│ • Image optimization                       │
│ • AI operations                            │
└──────────────────────────────────────────┘
             ↓
┌────────────────────────────────────────────┐
│ S3 / Azure / GCS                           │
│ • Final storage                            │
│ • Variants and artifacts                   │
└────────────────────────────────────────────┘
```

**Best For**: Scaling, cost optimization

## Authentication Flow

```
Client                Server            Auth Service
  │                    │                     │
  ├─ login ───────────→│                     │
  │ (username/pass)    ├─ Validate ─────────→│
  │                    │                     │
  │                    │ ←─ OK + Token ──────┤
  │                    │                     │
  │ ←─ Token ──────────┤                     │
  │                    │                     │
  ├─ Upload + Token ──→│                     │
  │                    ├─ Verify Token      │
  │                    │ (cache locally)    │
  │                    │                    │
  │ ←─ Upload OK ──────┤                     │
  │
```

**Token Strategies**:
1. **JWT**: Self-contained, cached locally
2. **Session Cookie**: Server-validated
3. **API Key**: Simple, suitable for services

## Scaling Considerations

### Horizontal Scaling (More Servers)

**Challenge**: Session consistency, event distribution

**Solution**: Use distributed KV + Event Broadcast
```
Server 1 ──┐
Server 2 ──┼──→ Redis (shared state)
Server 3 ──┘     Redis (event broadcast)
```

### Vertical Scaling (Bigger Server)

**Challenge**: Processing power for flows

**Solution**: Offload heavy operations
```
Upload Server (lightweight)
    ↓
Message Queue
    ↓
Worker Processes (heavy processing)
```

### Global Scaling (Multiple Regions)

**Challenge**: Upload location, storage replication

**Solution**: Edge deployment + replicated storage
```
User 1 (US) ──→ CloudFlare edge (US)
User 2 (EU) ──→ CloudFlare edge (EU)
              ↓
           S3 (replicated)
```

## Failure Handling

### Resumable Uploads

```
Upload Chunk 1: OK ✓
Upload Chunk 2: FAIL ✗
    ↓
[Connection Lost]
    ↓
Resume from Chunk 2
Upload Chunk 2: OK ✓
Upload Chunk 3: OK ✓
    ↓
Complete Upload ✓
```

**Key**: Track uploaded chunks in KV store

### Flow Retry

```
Node 1: Resize - OK ✓
Node 2: Optimize - FAIL (timeout)
    ↓
[Retry Strategy]
    ├─ Exponential backoff
    ├─ Dead letter queue
    └─ Admin notification
    ↓
Manual Retry or Auto-Retry
```

### Data Consistency

```
Upload Complete in KV: ✓
Flow Started: ✓
Flow Node 1: ✓
Flow Node 2: ✓
Store Results: ✓
Event Broadcast: FAIL ✗
    ↓
Result stored, but client doesn't know
    ↓
Polling fallback / Retry event
```

## Performance Characteristics

### Upload Performance

| Scenario | Latency | Throughput |
|----------|---------|-----------|
| Small file (1MB) | 100ms | 10MB/s |
| Large file (100MB) | 5-10s | 50MB/s |
| Multiple files | Parallelized | 100MB/s |
| Very large (1GB) | 30-60s | 50MB/s |

### Flow Processing

| Operation | Time | Backend |
|-----------|------|---------|
| Resize (Sharp) | 50-100ms | Node.js CPU |
| Optimize (Sharp) | 100-200ms | Node.js CPU |
| Resize (Photon) | 5-10ms | Edge (Cloudflare) |
| Remove BG (AI) | 5-15s | External API |
| Upscale (AI) | 10-20s | External API |

### Event Latency

| System | Latency | Scale |
|--------|---------|-------|
| Memory | < 1ms | Single process |
| Redis | 1-5ms | 10-1000 servers |
| WebSocket | 10-100ms | 1000-10000 clients |
| Durable Objects | < 5ms | Edge (global) |

## Troubleshooting Guide

### High Upload Latency

**Symptoms**: Slow chunk uploads

**Causes**:
1. Network connection issues
2. Server CPU/memory pressure
3. Storage backend throttling
4. Chunk size mismatch

**Solutions**:
- Increase chunk size (5MB → 50MB)
- Check server resources
- Verify storage quotas
- Use edge deployment (Cloudflare)

### Lost Sessions After Server Restart

**Symptoms**: Upload in progress lost when server crashes

**Cause**: KV store not persisted

**Solutions**:
- Use Redis instead of Memory KV
- Implement session recovery
- Add database backup strategy

### Events Not Reaching Clients

**Symptoms**: Clients don't get progress updates

**Cause**: Event broadcast misconfigured

**Solutions**:
- Verify WebSocket connection
- Check broadcaster health
- Review event system logs
- Implement polling fallback

### File Not Stored After Upload

**Symptoms**: Upload complete but file missing

**Cause**: Flow processing failed, data store error

**Solutions**:
- Check data store credentials
- Verify storage quotas
- Review flow node logs
- Add error tracking

## Next Steps

1. **Server Setup**: See [SERVER_SETUP.md](./SERVER_SETUP.md)
2. **Client Integration**: See [CLIENT_INTEGRATION.md](./CLIENT_INTEGRATION.md)
3. **Flow Processing**: See [FLOW_NODES.md](../packages/flow/FLOW_NODES.md)
4. **Deployment**: Choose architecture pattern and deploy

## Related Documentation

- [SERVER_SETUP.md](./SERVER_SETUP.md) - Step-by-step server setup
- [CLIENT_INTEGRATION.md](./CLIENT_INTEGRATION.md) - Frontend integration
- [FLOW_NODES.md](./packages/flow/FLOW_NODES.md) - Processing pipelines
- [@uploadista/core](../packages/core/README.md) - Core package
- [@uploadista/server](../packages/servers/server/README.md) - Server package
