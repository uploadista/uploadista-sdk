# Server Setup Guide

Complete step-by-step guide for setting up an Uploadista server in production.

## Overview

This guide walks through building a complete upload server with:
- File uploads and processing
- Multiple storage backends
- State management (KV stores)
- Real-time event updates
- Flow-based processing pipelines

**Setup Time**: 15-30 minutes depending on cloud provider choice

## Prerequisites

- Node.js 18+
- npm or pnpm
- Choice of:
  - **Storage**: S3, Azure, GCS, or Filesystem
  - **Framework**: Hono, Express, or Fastify (all Node.js)
  - **KV Store**: Redis, IORedis, Filesystem, Memory (development), or Cloudflare KV/DO
  - **Events**: Redis Pub/Sub, IORedis, Memory (development), or WebSocket

## Quick Start (5 minutes)

### Option 1: Express + Node.js (Most popular)

Traditional Node.js server with proven tooling.

```bash
# Create directory
mkdir uploadista-server && cd uploadista-server

# Initialize
npm init -y
npm install express @uploadista/server @uploadista/adapters-express \
  @uploadista/data-store-filesystem @uploadista/kv-store-filesystem \
  @uploadista/event-emitter-websocket ws cors pino-http
```

Create `src/server.ts`:

```typescript
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createExpressUploadistaAdapter } from "@uploadista/adapters-express";
import { createFileStore } from "@uploadista/data-store-filesystem";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import { WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const port = process.env.PORT || 3000;

  // Middleware
  app.use(cors());
  app.use(pinoHttp());
  app.use((req, res, next) => {
    if (req.path.startsWith("/uploadista/")) {
      return next();
    }
    express.json()(req, res, next);
  });

  const kvStore = fileKvStore({
    directory: join(__dirname, "../uploads"),
  });

  const dataStore = createFileStore({
    directory: join(__dirname, "../uploads"),
    deliveryUrl: "http://localhost:3000",
  });

  // Simple flow
  const flows = (flowId: string) => {
    return createFlow({
      flowId: "simple-flow",
      name: "Simple Flow",
      nodes: {
        input: createInputNode("input"),
        output: createStorageNode("output"),
      },
      edges: [{ source: "input", target: "output" }],
    });
  };

  // Create upload adapter
  const uploadistaAdapter = await createExpressUploadistaAdapter({
    kvStore,
    dataStore,
    flows,
    plugins: [imagePlugin],
  });

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
  });

  // Upload endpoints
  app.all("/uploadista/api/*splat", uploadistaAdapter.handler);

  // WebSocket server
  const wss = new WebSocketServer({ server });
  wss.on("connection", uploadistaAdapter.websocketConnectionHandler);

  // Start server
  server.listen(port, () => {
    console.log(`🚀 Express server running on port ${port}`);
    console.log(`📁 Upload endpoint: http://localhost:${port}/uploadista/api/`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/uploadista/ws/`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log("🛑 Shutting down server...");
    wss.close(() => console.log("📡 WebSocket server closed"));
    server.close(() => console.log("🔌 HTTP server closed"));
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
```

Start: `npm run dev`

Your server is at `http://localhost:3000`

### Option 2: Hono + Node.js (Lightweight & Fast)

Modern, lightweight framework with excellent performance.

```bash
mkdir uploadista-server && cd uploadista-server
npm init -y
npm install hono @hono/node-server @hono/node-ws @uploadista/server \
  @uploadista/adapters-hono @uploadista/data-store-filesystem \
  @uploadista/kv-store-filesystem dotenv
```

Create `src/server.ts`:

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createHonoUploadistaAdapter } from "@uploadista/adapters-hono";
import { createFileStore } from "@uploadista/data-store-filesystem";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import { Hono } from "hono";
import { cors } from "hono/cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const kvStore = fileKvStore({
  directory: join(__dirname, "../uploads"),
});

const dataStore = createFileStore({
  directory: join(__dirname, "../uploads"),
  deliveryUrl: "http://localhost:3000",
});

// Simple flow
const flows = (flowId: string) => {
  return createFlow({
    flowId: "simple-flow",
    name: "Simple Flow",
    nodes: {
      input: createInputNode("input"),
      output: createStorageNode("output"),
    },
    edges: [{ source: "input", target: "output" }],
  });
};

const uploadistaAdapter = await createHonoUploadistaAdapter({
  dataStore,
  flows,
  plugins: [imagePlugin],
  kvStore,
});

