# @uploadista/server

Core server for Uploadista file upload and flow processing.

This package provides the unified `createUploadistaServer` function that combines upload handling, flow execution, and authentication into a single server instance. Use it with adapter packages (`@uploadista/adapters-hono`, `@uploadista/adapters-express`, `@uploadista/adapters-fastify`) to set up complete upload servers.

## Features

- **Unified Server** - Single `createUploadistaServer` function for all frameworks
- **Plugin System** - Extend with image processing, AI, and custom plugins
- **Authentication** - Built-in auth middleware support via adapters
- **Health Checks** - Kubernetes-compatible liveness/readiness probes
- **Observability** - OpenTelemetry tracing support
- **Circuit Breakers** - Built-in resilience patterns
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/server
# or
pnpm add @uploadista/server
```

Also install an adapter for your framework:

```bash
# Hono (recommended for Cloudflare Workers)
pnpm add @uploadista/adapters-hono hono

# Express
pnpm add @uploadista/adapters-express express

# Fastify
pnpm add @uploadista/adapters-fastify fastify
```

## Requirements

- Node.js 18+
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### Hono Example

```typescript
import { Hono } from "hono";
import { createUploadistaServer } from "@uploadista/server";
import { honoAdapter } from "@uploadista/adapters-hono";
import { s3Store } from "@uploadista/data-store-s3";
import { redisKvStore } from "@uploadista/kv-store-redis";

const app = new Hono();

