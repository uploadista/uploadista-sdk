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

## Core Concepts

### 1. Upload Server

Handles HTTP requests for file uploads with:
- **Resumable uploads**: Resume interrupted uploads
- **Chunked uploads**: Split large files into parts
- **Multipart uploads**: Handle multiple files
- **Authentication**: Validate requests with JWT/API keys or other authentication methods

```
Client                                Server
  │                                    │
  ├─ POST /uploads ──────────────────→ │ Create upload session (UploadFile)
  │                                    │ (stored in KV)
  │ ←─── { uploadId, url } ────────────┤
  │                                    │
  ├─ PATCH /uploads/{id} ────────────→ │ Upload chunk 1
  │    (part 1)                        │ (stored in S3)
  │ ←─── { offset: 5MB } ──────────────┤
  │ ◄─── WebSocket: progress ──────────┤ { uploadId, progress: 20% }
  │                                    │
  ├─ PATCH /uploads/{id} ────────────→ │ Upload chunk 2
  │    (part 2)                        │ (stored in S3)
  │ ←─── { offset: 10MB } ─────────────┤
  │ ◄─── WebSocket: progress ──────────┤ { uploadId, progress: 40% }
  │                                    │
  └─ PATCH /uploads/{id} ────────────→ │ Complete upload
       (finalize if complete)          │ (stored in S3)
       { finalize: true }              │ (trigger flow processing if configured)
                                       │
                                       ├─ Verify all chunks
                                       ├─ Complete multipart
                                       │ ◄─── WebSocket: complete ─────┤
                                       │ { uploadId, status: "completed" }
```

### 2. Flow Engine (DAG Processor)

A **Directed Acyclic Graph (DAG)** processor for file processing pipelines.

**Key Components**:
- **Nodes**: Processing units (input, processing, output)
- **Edges**: Data connections between nodes
- **Flow**: Collection of nodes + edges
- **Executor**: Runs nodes in dependency order

**Example Flow**:

```
Input (file)
    ↓
Conditional (is image?)
    ├─ YES → Resize → Optimize → S3 → Output
    └─ NO → Archive → S3 → Output
```

**Node Types**:

```typescript
// Input nodes: File entry point
type: "input"

// Processing nodes: Transformations
type: "resize" | "optimize" | "remove-background"

// Utility nodes: Control flow
type: "conditional" | "merge" | "multiplex" | "zip"

// Output nodes: Storage backends
type: "output"
```

**Example Configuration**:

```typescript
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import { createOptimizeNode } from "@uploadista/flow-images-nodes";

const inputNode = createInputNode("input");
const outputNode = createStorageNode("output");

const optimizeNode = createOptimizeNode("optimize", {
  quality: 80,
  format: "webp",
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
```

### 3. KV Store (State Management)

Stores upload session state, progress, metadata.

**Key Data Stored**:
```typescript
export type UploadFile = {
  id: string;
  offset: number;
  storage: {
    id: string;
    type: string;
    path?: string | undefined;
    uploadId?: string | undefined;
    bucket?: string | undefined;
  };
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
  size?: number | undefined;
  metadata?: Record<string, string | number | boolean> | undefined;
  creationDate?: string | undefined;
  url?: string | undefined;
  sizeIsDeferred?: boolean | undefined;
  checksum?: string | undefined;
  checksumAlgorithm?: string | undefined;
};
```

**Implementation Options**:

```
┌──────────────────────────────────────────────────────────┐
│ KV Store Interface                                       │
├──────────────────────────────────────────────────────────┤
│ • get(key): Get value                                    │
│ • set(key, value): Store value                           │
│ • delete(key): Remove value                              │
│ • list(pattern): List keys matching pattern              │
│ • watch(key, callback): Subscribe to changes             │
└──────────────────────────────────────────────────────────┘
         │
    ┌────┴────┬──────────────┬────────────────┐
    ↓         ↓              ↓                ↓
┌────────┐ ┌────────┐ ┌───────────┐ ┌─────────────┐
│Memory  │ │Redis   │ │CloudflareKV│ │DurableObj   │
│(dev)   │ │        │ │(edge)      │ │(consistent) │
└────────┘ └────────┘ └───────────┘ └─────────────┘
```

### 4. Data Store (File Storage)

Persists uploaded files to cloud storage or filesystem.

**Interface**:

```typescript
interface DataStore {
  // Single operations
  put(key: string, data: Readable): Promise<void>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;

  // Multipart operations (for large files)
  initMultipart(key: string): Promise<uploadId>;
  uploadPart(uploadId, partNumber, data): Promise<etag>;
  completeMultipart(uploadId, parts): Promise<void>;

  // Metadata
  getMetadata(key: string): Promise<ObjectMetadata>;
}
```

**Implementations**:

```
┌──────────────────────────────────────────────────────┐
│ Data Store Interface                                 │
├──────────────────────────────────────────────────────┤
│ • put(key, data): Upload file                        │
│ • get(key): Download file                            │
│ • delete(key): Remove file                           │
│ • initMultipart(key): Start chunked upload           │
│ • uploadPart(id, num, data): Upload chunk            │
│ • completeMultipart(id, parts): Finalize upload      │
└──────────────────────────────────────────────────────┘
         │
    ┌────┴────┬──────────┬───────────┬─────────────┐
    ↓         ↓          ↓           ↓             ↓
┌─────┐ ┌────────┐ ┌─────┐ ┌──────────┐ ┌─────────┐
│ S3  │ │Azure   │ │GCS  │ │Filesystem│ │R2       │
│     │ │Blob    │ │     │ │          │ │(edge)   │
└─────┘ └────────┘ └─────┘ └──────────┘ └─────────┘
```

### 5. Event System (Real-Time Updates)

Broadcasts upload status to connected clients.

**Two Components**:

1. **Broadcaster**: Publishes events to all subscribers
   - In-Memory (single process)
   - Redis Pub/Sub (distributed)
   - IORedis with Clustering (large scale)

2. **Emitter**: Sends events to specific connections
   - WebSocket (browser clients)
   - Durable Objects (edge)

**Event Flow**:

```
Server                    Broadcaster              Clients
  │                            │
  ├─ File uploaded ───────────→│ Publish event
  │                            │
  │ ←─ Get subscribers ────────┤
  │                            ├──→ Client 1
  │ ←─ send() ────────────────→│───→ Client 2
  │    to all                  │───→ Client 3
  │                            │
```

**Event Types**:

```typescript
// Progress events
{ type: "upload.progress", uploadId: "123", progress: 50 }

// Status events
{ type: "upload.complete", uploadId: "123", result: {...} }
{ type: "upload.error", uploadId: "123", error: "..." }

// Flow events
{ type: "flow.started", flowId: "456" }
{ type: "flow.node.completed", flowId: "456", nodeId: "resize" }
{ type: "flow.completed", flowId: "456", result: {...} }
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