app.use("*", cors());

app.on(
  ["HEAD", "POST", "GET", "PATCH"],
  ["/uploadista/api/**", "/uploadista/api"],
  uploadistaAdapter.handler,
);

app.on(
  ["GET"],
  ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
  upgradeWebSocket(uploadistaAdapter.websocketHandler),
);

const server = serve({ port: 3000, fetch: app.fetch }, (info) => {
  console.log(`🚀 Hono server running on port ${info.port}`);
});

injectWebSocket(server);
```

Deploy: `npm run start`

### Option 3: Fastify (High Performance)

Extremely fast with built-in streaming support.

```bash
mkdir uploadista-server && cd uploadista-server
npm init -y
npm install fastify @fastify/websocket @fastify/cors @uploadista/server \
  @uploadista/adapters-fastify @uploadista/data-store-filesystem \
  @uploadista/kv-store-filesystem
```

Create `src/server.ts`:

```typescript
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createFastifyUploadistaAdapter } from "@uploadista/adapters-fastify";
import { fileStore } from "@uploadista/data-store-filesystem";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import Fastify from "fastify";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function startServer() {
  const fastify = Fastify({ logger: true });
  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

  // Register plugins
  await fastify.register(websocket);
  await fastify.register(cors, {
    origin: ["*"],
    credentials: true,
  });

  const kvStore = fileKvStore({
    directory: join(__dirname, "../uploads"),
  });

  const dataStore = fileStore({
    directory: join(__dirname, "../uploads"),
    deliveryUrl: "http://localhost:3000/uploads",
  });

  // Simple flow
  const flows = (flowId: string) => {
    return createFlow({
      flowId: "simple-flow",
      name: "Simple Flow",
      nodes: {
        input: createInputNode("input"),
        output: createStorageNode("output"),
      },
      edges: [{ source: "input", target: "output" }],
    });
  };

  const uploadistaAdapter = await createFastifyUploadistaAdapter({
    dataStore,
    flows,
    plugins: [imagePlugin],
    kvStore,
  });

  // Add content type parser for binary data
  fastify.addContentTypeParser(
    "application/octet-stream",
    (_req, _payload, done) => {
      done(null);
    },
  );

  // Health check
  fastify.get("/health", async (_request, reply) => {
    reply.send({ status: "OK", timestamp: new Date().toISOString() });
  });

  // Upload endpoints
  fastify.all("/uploadista/api/*", async (request, reply) => {
    return uploadistaAdapter.handler(request, reply);
  });

  // WebSocket endpoints
  fastify.get(
    "/uploadista/ws/upload/:uploadId",
    { websocket: true },
    uploadistaAdapter.websocketHandler,
  );

  fastify.get(
    "/uploadista/ws/flow/:jobId",
    { websocket: true },
    uploadistaAdapter.websocketHandler,
  );

  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`🚀 Fastify server running on port ${port}`);
}

startServer().catch((error) => {
  console.error("❌ Failed to start server:", error);
  process.exit(1);
});
```

## Framework Comparison

### Hono

**Best For**: Modern, lightweight applications, serverless-ready

```
✓ Extremely fast
✓ Lightweight (~12KB)
✓ Built for edge/serverless
✓ Modern API design
✓ Works with Node.js, Bun, Deno
✓ Perfect for microservices
✗ Smaller ecosystem than Express
```

**Setup Time**: 5 minutes

### Express

**Best For**: Traditional Node.js, maximum flexibility

```
✓ Massive ecosystem
✓ Familiar to most devs
✓ Runs anywhere (VPS, Docker, Kubernetes)
✓ No request size limits
✓ Perfect for complex logic
✗ Need to manage infrastructure
✗ Slightly slower than alternatives
```

**Setup Time**: 10 minutes

### Fastify

**Best For**: High performance, streaming

```
✓ Extremely fast
✓ Minimal overhead
✓ Great plugin ecosystem
✓ Built-in streaming support
✓ Perfect for high-volume uploads
✗ Smaller community than Express
✗ Still requires infrastructure
```

**Setup Time**: 8 minutes

## Storage Backend Selection

### S3 (AWS/Cloudflare R2) - Most popular

```typescript
import { s3Store } from "@uploadista/data-store-s3";