const uploadistaServer = await createUploadistaServer({
  dataStore: s3Store({
    deliveryUrl: process.env.CDN_URL!,
    s3ClientConfig: {
      bucket: process.env.S3_BUCKET!,
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
  }),
  kvStore: redisKvStore({ redis: redisClient }),
  flows: (flowId, clientId) => createFlowEffect(flowId, clientId),
  adapter: honoAdapter(),
});

app.all("/uploadista/api/*", (c) => uploadistaServer.handler(c));

export default app;
```

### Express Example

```typescript
import express from "express";
import { createUploadistaServer } from "@uploadista/server";
import { expressAdapter } from "@uploadista/adapters-express";
import { fileStore } from "@uploadista/data-store-filesystem";
import { fileKvStore } from "@uploadista/kv-store-filesystem";

const app = express();
app.use(express.json({ limit: "50mb" }));

const uploadistaServer = await createUploadistaServer({
  dataStore: fileStore({ directory: "./uploads" }),
  kvStore: fileKvStore({ directory: "./uploads" }),
  flows: (flowId, clientId) => createFlowEffect(flowId, clientId),
  adapter: expressAdapter(),
});

app.all("/uploadista/api/*splat", (request, response, next) => {
  uploadistaServer.handler({ request, response, next });
});

app.listen(3000);
```

### Fastify Example

```typescript
import Fastify from "fastify";
import { createUploadistaServer } from "@uploadista/server";
import { fastifyAdapter } from "@uploadista/adapters-fastify";
import { fileStore } from "@uploadista/data-store-filesystem";
import { fileKvStore } from "@uploadista/kv-store-filesystem";

const fastify = Fastify({ logger: true });

const uploadistaServer = await createUploadistaServer({
  dataStore: fileStore({ directory: "./uploads" }),
  kvStore: fileKvStore({ directory: "./uploads" }),
  flows: (flowId, clientId) => createFlowEffect(flowId, clientId),
  adapter: fastifyAdapter(),
});

fastify.all("/uploadista/api/*", async (request, reply) => {
  return uploadistaServer.handler({ request, reply });
});

await fastify.listen({ port: 3000 });
```

## API Reference

### `createUploadistaServer(config)`

The main function to create an Uploadista server instance.

```typescript
const uploadistaServer = await createUploadistaServer({
  // Required
  dataStore: s3Store({ /* config */ }),
  kvStore: redisKvStore({ /* config */ }),
  flows: (flowId, clientId) => createFlowEffect(flowId, clientId),
  adapter: honoAdapter(),

  // Optional
  plugins: [imagePlugin],
  eventBroadcaster: redisEventBroadcaster({ /* config */ }),
  withTracing: true,
  baseUrl: "uploadista",
  circuitBreaker: true,
  healthCheck: { version: "1.0.0" },
  authCacheConfig: { maxSize: 10000, ttl: 3600000 },
});
```

### Configuration Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `dataStore` | `DataStoreConfig` | Yes | - | File storage backend (S3, Azure, GCS, filesystem) |
| `kvStore` | `Layer<BaseKvStoreService>` | Yes | - | Metadata storage (Redis, memory, filesystem) |
| `flows` | `(flowId, clientId) => Effect<Flow>` | Yes | - | Flow provider function |
| `adapter` | `ServerAdapter` | Yes | - | Framework adapter (Hono, Express, Fastify) |
| `plugins` | `PluginLayer[]` | No | `[]` | Processing plugins |
| `eventBroadcaster` | `Layer<EventBroadcasterService>` | No | Memory | Cross-instance event broadcasting |
| `withTracing` | `boolean` | No | `false` | Enable OpenTelemetry tracing |
| `observabilityLayer` | `Layer` | No | - | Custom observability layer |
| `baseUrl` | `string` | No | `"uploadista"` | API base path |
| `circuitBreaker` | `boolean` | No | `true` | Enable circuit breakers |
| `deadLetterQueue` | `boolean` | No | `false` | Enable DLQ for failed jobs |
| `healthCheck` | `HealthCheckConfig` | No | - | Health endpoint configuration |
| `authCacheConfig` | `AuthCacheConfig` | No | - | Auth caching configuration |

### Return Type

```typescript
interface UploadistaServer<TContext, TResponse, TWebSocketHandler> {
  handler: (req: TContext) => Promise<TResponse>;
  websocketHandler: TWebSocketHandler;
  baseUrl: string;
  dispose: () => Promise<void>;
}
```

### Authentication

Authentication is handled via the adapter's `authMiddleware`:

```typescript
adapter: honoAdapter({
  authMiddleware: async (c) => {
    const token = c.req.header("Authorization")?.split(" ")[1];
    if (!token) return null;

    const payload = await verifyJWT(token);
    return {
      clientId: payload.sub,
      permissions: payload.permissions || [],
    };
  },
})
```

#### `AuthContext`

```typescript
type AuthContext = {
  clientId: string;
  permissions?: string[];
  metadata?: Record<string, unknown>;
};
```

#### `AuthCacheConfig`

```typescript
type AuthCacheConfig = {
  maxSize?: number;  // Default: 10000
  ttl?: number;      // Default: 3600000 (1 hour)
};
```

### Error Handling

The server automatically handles errors and returns appropriate HTTP responses:

```typescript
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "@uploadista/server";

// Validation error (400)
throw new ValidationError("Invalid upload ID format");

// Not found (404)
throw new NotFoundError("Upload");

// Bad request (400)
throw new BadRequestError("Invalid JSON body");
```

## Health Check Endpoints

The server provides Kubernetes-compatible health check endpoints for production deployments.

### Available Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `/{baseUrl}/health` | Liveness probe | None (always returns healthy) |
| `/{baseUrl}/ready` | Readiness probe | Storage, KV store, event broadcaster |
| `/{baseUrl}/health/components` | Detailed status | All components + circuit breakers + DLQ |

Alternative paths `/healthz` and `/readyz` are also supported for Kubernetes compatibility.

### Response Format

Health endpoints support content negotiation via the `Accept` header:
- `Accept: application/json` - JSON response with full details
- `Accept: text/plain` - Simple text response (`OK`, `DEGRADED`, `UNHEALTHY`)

```json
{
  "status": "healthy",
  "timestamp": "2024-11-27T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600000,
  "components": {
    "storage": {
      "status": "healthy",
      "latency": 15,
      "lastCheck": "2024-11-27T10:30:00.000Z"
    },
    "kvStore": {
      "status": "healthy",
      "latency": 5,
      "lastCheck": "2024-11-27T10:30:00.000Z"
    }
  }
}
```

### Configuration

Configure health checks in your server setup:

```typescript
import { createUploadistaServer } from "@uploadista/server";

const server = createUploadistaServer({
  // ... other config
  healthCheck: {
    version: "1.0.0",           // Application version
    checkStorage: true,          // Enable storage health checks
    checkKvStore: true,          // Enable KV store health checks
    checkEventBroadcaster: false, // Disable event broadcaster checks
    timeout: 5000,               // Health check timeout in ms
  },
});
```

### Kubernetes Integration

Example Kubernetes deployment configuration:

```yaml
livenessProbe:
  httpGet:
    path: /uploadista/health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /uploadista/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
```

For complete documentation, see [docs/HEALTH_CHECKS.md](./docs/HEALTH_CHECKS.md).

## Framework Adapters

Three official adapters are available:

- **[@uploadista/adapters-hono](../adapters-hono/)** - For Hono and Cloudflare Workers
- **[@uploadista/adapters-express](../adapters-express/)** - For Express.js
- **[@uploadista/adapters-fastify](../adapters-fastify/)** - For Fastify

## Complete Example with Plugins

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createClient } from "@redis/client";
import { createUploadistaServer } from "@uploadista/server";
import { honoAdapter } from "@uploadista/adapters-hono";
import { s3Store } from "@uploadista/data-store-s3";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { imagePlugin } from "@uploadista/flow-images-sharp";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Initialize Redis
const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

const redisSubscriberClient = createClient({ url: process.env.REDIS_URL });
await redisSubscriberClient.connect();

// Create server with all features
const uploadistaServer = await createUploadistaServer({
  dataStore: s3Store({
    deliveryUrl: process.env.CDN_URL!,
    s3ClientConfig: {
      bucket: process.env.S3_BUCKET!,
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    },
  }),
  kvStore: redisKvStore({ redis: redisClient }),
  eventBroadcaster: redisEventBroadcaster({
    redis: redisClient,
    subscriberRedis: redisSubscriberClient,
  }),
  flows: (flowId, clientId) => createFlowEffect(flowId, clientId),
  plugins: [imagePlugin],
  adapter: honoAdapter({
    authMiddleware: async (c) => {
      const token = c.req.header("Authorization")?.split(" ")[1];
      if (!token) return null;
      const payload = await verifyJWT(token);
      return { clientId: payload.sub };
    },
  }),
  withTracing: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
});

// HTTP routes
app.all("/uploadista/api/*", (c) => uploadistaServer.handler(c));

// WebSocket routes for real-time progress
app.get(
  "/uploadista/ws/upload/:uploadId",
  upgradeWebSocket(uploadistaServer.websocketHandler)
);
app.get(
  "/uploadista/ws/flow/:jobId",
  upgradeWebSocket(uploadistaServer.websocketHandler)
);

const server = serve({ port: 3000, fetch: app.fetch });
injectWebSocket(server);

// Graceful shutdown
process.on("SIGTERM", async () => {
  server.close();
  await uploadistaServer.dispose();
  await redisClient.quit();
  await redisSubscriberClient.quit();
  process.exit(0);
});
```

## TypeScript Support

Full TypeScript support with comprehensive types:

```typescript
import type {
  AuthContext,
  AuthCacheConfig,
  UploadistaServerConfig,
  UploadistaServer,
} from "@uploadista/server";
```

## Related Packages

- **[@uploadista/core](../../core/)** - Core upload and flow engine
- **[@uploadista/adapters-hono](../adapters-hono/)** - Hono adapter
- **[@uploadista/adapters-express](../adapters-express/)** - Express adapter
- **[@uploadista/adapters-fastify](../adapters-fastify/)** - Fastify adapter
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/data-store-s3](../../data-stores/s3/)** - AWS S3 storage

## License

MIT
