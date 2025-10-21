# @uploadista/adapters-hono

Uploadista adapter for Hono - Deploy upload servers to Cloudflare Workers.

Provides a complete file upload and flow processing server for Hono with built-in WebSocket support, Durable Objects integration, and automatic request routing. Deploy to Cloudflare Workers, Cloudflare Pages Functions, or any Hono-compatible environment.

## Features

- **Cloudflare Workers** - Deploy on edge infrastructure with zero cold starts
- **Built-in WebSocket** - Native Hono WebSocket support for real-time progress
- **Durable Objects** - Persistent WebSocket connections via Cloudflare Durable Objects
- **Authentication** - Flexible middleware for JWT, OAuth, or custom auth
- **Multi-Cloud Storage** - S3, Azure, GCS, or filesystem backends
- **Event Broadcasting** - Real-time updates via memory, Redis, or Durable Objects
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/adapters-hono hono
# or
pnpm add @uploadista/adapters-hono hono
```

## Requirements

- Hono 4.0+
- Cloudflare Workers or compatible environment
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Create Hono Application

```typescript
import { Hono } from "hono";
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const app = new Hono();

// Create adapter with configuration
const adapter = await createHonoUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: (flowId, clientId) => {
    // Return flows as Effect
    return createFlowsEffect(flowId, clientId);
  },
});

// Mount adapter
app.all(`/${adapter.baseUrl}/*`, adapter.handler);
app.get(`/ws`, adapter.websocketHandler);

export default app;
```

### 2. Configure Authentication

```typescript
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";

const adapter = await createHonoUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  // Optional auth middleware
  authMiddleware: async (c) => {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return null;

    try {
      // Verify JWT or other auth scheme
      const payload = await verifyToken(token);
      return {
        clientId: payload.sub,
        permissions: payload.permissions,
        metadata: { tier: payload.tier },
      };
    } catch {
      return null;
    }
  },
  // Optional auth caching
  authCacheConfig: {
    maxSize: 5000,
    ttl: 3600000, // 1 hour
  },
});
```

### 3. Set Up WebSocket

```typescript
import { Hono } from "hono";

const app = new Hono();

const adapter = await createHonoUploadistaAdapter({
  // ... configuration
});

// HTTP routes
app.all(`/${adapter.baseUrl}/*`, adapter.handler);

// WebSocket route
app.get("/ws", adapter.websocketHandler);

// Optional: Durable Objects for persistent WebSocket
if (adapter.durableObjectWebSocketHandler) {
  app.all("/ws-do", adapter.durableObjectWebSocketHandler);
}

export default app;
```

### 4. Deploy to Cloudflare Workers

```bash
# Build
npm run build

# Deploy (requires wrangler authentication)
npx wrangler publish
```

## Configuration

### `HonoUploadistaAdapterOptions`

Complete configuration for the Hono adapter.

```typescript
type HonoUploadistaAdapterOptions = {
  // Required
  flows: (flowId: string, clientId: string | null) =>
    Effect.Effect<unknown, unknown, unknown>;
  dataStore: Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>;
  kvStore: Layer.Layer<BaseKvStoreService>;

  // Optional
  baseUrl?: string; // Default: "uploadista"
  eventEmitter?: Layer.Layer<BaseEventEmitterService>;
  eventBroadcaster?: Layer.Layer<any>; // For broadcasting events
  generateId?: Layer.Layer<GenerateId>;
  authMiddleware?: (c: Context) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;
  metricsLayer?: Layer.Layer<any>;
  withTracing?: boolean; // Enable OpenTelemetry tracing
  bufferedDataStore?: Layer.Layer<UploadFileDataStore>;
  durableObjectWebSocket?: {
    namespace: DurableObjectNamespace;
  };
};
```

**Properties**:

- `flows` - Factory function to create flows by ID
- `dataStore` - File storage implementation (required)
- `kvStore` - Job metadata storage (required)
- `baseUrl` - Base path for routes (default: "uploadista")
- `eventEmitter` - Event emitter for progress updates
- `eventBroadcaster` - Broadcast events to other instances
- `generateId` - Custom ID generation
- `authMiddleware` - Optional authentication function
- `authCacheConfig` - Auth context caching configuration
- `metricsLayer` - Optional metrics/observability
- `withTracing` - Enable distributed tracing
- `bufferedDataStore` - Optional performance optimization
- `durableObjectWebSocket` - Enable persistent WebSocket via Durable Objects

### Chunk Size Configuration

```typescript
// Fast networks (WiFi on Cloudflare)
const honoAdapter = await createHonoUploadistaAdapter({
  dataStore: s3DataStore,
  kvStore: cfDurableObjectKvStore,
  // ... CloudFront will handle larger chunks well
});

