# @uploadista/kv-store-cloudflare-do

Cloudflare Durable Objects-backed key-value store for Uploadista. Provides globally consistent state with real-time coordination at the edge.

## Overview

The Cloudflare Durable Objects store uses Durable Objects for storing upload and flow state with strong consistency guarantees. Perfect for:

- **Real-Time Consistency**: Strong consistency across all operations
- **WebSocket Coordination**: Persistent connections for real-time updates
- **Geo-Partitioned State**: Automatic data locality near users
- **Transactional Operations**: ACID guarantees for complex workflows
- **Edge Storage**: Data stored in the region closest to your users

More powerful than KV for upload scenarios requiring state coordination and real-time updates.

## Installation

```bash
npm install @uploadista/kv-store-cloudflare-do
# or
pnpm add @uploadista/kv-store-cloudflare-do
```

### Prerequisites

- Cloudflare Workers project with Durable Objects enabled
- `@cloudflare/workers-types` for type definitions
- Durable Objects bindings configured in `wrangler.toml`

## Quick Start

```typescript
import { cloudflareDoFlowJobKvStore } from "@uploadista/kv-store-cloudflare-do";
import type { FlowJob } from "@uploadista/core";
import { Effect } from "effect";

export interface Env {
  FLOW_JOB_STORE: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env) {
    const program = Effect.gen(function* () {
      // The flow job store is available
    });

    return Effect.runPromise(
      program.pipe(
        Effect.provide(
          cloudflareDoFlowJobKvStore({
            durableObject: env.FLOW_JOB_STORE,
          })
        )
      )
    );
  },
};
```

## Features

- ✅ **Strong Consistency**: ACID properties for state operations
- ✅ **Real-Time WebSockets**: Native support for persistent connections
- ✅ **Global Coordination**: Coordinate uploads across regions
- ✅ **Automatic Failover**: Built-in replication and redundancy
- ✅ **High Performance**: Single-digit millisecond latency
- ✅ **Stateful Workflows**: Maintain upload progress and flow execution state
- ✅ **Event Coordination**: Built-in for triggering flows after uploads

## API Reference

### Main Exports

#### `cloudflareDoFlowJobKvStore(config: CloudflareDoFlowStoreOptions): Layer<FlowJobKVStore>`

Creates an Effect layer for storing flow jobs with Durable Objects.

```typescript
import { cloudflareDoFlowJobKvStore } from "@uploadista/kv-store-cloudflare-do";

const layer = cloudflareDoFlowJobKvStore({
  durableObject: env.FLOW_JOB_STORE,
});
```

**Configuration**:

```typescript
type CloudflareDoFlowStoreOptions = {
  durableObject: FlowJobDurableObject<FlowJob>;
};
```

#### `makeCloudflareDoFlowStore<T extends FlowJob>(config: CloudflareDoFlowStoreOptions): KvStore<T>`

Factory function for creating a typed flow job store.

```typescript
import { makeCloudflareDoFlowStore } from "@uploadista/kv-store-cloudflare-do";
import type { FlowJob } from "@uploadista/core";

const store = makeCloudflareDoFlowStore<FlowJob>({
  durableObject: env.FLOW_JOB_STORE,
});
```

### Available Operations

The Durable Objects store implements the `KvStore<T>` interface:

#### `get(key: string): Effect<T>`

Retrieve a flow job. Throws error if not found.

```typescript
const program = Effect.gen(function* () {
  const job = yield* store.get("flow:abc123");
  // Strongly consistent read
});
```

#### `set(key: string, value: T): Effect<void>`

Store a flow job with ACID guarantees.

```typescript
const program = Effect.gen(function* () {
  yield* store.set("flow:abc123", flowJob);
  // Atomically persisted
});
```

#### `delete(key: string): Effect<void>`

Remove a flow job.

```typescript
const program = Effect.gen(function* () {
  yield* store.delete("flow:abc123");
});
```

## Configuration

### Basic Setup in wrangler.toml

```toml
name = "uploadista-worker"
main = "src/index.ts"

[[durable_objects.bindings]]
name = "FLOW_JOB_STORE"
class_name = "FlowJobDurableObject"

[env.production]
durable_objects = { bindings = [{name = "FLOW_JOB_STORE", class_name = "FlowJobDurableObject"}] }
routes = [
  { pattern = "uploadista.example.com/*", zone_name = "example.com" }
]
```

### Worker Environment Setup

```typescript
import { cloudflareDoFlowJobKvStore } from "@uploadista/kv-store-cloudflare-do";

export interface Env {
  FLOW_JOB_STORE: DurableObjectNamespace;
  ENVIRONMENT: "production" | "staging";
}

export default {
  async fetch(request: Request, env: Env) {
    const program = Effect.gen(function* () {
      // Use flow job store
    });

    return Effect.runPromise(
      program.pipe(
        Effect.provide(
          cloudflareDoFlowJobKvStore({
            durableObject: env.FLOW_JOB_STORE,
          })
        )
      )
    );
  },
};
```

## Examples

### Example 1: Tracking Long-Running Flow Jobs

