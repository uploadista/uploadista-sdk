# @uploadista/kv-store-cloudflare-kv

Cloudflare KV-backed key-value store for Uploadista. Deploy globally distributed storage on Cloudflare's edge network with zero-downtime updates.

## Overview

The Cloudflare KV store uses the `@cloudflare/workers-types` KVNamespace API for storing state on Cloudflare's edge network. Perfect for:

- **Edge Deployment**: Store data globally at 300+ edge locations
- **Serverless Uploads**: Run on Cloudflare Workers with no origin server
- **Zero Cold Starts**: Pre-loaded KV namespaces at each edge
- **Low Latency**: ~10ms read/write latency from any location
- **Distributed by Default**: No replication config needed

Ideal for Hono-based upload servers deployed to Cloudflare Workers.

## Installation

```bash
npm install @uploadista/kv-store-cloudflare-kv
# or
pnpm add @uploadista/kv-store-cloudflare-kv
```

### Prerequisites

- Cloudflare Workers project with `wrangler`
- Cloudflare account with Workers enabled
- KV namespace created via `wrangler kv:namespace`

## Quick Start

```typescript
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
import { Effect } from "effect";

// In Cloudflare Worker environment, KV is provided as a binding
export default {
  fetch(request: Request, env: { KV_STORE: KVNamespace }) {
    const program = Effect.gen(function* () {
      // The cloudflareKvStore is automatically available
    });

    return Effect.runPromise(
      program.pipe(
        Effect.provide(cloudflareKvStore({ kv: env.KV_STORE }))
      )
    );
  },
};
```

## Features

- ✅ **Global Distribution**: Data replicated to 300+ edge locations
- ✅ **Low Latency**: Sub-second read/write operations
- ✅ **Serverless**: No origin server infrastructure needed
- ✅ **Auto-Scaling**: Handles traffic spikes automatically
- ✅ **Strong Consistency**: Atomic reads and writes
- ✅ **No Cold Starts**: Workers start in ~1ms
- ✅ **Type Safe**: Full TypeScript support

## API Reference

### Main Exports

#### `cloudflareKvStore(config: CloudflareKvStoreConfig): Layer<BaseKvStoreService>`

Creates an Effect layer providing the `BaseKvStoreService` backed by Cloudflare KV.

```typescript
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";

export default {
  fetch(request: Request, env: { KV_STORE: KVNamespace }) {
    const layer = cloudflareKvStore({ kv: env.KV_STORE });
  },
};
```

**Configuration**:

```typescript
type CloudflareKvStoreConfig = {
  kv: KVNamespace<string>; // Cloudflare KV namespace binding
};
```

#### `makeCloudflareBaseKvStore(config: CloudflareKvStoreConfig): BaseKvStore`

Factory function for creating a KV store with an existing KVNamespace.

```typescript
import { makeCloudflareBaseKvStore } from "@uploadista/kv-store-cloudflare-kv";

const store = makeCloudflareBaseKvStore({ kv: env.KV_STORE });
```

### Available Operations

The Cloudflare KV store implements the `BaseKvStore` interface:

#### `get(key: string): Effect<string | null>`

Retrieve a value by key.

```typescript
const program = Effect.gen(function* () {
  const value = yield* store.get("upload:abc123");
  // Returns immediately from nearest edge location
});
```

#### `set(key: string, value: string): Effect<void>`

Store a string value globally.

```typescript
const program = Effect.gen(function* () {
  yield* store.set("upload:abc123", JSON.stringify(metadata));
  // Replicated to all edge locations within seconds
});
```

#### `delete(key: string): Effect<void>`

Remove a key globally.

```typescript
const program = Effect.gen(function* () {
  yield* store.delete("upload:abc123");
});
```

#### `list(keyPrefix: string): Effect<string[]>`

List keys matching a prefix.

```typescript
const program = Effect.gen(function* () {
  const keys = yield* store.list("upload:");
  // Returns matching keys
});
```

## Configuration

### Basic Setup in wrangler.toml

```toml
name = "uploadista-worker"
type = "javascript"

[env.production]
kv_namespaces = [
  { binding = "KV_STORE", id = "abc123def456", preview_id = "preview789" }
]

[env.staging]
kv_namespaces = [
  { binding = "KV_STORE", id = "staging-id", preview_id = "staging-preview" }
]
```

### Worker Environment Setup