const storage = s3Store({
  deliveryUrl: "https://my-bucket.s3.amazonaws.com",
  s3ClientConfig: {
    bucket: "my-uploads",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
});
```

**Best For**: Large scale, global, proven

**Setup**:
```bash
# Create S3 bucket
aws s3 mb s3://my-uploads --region us-east-1

# Create IAM policy
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:*",
    "Resource": "arn:aws:s3:::my-uploads/*"
  }]
}
```

### Azure Blob Storage

```typescript
import { azureStore } from "@uploadista/data-store-azure";

const storage = azureStore({
  deliveryUrl: "https://mystorageaccount.blob.core.windows.net/uploads",
  azureClientConfig: {
    container: "uploads",
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  },
});
```

**Best For**: Microsoft ecosystem, existing Azure infrastructure

### Google Cloud Storage

```typescript
import { gcsStore } from "@uploadista/data-store-gcs";

const storage = gcsStore({
  deliveryUrl: "https://storage.googleapis.com/my-uploads",
  gcsClientConfig: {
    bucket: "my-uploads",
    projectId: process.env.GCP_PROJECT_ID,
  },
});
```

**Best For**: Google ecosystem, BigQuery integration

### Filesystem (Development & Self-hosted)

```typescript
import { createFileStore } from "@uploadista/data-store-filesystem";

const storage = createFileStore({
  directory: "/uploads",
  deliveryUrl: "http://localhost:3000/uploads",
});
```

**Best For**: Development, testing, self-hosted

## State Management (KV Stores)

KV stores hold upload sessions, progress, metadata.

### Development: In-Memory

```typescript
import { memoryKvStore } from "@uploadista/kv-store-memory";

const kvStore = memoryKvStore();
```

**Good For**: Development, single-process

**Limitation**: Data lost on restart, single process only

### Development: Filesystem

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";

const kvStore = fileKvStore({
  directory: "/uploads",
});
```

**Good For**: Development, testing, persistent state

**Limitation**: Single server, not for production scale

### Production: Redis

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";

const redisClient = createClient({
  url: process.env.REDIS_URL, // redis://localhost:6379
});

await redisClient.connect();

const kvStore = redisKvStore({
  redis: redisClient,
});
```

**Best For**: Most production deployments

**Setup**:
```bash
# Docker
docker run -d -p 6379:6379 redis:7

# Or managed: AWS ElastiCache, Azure Cache, etc.
```

### Advanced: IORedis with Clustering

```typescript
import { ioredisKvStore } from "@uploadista/kv-store-ioredis";
import IORedis from "ioredis";

const redis = new IORedis.Cluster([
  { host: "redis-node-1", port: 6379 },
  { host: "redis-node-2", port: 6379 },
  { host: "redis-node-3", port: 6379 },
], {
  enableReadyCheck: false,
  enableOfflineQueue: true,
});

const kvStore = ioredisKvStore({ redis });
```

**Best For**: Large scale, failover required, global distribution

### Cloudflare: Durable Objects

```typescript
import { durableObjectKvStore } from "@uploadista/kv-store-cloudflare-do";

const kvStore = durableObjectKvStore(env.UPLOAD_STATE);
```

**Best For**: Cloudflare Workers, strong consistency, real-time coordination

### Cloudflare KV

```typescript
import { cloudflareKvStore } from "@uploadista/kv-store-cloudflare-kv";

const kvStore = cloudflareKvStore(env.UPLOAD_KV);
```

**Best For**: Cloudflare Workers, global edge caching

## Real-Time Events Setup

Events notify clients of upload progress, errors, completion.

### Development: In-Memory Broadcaster

```typescript
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const broadcaster = memoryEventBroadcaster();
```

**Note**: Only works within same Node.js process

### Production: Redis Pub/Sub

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createClient } from "@redis/client";

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

await redisClient.connect();

// Redis requires separate client for subscriber
const redisSubscriberClient = createClient({
  url: process.env.REDIS_URL,
});

await redisSubscriberClient.connect();

const broadcaster = redisEventBroadcaster({
  redis: redisClient,
  subscriberRedis: redisSubscriberClient,
});
```

**Setup**: Use same Redis instance as KV store

### Advanced: IORedis with Clustering

```typescript
import { ioredisEventBroadcaster } from "@uploadista/event-broadcaster-ioredis";
import IORedis from "ioredis";

const redis = new IORedis.Cluster([...cluster nodes...]);
const subscriber = new IORedis.Cluster([...cluster nodes...]);

const broadcaster = ioredisEventBroadcaster({
  redis,
  subscriberRedis: subscriber,
});
```

### WebSocket Emitter (Real-time to browsers)