```typescript
import { cloudflareDoFlowJobKvStore } from "@uploadista/kv-store-cloudflare-do";
import type { FlowJob } from "@uploadista/core";
import { Effect } from "effect";

export interface Env {
  FLOW_JOB_STORE: DurableObjectNamespace;
}

const trackFlowJob = (
  store: KvStore<FlowJob>,
  jobId: string,
  job: FlowJob
) =>
  Effect.gen(function* () {
    // Store initial job state
    yield* store.set(jobId, {
      ...job,
      status: "running",
      startedAt: new Date().toISOString(),
    });

    // Simulate processing
    yield* Effect.sleep("5 seconds");

    // Update with completion
    yield* store.set(jobId, {
      ...job,
      status: "completed",
      completedAt: new Date().toISOString(),
    });
  });

export default {
  async fetch(request: Request, env: Env) {
    const program = Effect.gen(function* () {
      const store = yield* cloudflareDoFlowJobKvStore({
        durableObject: env.FLOW_JOB_STORE,
      });

      yield* trackFlowJob(store, "job:abc123", flowJob);
    });

    return Effect.runPromise(program);
  },
};
```

### Example 2: WebSocket Progress Updates

```typescript
import { cloudflareDoFlowJobKvStore } from "@uploadista/kv-store-cloudflare-do";
import type { FlowJob } from "@uploadista/core";

export default {
  async fetch(request: Request, env: Env) {
    // Handle WebSocket for real-time progress
    if (request.headers.get("Upgrade") === "websocket") {
      const { 0: client, 1: server } = new WebSocketPair();

      // Store WebSocket connection
      const jobId = "job:abc123";
      const stub = env.FLOW_JOB_STORE.get(jobId);

      // Register connection with Durable Object
      await stub.registerWebSocket(server);

      return new Response(null, { status: 101, webSocket: client });
    }
  },
};
```

### Example 3: Coordinating Multi-Step Uploads

```typescript
import { cloudflareDoFlowJobKvStore } from "@uploadista/kv-store-cloudflare-do";
import type { FlowJob } from "@uploadista/core";
import { Effect } from "effect";

interface UploadState {
  uploadId: string;
  chunks: Map<number, boolean>;
  totalChunks: number;
  metadata: Record<string, string>;
}

const coordinateUpload = (store: KvStore<UploadState>, uploadId: string) =>
  Effect.gen(function* () {
    // Get current state
    const state = yield* store.get(uploadId);

    // Check if all chunks received
    const allChunksReceived = Array.from(state.chunks.values()).every(
      (v) => v
    );

    if (allChunksReceived) {
      // Trigger assembly
      yield* store.set(uploadId, {
        ...state,
        status: "assembling",
      });

      // Notify all connected clients via WebSocket
      // Real-time coordination across regions
    }
  });
```

## Performance Characteristics

| Operation | Latency | Consistency |
|-----------|---------|-------------|
| get()     | ~5ms    | Strong |
| set()     | ~10ms   | ACID |
| delete()  | ~10ms   | ACID |
| Multi-step | ~50ms  | Transactional |

All operations are strongly consistent - no eventual consistency delay.

## Limits & Quotas

| Limit | Value |
|-------|-------|
| Storage per Object | 128 MB |
| Request Rate | 1,000 r/s per object |
| Simultaneous WebSockets | 128 per object |
| Transactional Groups | 128 per transaction |

For most upload use cases, these are more than sufficient.

## Use Cases

### Perfect For

- ✅ Real-time upload tracking and progress
- ✅ Complex multi-step workflows with coordination
- ✅ WebSocket connections for client progress updates
- ✅ Flow jobs requiring transactional guarantees
- ✅ Partitioned state near users globally

### Better Alternatives

- ❌ Simple key-value storage → Use KV instead
- ❌ Large file uploads (>128MB per object) → Use KV + R2
- ❌ Extremely high write rates (>1000/sec) → Use database

## Comparison with KV

| Feature | Durable Objects | KV |
|---------|-----------------|-----|
| Consistency | Strong | Eventual (~30s) |
| WebSockets | Built-in | Requires separate service |
| Storage | 128 MB/object | Unlimited |
| Transaction Support | Full ACID | Individual ops only |
| Coordination | Excellent | Limited |
| Cost | Higher | Lower |
| Complexity | Higher | Lower |

## Scaling Patterns

### Single Durable Object

```
All Clients ──→ Single Durable Object ──→ State File
```

Suitable for modest traffic (1,000s of jobs).

### Partitioned by Upload ID

```
Client A ──→ Object 1 (uploads 0-999)  ──→ Storage
Client B ──→ Object 2 (uploads 1000-1999) ──→ Storage
Client C ──→ Object 3 (uploads 2000+) ──→ Storage
```

Automatic partitioning via `idFromName()`:

```typescript
const stub = env.FLOW_JOB_STORE.idFromName(uploadId);
```

### Hierarchical Objects

```
Upload Object (coordination) ┐
  ├─ Chunk Object 1         ├─ Flow Job Objects
  ├─ Chunk Object 2         │
  └─ Chunk Object 3         │
```