```typescript
export interface Env {
  KV_STORE: KVNamespace<string>;
  ENVIRONMENT: "production" | "staging" | "development";
}

export default {
  async fetch(request: Request, env: Env) {
    const program = Effect.gen(function* () {
      // Use env.KV_STORE
    });

    return Effect.runPromise(
      program.pipe(
        Effect.provide(cloudflareKvStore({ kv: env.KV_STORE }))
      )
    );
  },
};
```

### Environment-Specific Configuration

```typescript
export default {
  async fetch(request: Request, env: Env) {
    const isProduction = env.ENVIRONMENT === "production";

    const program = Effect.gen(function* () {
      // Use KV with environment awareness
      const cacheKey = isProduction ? "cache:prod" : "cache:dev";
    });

    return Effect.runPromise(
      program.pipe(
        Effect.provide(cloudflareKvStore({ kv: env.KV_STORE }))
      )
    );
  },
};
```

## Examples

### Example 1: Cloudflare Workers Upload Server

Complete serverless upload handler:

```typescript
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
import { uploadServer } from "@uploadista/server";
import { Effect } from "effect";

export interface Env {
  KV_STORE: KVNamespace;
  BUCKET: R2Bucket; // Cloudflare R2 for file storage
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/upload" && request.method === "POST") {
      const program = Effect.gen(function* () {
        const server = yield* uploadServer;

        // Create upload session
        const upload = yield* server.createUpload(
          {
            filename: "user-file.pdf",
            size: 5242880,
            mimeType: "application/pdf",
          },
          "client:123"
        );

        return new Response(
          JSON.stringify({
            uploadId: upload.id,
            chunkSize: 1048576,
          })
        );
      });

      return Effect.runPromise(
        program.pipe(
          Effect.provide(cloudflareKvStore({ kv: env.KV_STORE }))
        )
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
```

### Example 2: Request Deduplication

Use KV to prevent duplicate uploads:

```typescript
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
import { Effect } from "effect";

const dedupKey = (clientId: string, checksum: string) =>
  `dedup:${clientId}:${checksum}`;

const checkDedup = (kv: KVNamespace, clientId: string, checksum: string) =>
  Effect.gen(function* () {
    const key = dedupKey(clientId, checksum);
    const existing = yield* Effect.tryPromise({
      try: () => kv.get(key),
      catch: () => null,
    });

    if (existing) {
      return JSON.parse(existing); // Return existing upload
    }

    return null; // New upload
  });

const recordDedup = (
  kv: KVNamespace,
  clientId: string,
  checksum: string,
  uploadId: string
) =>
  Effect.gen(function* () {
    const key = dedupKey(clientId, checksum);
    yield* Effect.tryPromise({
      try: () =>
        kv.put(key, JSON.stringify({ uploadId }), {
          expirationTtl: 86400, // 24 hours
        }),
      catch: () => null,
    });
  });

// Usage in worker
export default {
  async fetch(request: Request, env: Env) {
    const existing = yield* checkDedup(env.KV_STORE, clientId, checksum);

    if (existing) {
      return new Response(JSON.stringify(existing));
    }

    // Create new upload...
    yield* recordDedup(env.KV_STORE, clientId, checksum, uploadId);
  },
};
```

### Example 3: Cache-Aside Pattern

Use KV for upload metadata caching:

```typescript
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";
import { Effect } from "effect";

const getUploadMetadata = (
  kv: KVNamespace,
  uploadId: string
) =>
  Effect.gen(function* () {
    // Check cache first
    const cached = yield* Effect.tryPromise({
      try: () => kv.get(`meta:${uploadId}`),
      catch: () => null,
    });

    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from source (e.g., database)
    const metadata = yield* fetchFromDatabase(uploadId);

    // Cache result
    yield* Effect.tryPromise({
      try: () =>
        kv.put(`meta:${uploadId}`, JSON.stringify(metadata), {
          expirationTtl: 3600, // 1 hour
        }),
      catch: () => null,
    });

    return metadata;
  });
```

## Performance Characteristics

| Operation | Latency | Global Sync |
|-----------|---------|-------------|
| get()     | ~10ms   | Immediate  |
| set()     | ~50ms   | ~30 seconds |
| delete()  | ~50ms   | ~30 seconds |
| list()    | ~100ms  | N/A (edge) |

All operations are served from the nearest edge location to the client.

## Limits & Quotas

| Limit | Value |
|-------|-------|
| Key Size | 512 bytes max |
| Value Size | 25 MB max |
| Namespace Storage | Unlimited (Capped at billing) |
| Read/Write Rate | 10,000 ops/sec per namespace |
| API Requests | Included in Workers plan |