// Slow networks or large files
const honoAdapter = await createHonoUploadistaAdapter({
  dataStore: s3DataStore.pipe(
    Layer.map((store) => ({
      ...store,
      chunkSize: 512 * 1024, // 512KB chunks
    })),
  ),
  kvStore: cfDurableObjectKvStore,
});
```

## API Routes

All routes use base path (default: `/uploadista/api/`):

### Upload Routes

```
POST   /uploadista/api/upload
       Create new upload

GET    /uploadista/api/upload/:uploadId
       Get upload status and metadata

PATCH  /uploadista/api/upload/:uploadId
       Upload chunk (includes offset in headers)
```

### Flow Routes

```
POST   /uploadista/api/flow/:flowId/:storageId
       Start flow execution with optional upload

GET    /uploadista/api/flow/:flowId
       Get flow metadata and schema

PATCH  /uploadista/api/jobs/:jobId/continue/:nodeId
       Continue paused flow node
```

### Job Status Routes

```
GET    /uploadista/api/jobs/:jobId/status
       Get job status and progress
```

### WebSocket

```
GET /ws
    WebSocket connection for real-time events
```

## Request/Response Examples

### Create Upload

```bash
curl -X POST http://localhost:8787/uploadista/api/upload \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "document.pdf",
    "size": 5242880,
    "metadata": {"type": "document"}
  }'

# Response:
{
  "uploadId": "upload-abc123",
  "status": "pending",
  "progress": 0,
  "chunkSize": 1048576
}
```

### Upload Chunk

```bash
curl -X PATCH http://localhost:8787/uploadista/api/upload/upload-abc123 \
  -H "Content-Range: bytes 0-1048575/5242880" \
  --data-binary @chunk1.bin

# Response:
{
  "uploadId": "upload-abc123",
  "status": "uploading",
  "bytesReceived": 1048576,
  "progress": 20
}
```

### Get Upload Status

```bash
curl http://localhost:8787/uploadista/api/upload/upload-abc123

# Response:
{
  "uploadId": "upload-abc123",
  "filename": "document.pdf",
  "status": "success",
  "bytesReceived": 5242880,
  "progress": 100,
  "url": "s3://bucket/uploads/upload-abc123"
}
```

### WebSocket Connection

```typescript
const ws = new WebSocket("ws://localhost:8787/ws");

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);

  if (message.type === "upload.progress") {
    console.log(`Upload ${message.uploadId}: ${message.progress}%`);
  }

  if (message.type === "upload.complete") {
    console.log(`Upload complete:`, message.result);
  }

  if (message.type === "flow.progress") {
    console.log(`Flow ${message.jobId} at node ${message.nodeId}`);
  }
};

ws.send(JSON.stringify({
  type: "subscribe",
  channels: ["upload:*", "flow:*"],
}));
```

## Authentication Examples

### JWT Authentication

```typescript
import { verify } from "hono/jwt";

const adapter = await createHonoUploadistaAdapter({
  dataStore,
  kvStore,
  authMiddleware: async (c) => {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return null;

    try {
      const payload = await verify(token, c.env.JWT_SECRET);
      return {
        clientId: payload.sub as string,
        permissions: (payload.permissions as string[]) ?? [],
        metadata: {
          email: payload.email,
          tier: payload.tier,
        },
      };
    } catch {
      return null;
    }
  },
});
```

### Custom Auth Header

```typescript
const adapter = await createHonoUploadistaAdapter({
  dataStore,
  kvStore,
  authMiddleware: async (c) => {
    const apiKey = c.req.header("X-API-Key");
    if (!apiKey) return null;

    // Validate API key
    const client = await db.clients.findByApiKey(apiKey);
    if (!client) return null;

    return {
      clientId: client.id,
      permissions: client.permissions,
      metadata: { tier: client.tier },
    };
  },
});
```

## Cloudflare Workers Configuration

Create `wrangler.toml`:

```toml
name = "uploadista-server"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
routes = [
  { pattern = "api.example.com/uploadista/*", zone_id = "your-zone-id" }
]

