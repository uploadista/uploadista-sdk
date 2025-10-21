# @uploadista/adapters-fastify

Uploadista adapter for Fastify - High-performance upload servers on Node.js.

Provides a complete file upload and flow processing server for Fastify with built-in WebSocket support via `@fastify/websocket`, authentication middleware, and optimization for fast uploads on modern Node.js.

## Features

- **High Performance** - Fastify's speed with zero-overhead abstractions
- **WebSocket Built-in** - Native `@fastify/websocket` plugin integration
- **TypeScript First** - Full type safety and IDE support
- **Multi-Cloud** - S3, Azure, GCS, filesystem storage
- **Distributed** - Redis support for multi-instance deployments
- **Comprehensive Logging** - Built-in request logging
- **Effect Layers** - Pure functional dependency injection

## Installation

```bash
npm install @uploadista/adapters-fastify fastify @fastify/websocket
# or
pnpm add @uploadista/adapters-fastify fastify @fastify/websocket
```

## Requirements

- Node.js 18+
- Fastify 4.0 or 5.0+
- @fastify/websocket 10.0+
- TypeScript 5.0+ (optional)

## Quick Start

### 1. Create Fastify Server

```typescript
import Fastify from "fastify";
import WebSocket from "@fastify/websocket";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const fastify = Fastify({
  logger: true,
});

// Register WebSocket plugin
await fastify.register(WebSocket);

// Create adapter
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: (flowId, clientId) => createFlowsEffect(flowId, clientId),
});

// Register HTTP routes
fastify.all(`/${adapter.baseUrl}/*`, async (req, res) => {
  await adapter.handler(req, res);
});

// Register WebSocket route
fastify.get("/ws", { websocket: true }, (socket, req) => {
  adapter.websocketHandler(socket, req);
});

// Start server
await fastify.listen({ port: 3000 });
```

### 2. Add Authentication

```typescript
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  authMiddleware: async (req, reply) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return null;

    try {
      const payload = await fastify.jwt.verify(token);
      return {
        clientId: payload.sub as string,
        permissions: (payload.permissions as string[]) ?? [],
      };
    } catch {
      reply.code(401).send({ error: "Unauthorized" });
      return null;
    }
  },
  authCacheConfig: { maxSize: 5000, ttl: 3600000 },
});
```

### 3. Full Example with Plugins

```typescript
import Fastify, { FastifyInstance } from "fastify";
import WebSocket from "@fastify/websocket";
import JwT from "@fastify/jwt";
import Cors from "@fastify/cors";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: {
      target: "pino-pretty",
    },
  },
});

// Register plugins
await fastify.register(Cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(","),
});
await fastify.register(JwT, {
  secret: process.env.JWT_SECRET!,
});
await fastify.register(WebSocket);

// Create adapter
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: createFlowsEffect,
  authMiddleware: async (req, reply) => {
    try {
      await req.jwtVerify();
      const payload = req.user as any;
      return {
        clientId: payload.sub,
        permissions: payload.permissions || [],
      };
    } catch {
      return null;
    }
  },
  authCacheConfig: { maxSize: 5000, ttl: 3600000 },
});

// Health check
fastify.get("/health", async (req, reply) => {
  return { status: "ok" };
});

// Mount adapter
fastify.all(`/${adapter.baseUrl}/*`, async (req, res) => {
  return adapter.handler(req, res);
});

// WebSocket
fastify.get("/ws", { websocket: true }, (socket, req) => {
  adapter.websocketHandler(socket, req);
});

// Start
const start = async () => {
  await fastify.listen({ port: 3000, host: "0.0.0.0" });
  fastify.log.info("Server running on http://localhost:3000");
};

start().catch(fastify.log.error);
```

## Configuration

### `FastifyUploadistaAdapterOptions`

```typescript
type FastifyUploadistaAdapterOptions = {
  // Required
  flows: (flowId: string, clientId: string | null) =>
    Effect.Effect<unknown, unknown, unknown>;
  dataStore: Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>;
  kvStore: Layer.Layer<BaseKvStoreService>;

  // Optional
  baseUrl?: string; // Default: "uploadista"
  eventEmitter?: Layer.Layer<BaseEventEmitterService>;
  eventBroadcaster?: Layer.Layer<any>;
  generateId?: Layer.Layer<GenerateId>;
  authMiddleware?: (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;
  bufferedDataStore?: Layer.Layer<UploadFileDataStore>;
};
```

## API Routes

```
POST   /uploadista/api/upload           Create upload
GET    /uploadista/api/upload/:id       Get status
PATCH  /uploadista/api/upload/:id       Upload chunk

POST   /uploadista/api/flow/:id/:storage  Execute flow
GET    /uploadista/api/jobs/:id/status    Get job status
PATCH  /uploadista/api/jobs/:id/continue  Continue flow

WS     /ws                              WebSocket events
```

## WebSocket Events

### Subscribe to Events

```typescript
socket.send(JSON.stringify({
  type: "subscribe",
  channels: ["upload:*", "flow:*", "job:*"],
}));
```

### Receive Events

```typescript
socket.on("message", (data) => {
  const message = JSON.parse(data.toString());

  if (message.type === "upload.progress") {
    // { uploadId, progress, bytesUploaded, totalBytes }
  }

  if (message.type === "upload.complete") {
    // { uploadId, result }
  }

  if (message.type === "flow.progress") {
    // { jobId, nodeId, progress }
  }

  if (message.type === "flow.complete") {
    // { jobId, result }
  }
});
```

## Complete Server Example

```typescript
import Fastify from "fastify";
import WebSocket from "@fastify/websocket";
import JwT from "@fastify/jwt";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
  },
});

// Security & Performance
await fastify.register(helmet);
await fastify.register(rateLimit, {
  max: 100,
  timeWindow: "15 minutes",
});
await fastify.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(","),
});

// Authentication
await fastify.register(JwT, {
  secret: process.env.JWT_SECRET!,
});

// WebSocket
await fastify.register(WebSocket);

// Create adapter
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: createFlowsEffect,
  authMiddleware: async (req, reply) => {
    try {
      await req.jwtVerify();
      return {
        clientId: (req.user as any).sub,
        permissions: (req.user as any).permissions || [],
      };
    } catch {
      return null;
    }
  },
});

// Routes
fastify.get("/health", () => ({ status: "ok" }));

fastify.all(`/${adapter.baseUrl}/*`, (req, res) =>
  adapter.handler(req, res),
);

fastify.get("/ws", { websocket: true }, (socket, req) => {
  adapter.websocketHandler(socket, req);
});

// Start
const start = async () => {
  await fastify.listen({ port: 3000, host: "0.0.0.0" });
};

start().catch(fastify.log.error);
```

## Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## Performance Configuration

### Production Settings

```typescript
const fastify = Fastify({
  bodyLimit: 50 * 1024 * 1024, // 50MB
  requestTimeout: 300000, // 5 minutes
  logger: {
    level: "info",
    serializers: {
      req: (req) => ({
        method: req.method,
        path: req.url,
      }),
    },
  },
});
```

### Connection Limits

```typescript
// Prevent too many concurrent connections
fastify.register(rateLimit, {
  max: 1000,
  cache: 10000,
  timeWindow: "1 minute",
});
```

## Request Examples

### Create Upload

```bash
curl -X POST http://localhost:3000/uploadista/api/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{"filename": "doc.pdf", "size": 1024000}'
```

### Upload Chunk

```bash
curl -X PATCH http://localhost:3000/uploadista/api/upload/upload-123 \
  -H "Content-Range: bytes 0-1047/1024000" \
  -H "Authorization: Bearer TOKEN" \
  --data-binary @chunk
```

## Environment Configuration

```env
NODE_ENV=production
LOG_LEVEL=info

PORT=3000
HOST=0.0.0.0

JWT_SECRET=your-secret-key
ALLOWED_ORIGINS=https://app.example.com

AWS_ACCESS_KEY_ID=key
AWS_SECRET_ACCESS_KEY=secret
AWS_REGION=us-east-1
S3_BUCKET=uploads

REDIS_URL=redis://localhost:6379
```

## Fastify Plugins Ecosystem

### Useful Plugins

```typescript
// Compression
await fastify.register(require("@fastify/compress"));

// Request ID
await fastify.register(require("@fastify/request-idlogger"));

// Multipart
await fastify.register(require("@fastify/multipart"), {
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Swagger (optional API docs)
await fastify.register(require("@fastify/swagger"));
```

## Error Handling

```typescript
// Global error handler
fastify.setErrorHandler((error, request, reply) => {
  fastify.log.error(error);
  reply.status(500).send({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
  });
});
```

## Monitoring & Logging

```typescript
// Custom logging
fastify.log.info({ uploadId: "123" }, "Upload started");
fastify.log.error({ err: error }, "Upload failed");

// Prometheus metrics (optional)
await fastify.register(require("@fastify/metrics-plugin"));
fastify.get("/metrics", async (req, reply) => {
  return reply.type("text/plain").send(fastify.metrics.client.register.metrics());
});
```

## Related Packages

- **[@uploadista/server](../server/)** - Core utilities
- **[@uploadista/adapters-hono](../adapters-hono/)** - Hono adapter
- **[@uploadista/adapters-express](../adapters-express/)** - Express adapter
- **[@uploadista/core](../../core/)** - Core engine
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/data-store-s3](../../data-stores/s3/)** - AWS S3 storage

## Troubleshooting

### WebSocket Connection Issues
Ensure `@fastify/websocket` is registered before routes.

### High Memory Usage
Reduce concurrent uploads. Increase chunk size. Use streaming.

### Connection Timeouts
Increase `requestTimeout` for large files.

## License

MIT