WebSocket emitters are built into the framework adapters. When you create an adapter, WebSocket support is automatically configured.

For Express, the adapter expects a WebSocketServer:

```typescript
import { WebSocketServer } from "ws";
import { createServer } from "http";

const server = createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", uploadistaAdapter.websocketConnectionHandler);
```

For Hono and Fastify, WebSocket support is integrated directly into the routing.

## Complete Production Example

### Express + S3 + Redis

```typescript
import { createServer } from "node:http";
import { createExpressUploadistaAdapter } from "@uploadista/adapters-express";
import { s3Store } from "@uploadista/data-store-s3";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { imagePlugin } from "@uploadista/flow-images-sharp";
import { createClient } from "@redis/client";
import { createFlow, createInputNode, createStorageNode } from "@uploadista/core";
import cors from "cors";
import express from "express";
import pinoHttp from "pino-http";
import { WebSocketServer } from "ws";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/uploadista/ws" });

// Redis clients
const redisClient = createClient({
  url: process.env.REDIS_URL,
});
await redisClient.connect();

const redisSubscriberClient = createClient({
  url: process.env.REDIS_URL,
});
await redisSubscriberClient.connect();

// Storage
const storage = s3Store({
  deliveryUrl: process.env.S3_DELIVERY_URL,
  s3ClientConfig: {
    bucket: process.env.S3_BUCKET,
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  },
});

// State
const kvStore = redisKvStore({
  redis: redisClient,
});

// Events
const broadcaster = redisEventBroadcaster({
  redis: redisClient,
  subscriberRedis: redisSubscriberClient,
});

// Flows
const flows = (flowId: string) => {
  return createFlow({
    flowId: "simple-flow",
    name: "Simple Flow",
    nodes: {
      input: createInputNode("input"),
      output: createStorageNode("output"),
    },
    edges: [{ source: "input", target: "output" }],
  });
};

// Create adapter
const uploadistaAdapter = await createExpressUploadistaAdapter({
  dataStore: storage,
  kvStore,
  eventBroadcaster: broadcaster,
  flows,
  plugins: [imagePlugin],
});

// Middleware
app.use(cors());
app.use(pinoHttp());
app.use((req, res, next) => {
  if (req.path.startsWith("/uploadista/")) {
    return next();
  }
  express.json()(req, res, next);
});

// Routes
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.all("/uploadista/api/*splat", uploadistaAdapter.handler);

// WebSocket
wss.on("connection", uploadistaAdapter.websocketConnectionHandler);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/uploadista/ws`);
});
```

**Environment Variables**:
```bash
# Server
PORT=3000
NODE_ENV=production

# AWS S3
S3_BUCKET=my-uploads
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_DELIVERY_URL=https://my-uploads.s3.amazonaws.com

# Redis
REDIS_URL=redis://redis-1:6379
```

**Docker Deployment**:
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy code
COPY dist ./dist

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start
CMD ["node", "dist/server.js"]
```

## Flow Processing Setup

Process uploads through custom pipelines (resize images, compress, etc.).

### Simple: Single Resize

```typescript
import {
  createFlow,
  createInputNode,
  createStorageNode
} from "@uploadista/core";
import {
  createOptimizeNode,
  createResizeNode
} from "@uploadista/flow-images-nodes";

const flow = createFlow({
  flowId: "resize-flow",
  name: "Resize Flow",
  nodes: {
    input: createInputNode("input"),
    resize: createResizeNode("resize", {
      width: 1200,
      height: 800,
      fit: "cover",
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "resize" },
    { source: "resize", target: "output" },
  ],
});
```

### Advanced: Image optimization

```typescript
import {
  createFlow,
  createInputNode,
  createStorageNode
} from "@uploadista/core";
import { createOptimizeNode } from "@uploadista/flow-images-nodes";

const optimizeFlow = createFlow({
  flowId: "optimize-flow",
  name: "Optimize Flow",
  nodes: {
    input: createInputNode("input"),
    optimize: createOptimizeNode("optimize", {
      quality: 80,
      format: "webp",
    }),
    output: createStorageNode("output"),
  },
  edges: [
    { source: "input", target: "optimize" },
    { source: "optimize", target: "output" },
  ],
});
```

## Deployment Guide

### Option 1: Docker (Any cloud provider)