[env.production.vars]
ENVIRONMENT = "production"

[env.production.kv_namespaces]
- binding = "KV_JOBS"
  id = "your-namespace-id"

[[r2_buckets]]
binding = "R2_UPLOADS"
bucket_name = "uploads-prod"

[[services]]
binding = "JOBS_DO"
service = "jobs-durable-object"
environment = "production"
```

Environment variables:

```bash
# .env.local
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
REDIS_URL=redis://localhost:6379

JWT_SECRET=your-jwt-secret
```

## Complete Server Example

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { createFlowsEffect } from "./flows";

type Env = {
  JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

// CORS for uploads from browser
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS?.split(","),
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Health check
app.get("/health", (c) => c.json({ status: "ok" }));

// Create adapter
const adapter = await createHonoUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: createFlowsEffect,

  // Authentication
  authMiddleware: async (c) => {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return null;

    try {
      const payload = await verify(token, c.env.JWT_SECRET);
      return {
        clientId: payload.sub as string,
        permissions: (payload.permissions as string[]) ?? [],
      };
    } catch {
      return null;
    }
  },

  // Cache auth contexts for performance
  authCacheConfig: {
    maxSize: 5000,
    ttl: 3600000,
  },
});

// Mount HTTP handlers
app.all(`/${adapter.baseUrl}/*`, adapter.handler);

// Mount WebSocket handler
app.get("/ws", adapter.websocketHandler);

export default app;
```

## Error Handling

Errors are returned with appropriate HTTP status codes:

```json
{
  "error": "Invalid upload ID format",
  "code": "VALIDATION_ERROR",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Common Error Codes**:
- `VALIDATION_ERROR` (400) - Invalid request parameters
- `NOT_FOUND` (404) - Upload or flow not found
- `CONFLICT` (409) - Invalid chunk offset
- `PAYLOAD_TOO_LARGE` (413) - File too large
- `GONE` (410) - Upload expired or deleted
- `INTERNAL_ERROR` (500) - Unexpected server error

## Performance Tips

1. **Batch WebSocket Updates** - Combine multiple events before sending
2. **Use Durable Objects** - For persistent WebSocket connections
3. **Enable Caching** - Cache auth contexts to avoid repeated validation
4. **Chunk Size** - Use 1-2MB chunks for Cloudflare Workers
5. **Event Broadcasting** - Use Redis for distributed deployments

## Deployment Checklist

- [ ] Configure environment variables (secrets, credentials)
- [ ] Set up data store (S3, Azure, GCS)
- [ ] Configure KV store (Durable Objects, Redis, Cloudflare KV)
- [ ] Set up authentication middleware
- [ ] Configure CORS origins
- [ ] Enable tracing/metrics if desired
- [ ] Test WebSocket connections
- [ ] Deploy to staging environment
- [ ] Run integration tests
- [ ] Monitor error logs and metrics
- [ ] Deploy to production

## TypeScript Support

Full TypeScript support with comprehensive types:

```typescript
import type {
  HonoUploadistaAdapterOptions,
  HonoUploadistaAdapter,
} from "@uploadista/adapters-hono";
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
```

## Related Packages

- **[@uploadista/server](../server/)** - Core server utilities
- **[@uploadista/adapters-express](../adapters-express/)** - Express adapter
- **[@uploadista/adapters-fastify](../adapters-fastify/)** - Fastify adapter
- **[@uploadista/core](../../core/)** - Core upload and flow engine
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/data-store-s3](../../data-stores/s3/)** - AWS S3 storage

## Troubleshooting

### WebSocket Connection Refused

Ensure WebSocket route is registered:
```typescript
app.get("/ws", adapter.websocketHandler);
```

### Uploads Timing Out

Increase chunk size or deployment timeout. Check cloud provider limits.

### High Memory Usage

Reduce concurrent uploads or increase chunk size (fewer chunks in memory).

### Performance Issues

- Enable auth caching
- Use Durable Objects for WebSocket
- Configure event broadcasting for multi-instance deployments

## License

MIT
