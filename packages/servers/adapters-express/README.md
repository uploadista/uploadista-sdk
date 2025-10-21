# @uploadista/adapters-express

Uploadista adapter for Express - Run upload servers on Node.js with Express.

Provides a complete file upload and flow processing server for Express with manual WebSocket setup, authentication middleware, and support for standard Node.js hosting (Heroku, Railway, VPS, etc.).

## Features

- **Node.js Compatible** - Run on any Node.js 18+ environment
- **Express Middleware** - Integrates with Express request/response patterns
- **WebSocket Support** - Use `ws` package for real-time progress
- **Authentication** - Flexible middleware for JWT or custom auth
- **Multi-Cloud Storage** - S3, Azure, GCS, or filesystem
- **Redis Support** - Distributed deployments with Redis KV store
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/adapters-express express ws
# or
pnpm add @uploadista/adapters-express express ws
```

## Requirements

- Node.js 18+
- Express 4.0 or 5.0+
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Basic Express Server

```typescript
import express from "express";
import { createExpressUploadistaAdapter } from "@uploadista/adapters-express";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const app = express();

// Create adapter
const adapter = await createExpressUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: (flowId, clientId) => createFlowsEffect(flowId, clientId),
});

// Mount HTTP handler
app.use(`/${adapter.baseUrl}`, (req, res) => {
  adapter.handler(req, res);
});

// WebSocket server
import http from "http";
import WebSocket from "ws";

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  adapter.websocketConnectionHandler(ws, req);
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
```

### 2. Add Authentication

```typescript
const adapter = await createExpressUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  authMiddleware: async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return null;

    try {
      const payload = await verifyToken(token);
      return {
        clientId: payload.sub,
        permissions: payload.permissions,
      };
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return null;
    }
  },
  authCacheConfig: { maxSize: 5000, ttl: 3600000 },
});
```

### 3. Express Middleware Setup

```typescript
import express, { Request, Response, NextFunction } from "express";

const app = express();

// Body parser for JSON
app.use(express.json({ limit: "50mb" }));

// CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(","),
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// Logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Mount adapter
app.use(`/${adapter.baseUrl}`, (req: Request, res: Response) => {
  adapter.handler(req, res);
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
```

## Configuration

### `ExpressUploadistaAdapterOptions`

```typescript
type ExpressUploadistaAdapterOptions = {
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
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<AuthResult>;
  authCacheConfig?: AuthCacheConfig;
  bufferedDataStore?: Layer.Layer<UploadFileDataStore>;
};
```

## API Routes

Routes are available at `/{baseUrl}/api/`:

```
POST   /uploadista/api/upload
       Create new upload

GET    /uploadista/api/upload/:uploadId
       Get upload status

PATCH  /uploadista/api/upload/:uploadId
       Upload chunk

POST   /uploadista/api/flow/:flowId/:storageId
       Execute flow

GET    /uploadista/api/jobs/:jobId/status
       Get job status

PATCH  /uploadista/api/jobs/:jobId/continue/:nodeId
       Continue flow
```

## WebSocket Integration

### Using `ws` Package

```typescript
import WebSocket from "ws";
import http from "http";

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  // Pass to adapter
  adapter.websocketConnectionHandler(ws, req);

  ws.on("message", (data) => {
    // Adapter handles messages internally
  });

  ws.on("close", () => {
    console.log("Client disconnected");
  });
});

server.listen(3000);
```

### Using Socket.io (Alternative)

```typescript
import { Server } from "socket.io";

const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  socket.on("subscribe", (channels) => {
    channels.forEach((ch) => socket.join(ch));
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Emit events from adapter
const eventEmitter = /* ... */;
eventEmitter.on("upload:progress", (data) => {
  io.emit(`upload:${data.uploadId}`, data);
});
```

## Complete Server Example

```typescript
import express, { Express, Request, Response } from "express";
import http from "http";
import WebSocket from "ws";
import cors from "cors";
import { createExpressUploadistaAdapter } from "@uploadista/adapters-express";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { verify } from "jsonwebtoken";

const app: Express = express();

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(cors());

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// Create adapter
const adapter = await createExpressUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: createFlowsEffect,
  authMiddleware: async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return null;

    try {
      const payload = verify(token, process.env.JWT_SECRET!);
      return {
        clientId: (payload as any).sub,
        permissions: (payload as any).permissions || [],
      };
    } catch {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return null;
    }
  },
  authCacheConfig: { maxSize: 5000, ttl: 3600000 },
});

// Mount adapter
app.use(`/${adapter.baseUrl}`, (req: Request, res: Response) => {
  adapter.handler(req, res);
});

// Error handler
app.use((err: any, req: Request, res: Response) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  adapter.websocketConnectionHandler(ws, req);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default server;
```

## Environment Configuration

### .env File

```env
NODE_ENV=production
PORT=3000

# AWS S3
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=us-east-1
S3_BUCKET=uploads-prod

# Redis (for KV store and events)
REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_SECRET=your-jwt-secret

# CORS
ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
```

## Docker Deployment

### Dockerfile

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

### docker-compose.yml

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
    depends_on:
      - redis

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

## Request Examples

### Create Upload

```bash
curl -X POST http://localhost:3000/uploadista/api/upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "filename": "document.pdf",
    "size": 5242880,
    "metadata": {"type": "document"}
  }'
```

### Upload Chunk

```bash
curl -X PATCH http://localhost:3000/uploadista/api/upload/upload-123 \
  -H "Content-Range: bytes 0-1048575/5242880" \
  -H "Authorization: Bearer TOKEN" \
  --data-binary @chunk.bin
```

## Error Codes

- `400 VALIDATION_ERROR` - Invalid request
- `404 NOT_FOUND` - Upload/flow not found
- `409 CONFLICT` - Invalid chunk offset
- `413 PAYLOAD_TOO_LARGE` - File too large
- `500 INTERNAL_ERROR` - Server error

## Performance Tips

1. Use clustering for multiple CPU cores
2. Enable Redis for distributed deployments
3. Configure appropriate chunk sizes
4. Use reverse proxy (nginx) for load balancing
5. Monitor memory and disk usage

## Deployment Options

- **VPS**: Deploy with PM2 or systemd
- **Heroku**: Use Procfile and Redis add-on
- **Railway**: Direct GitHub integration
- **Docker**: Container deployment
- **AWS**: ECS, Lambda (with custom runtime)
- **DigitalOcean**: App Platform or VPS

## Related Packages

- **[@uploadista/server](../server/)** - Core server utilities
- **[@uploadista/adapters-hono](../adapters-hono/)** - Hono adapter
- **[@uploadista/adapters-fastify](../adapters-fastify/)** - Fastify adapter
- **[@uploadista/core](../../core/)** - Core engine
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/data-store-s3](../../data-stores/s3/)** - AWS S3 storage

## Troubleshooting

### WebSocket Connection Refused
Ensure `ws` server is created and `websocketConnectionHandler` is called on connection.

### Memory Leaks
Check WebSocket connections are properly closed. Use `nodejs --inspect` for profiling.

### Slow Uploads
Use Redis for distributed deployments. Increase chunk size. Monitor network throughput.

## License

MIT