```bash
# Build image
docker build -t uploadista-server .

# Run locally
docker run -p 3000:3000 \
  -e REDIS_URL=redis://redis:6379 \
  -e S3_BUCKET=uploads \
  uploadista-server

# Push to registry
docker tag uploadista-server gcr.io/my-project/uploadista:latest
docker push gcr.io/my-project/uploadista:latest

# Deploy to Cloud Run
gcloud run deploy uploadista --image gcr.io/my-project/uploadista:latest \
  --platform managed \
  --region us-central1 \
  --set-env-vars REDIS_URL=$REDIS_URL,S3_BUCKET=$S3_BUCKET
```

### Option 2: Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uploadista-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: uploadista-server
  template:
    metadata:
      labels:
        app: uploadista-server
    spec:
      containers:
        - name: uploadista
          image: gcr.io/my-project/uploadista:latest
          ports:
            - containerPort: 3000
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: uploadista-secrets
                  key: redis-url
            - name: S3_BUCKET
              value: uploads
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: uploadista-service
spec:
  selector:
    app: uploadista-server
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer
```

Deploy:
```bash
kubectl apply -f deployment.yaml
kubectl get service uploadista-service
```

### Option 3: VPS (Traditional server)

```bash
# SSH into VPS
ssh root@your-vps.com

# Install Node.js
curl -sL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Redis
sudo apt-get install -y redis-server
sudo systemctl start redis-server

# Deploy app
git clone your-repo.git uploadista
cd uploadista
npm ci --only=production
npm run build

# Run with PM2
npm i -g pm2
pm2 start dist/server.js --name uploadista
pm2 save

# Setup nginx reverse proxy
sudo apt-get install -y nginx
# ... configure nginx to forward to localhost:3000

# Enable HTTPS
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Troubleshooting

### Uploads fail with 413 Payload Too Large

**Cause**: Server request size limit too small

**Express Fix**:
```typescript
app.use(express.json({ limit: "500mb" }));
app.use(express.raw({ limit: "500mb", type: "application/octet-stream" }));
```

**Hono Fix**:
Hono has no built-in body size limits. Check your hosting platform limits.

**Fastify Fix**:
```typescript
const fastify = Fastify({
  bodyLimit: 500 * 1024 * 1024, // 500MB
});
```

### WebSocket connections drop after 30s

**Cause**: Proxy timeout or load balancer timeout

**Fix**: Send heartbeat pings
```typescript
setInterval(() => {
  wss.clients.forEach((client) => {
    client.ping();
  });
}, 25000); // Every 25 seconds
```

### "Cannot find module '@uploadista/...'"

**Cause**: Dependencies not installed

**Fix**:
```bash
npm install @uploadista/adapters-express @uploadista/data-store-s3
# or verify in package.json they're listed
```

### S3 uploads extremely slow

**Cause**: Network issues or region mismatch

**Fix**: Use correct region and ensure network connectivity
```typescript
const storage = s3Store({
  deliveryUrl: process.env.S3_DELIVERY_URL,
  s3ClientConfig: {
    bucket: "my-uploads",
    region: "us-east-1", // Match your bucket region
  },
});
```

### Redis connection refused

**Cause**: Redis not running or wrong URL

**Fix**:
```bash
# Check if Redis running
redis-cli ping
# Should return PONG

# Check connection string
# Should be: redis://host:port or redis://password@host:port
```

## Performance Tuning

### Optimize for Large File Uploads

```typescript
// Use connection pooling for Redis
const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    keepAlive: true,
    noDelay: true,
  },
});

// Increase Express limits
app.use(express.json({ limit: "1gb" }));
```

### Optimize for Many Concurrent Uploads

```typescript
// Increase Redis connections
const broadcaster = redisEventBroadcaster({
  redis: redisClient,
  subscriberRedis: redisSubscriberClient,
});

// Increase Node.js file descriptor limit
// Set in environment: ulimit -n 65535
```

### Monitor Performance

```typescript
app.get("/metrics", (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };
  res.json(metrics);
});
```

## Next Steps

1. **Client Integration**: See client documentation for frontend setup
2. **Flow Processing**: See flow documentation for pipeline examples
3. **Production Checklist**:
   - [ ] Enable HTTPS/TLS
   - [ ] Configure CORS appropriately
   - [ ] Set up monitoring/logging
   - [ ] Configure backups for KV stores
   - [ ] Set up rate limiting
   - [ ] Add request validation
   - [ ] Monitor storage costs
   - [ ] Plan storage retention policies

## Related Documentation

- Data Stores Comparison - Storage backends
- KV Stores Comparison - State management
- Event System - Real-time events
- Flow Nodes - Processing pipelines