For most upload use cases, these limits are more than sufficient.

## Best Practices

### 1. Use Meaningful Key Prefixes

```typescript
// Good: Hierarchical, searchable
"upload:abc123"
"upload:abc123:chunk:0"
"session:user:xyz"

// Avoid: Unclear prefixes
"data1", "tmp", "x"
```

### 2. Set Expiration on Temporary Data

```typescript
// Temporary upload sessions expire after 24 hours
kv.put("session:user123", sessionData, {
  expirationTtl: 86400, // seconds
});
```

### 3. Handle Eventual Consistency

```typescript
// Wait for global replication
const isReplicated = yield* Effect.gen(function* () {
  const retries = 3;
  for (let i = 0; i < retries; i++) {
    const value = yield* store.get(key);
    if (value === expectedValue) {
      return true;
    }
    yield* Effect.sleep("100 millis");
  }
  return false;
});
```

### 4. Batch Operations Efficiently

```typescript
// Instead of individual writes
for (const item of items) {
  yield* store.set(`item:${item.id}`, JSON.stringify(item));
}

// Better: Batch at application level
// Or use metadata object
const batch = items.reduce(
  (acc, item) => ({ ...acc, [`item:${item.id}`]: item }),
  {}
);
```

## Deployment

### Local Development

```bash
# Create local KV namespace
wrangler kv:namespace create "KV_STORE" --preview

# Run locally
wrangler dev

# Access KV from http://localhost:8787
```

### Production Deployment

```bash
# Create production KV namespace
wrangler kv:namespace create "KV_STORE"

# Deploy to Cloudflare
wrangler publish

# Deploy to specific environment
wrangler publish --env production
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
      - uses: actions/setup-node@v3
        with:
          node-version: "18"
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

## Integration with Other Services

### Cloudflare R2 (File Storage)

```typescript
export interface Env {
  KV_STORE: KVNamespace;
  R2_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env) {
    // Use KV for metadata, R2 for files
    yield* store.set("file:abc", JSON.stringify({ bucket: "uploads", key: "abc.pdf" }));
    await env.R2_BUCKET.put("uploads/abc.pdf", file);
  },
};
```

### Cloudflare D1 (Database)

```typescript
export interface Env {
  KV_STORE: KVNamespace;
  DB: D1Database;
}

// Use KV for cache, D1 for persistent queries
const metadata = yield* getCachedMetadata(env.KV_STORE, id);
if (!metadata) {
  const result = await env.DB.prepare("SELECT * FROM uploads WHERE id = ?").bind(id).first();
  yield* store.set(`meta:${id}`, JSON.stringify(result));
}
```

## Related Packages

- [@uploadista/core](../../core) - Core types
- [@uploadista/adapters-hono](../../servers/adapters-hono) - Hono adapter for Cloudflare
- [@uploadista/data-store-s3](../../data-stores/s3) - For file storage on R2
- [@uploadista/server](../../servers/server) - Upload server
- [@uploadista/kv-store-cloudflare-do](../cloudflare-do) - Durable Objects for real-time state

## Troubleshooting

### "KV_STORE not found" Error

Ensure namespace is defined in `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "KV_STORE", id = "your-namespace-id" }
]
```

Then run `wrangler dev` to load bindings.

### Data Not Visible Across Regions

KV replication takes 30-60 seconds globally. For immediate consistency:

```typescript
// Read from same origin temporarily
const data = await kv.get(key, { cacheTtl: 0 });
```

### Memory/Size Limits

If hitting 25MB limit for single key:

1. Split data: `"upload:123:part:0"`, `"upload:123:part:1"`
2. Use R2 for actual files, KV only for metadata
3. Implement cleanup: set `expirationTtl` on temporary data

### Rate Limiting (10k ops/sec)

If hitting rate limit:

1. Implement batching on client
2. Use longer cache TTL
3. Request quota increase from Cloudflare

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [KV Stores Comparison Guide](../KV_STORES_COMPARISON.md) - Compare with other stores
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/) - Official docs
- [Cloudflare KV API Reference](https://developers.cloudflare.com/workers/runtime-apis/kv/) - KV API
- [Server Setup with Cloudflare](../../../SERVER_SETUP.md#cloudflare-workers) - Server deployment
- [@uploadista/adapters-hono](../../servers/adapters-hono) - Hono integration example