## Best Practices

### 1. Use Deterministic Naming

```typescript
// Good: Same input always gets same object
const id = durableObject.idFromName(`upload:${uploadId}`);

// Avoid: Random IDs (creates new objects every time)
const id = durableObject.newUniqueId();
```

### 2. Handle Durable Object Resets

```typescript
const getOrCreateJob = (store: KvStore<FlowJob>, jobId: string) =>
  Effect.gen(function* () {
    try {
      return yield* store.get(jobId);
    } catch (e) {
      // Object may have reset, recreate
      const newJob = createDefaultJob(jobId);
      yield* store.set(jobId, newJob);
      return newJob;
    }
  });
```

### 3. Clean Up Old Objects

```typescript
// Set cleanup schedule via middleware
export default {
  async fetch(request: Request, env: Env) {
    if (request.url.includes("/cleanup")) {
      // Delete old Durable Objects
      // Implement retention policy
    }
  },
};
```

### 4. Monitor Storage Usage

```typescript
const checkObjectSize = (stub: DurableObjectStub) =>
  Effect.gen(function* () {
    const info = yield* Effect.tryPromise({
      try: () => stub.getMetadata(),
      catch: () => null,
    });

    if (info && info.storageDelta > 100 * 1024 * 1024) {
      // Object exceeds 100MB, consider partitioning
    }
  });
```

## Deployment

### Local Development

```bash
# Enable Durable Objects in wrangler
wrangler dev

# Test locally with http://localhost:8787
```

### Production Deployment

```bash
# Deploy with Durable Objects
wrangler publish

# Migrate data between environments
wrangler migrations create move_objects

# Back up Durable Objects
wrangler durable-objects backup
```

### GitHub Actions

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          secrets: |
            DURABLE_OBJECT_ENCRYPTION_KEY
```

## Integration with Other Services

### Cloudflare KV for Hot Cache

```typescript
export interface Env {
  FLOW_JOB_STORE: DurableObjectNamespace;
  KV_CACHE: KVNamespace;
}

// Use DO for coordination, KV for fast reads
const getJobWithCache = (env: Env, jobId: string) =>
  Effect.gen(function* () {
    // Try KV first
    const cached = yield* Effect.tryPromise({
      try: () => env.KV_CACHE.get(`job:${jobId}`),
      catch: () => null,
    });

    if (cached) {
      return JSON.parse(cached);
    }

    // Fall back to DO
    const stub = env.FLOW_JOB_STORE.get(env.FLOW_JOB_STORE.idFromName(jobId));
    const job = yield* Effect.tryPromise({
      try: () => stub.getFlowJob(),
      catch: () => null,
    });

    // Cache in KV
    if (job) {
      yield* Effect.tryPromise({
        try: () =>
          env.KV_CACHE.put(`job:${jobId}`, JSON.stringify(job), {
            expirationTtl: 60,
          }),
        catch: () => null,
      });
    }

    return job;
  });
```

### Cloudflare D1 for Persistent Store

```typescript
// Use DO as cache layer, D1 as durable storage
const persistJob = (env: Env, job: FlowJob) =>
  Effect.gen(function* () {
    // Write to DO immediately
    yield* store.set(job.id, job);

    // Persist to D1 asynchronously
    await env.DB.prepare(
      "INSERT INTO jobs (id, data) VALUES (?, ?)"
    ).bind(job.id, JSON.stringify(job)).run();
  });
```

## Related Packages

- [@uploadista/core](../../core) - Core types
- [@uploadista/kv-store-cloudflare-kv](../cloudflare-kv) - For simpler use cases
- [@uploadista/adapters-hono](../../servers/adapters-hono) - Hono integration
- [@uploadista/event-emitter-durable-object](../../event-emitters/event-emitter-durable-object) - Real-time events
- [@uploadista/server](../../servers/server) - Upload server

## Troubleshooting

### "Durable Object not found" Error

Ensure binding is defined in `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "FLOW_JOB_STORE"
class_name = "FlowJobDurableObject"
```

Then re-run `wrangler dev`.

### Storage Exceeds 128MB

If Durable Object reaches storage limit:

1. Implement partitioning (multiple objects)
2. Archive old jobs to D1/R2
3. Clean up completed jobs regularly

### WebSocket Disconnections

For stable WebSocket connections:

```typescript
server.addEventListener("message", async (event) => {
  try {
    await processMessage(event.data);
  } catch (e) {
    // Reconnect client
    server.close(1011, "Server error");
  }
});
```

### High Request Latency

If requests are slow:

1. Check object partition count (may need more)
2. Reduce data size per operation
3. Implement batching on client

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [KV Stores Comparison Guide](../KV_STORES_COMPARISON.md) - Compare with other options
- [Cloudflare Durable Objects Docs](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/) - Official docs
- [Server Setup Guide](../../../SERVER_SETUP.md) - Deployment guide
- [Event Emitter with Durable Objects](../../event-emitters/event-emitter-durable-object/README.md) - Real-time events
- [@uploadista/adapters-hono](../../servers/adapters-hono) - Hono integration for Workers
