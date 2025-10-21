# Server Setup Guide

Complete step-by-step guide for setting up an Uploadista server in production.

## Overview

This guide walks through building a complete upload server with:
- File uploads and processing
- Multiple storage backends
- State management (KV stores)
- Real-time event updates
- Authentication
- Flow-based processing pipelines

**Setup Time**: 15-30 minutes depending on cloud provider choice

## Prerequisites

- Node.js 18+ or Cloudflare Workers account
- npm or pnpm
- Choice of:
  - **Storage**: S3, Azure, GCS, or Filesystem
  - **Framework**: Hono (Cloudflare), Express (Node.js), or Fastify (Node.js)
  - **KV Store**: Redis, Memory (development), or Cloudflare KV
  - **Events**: Redis Pub/Sub or Cloudflare Durable Objects

## Quick Start (5 minutes)

### Option 1: Cloudflare Workers (Recommended for beginners)

Instant global deployment with minimal infrastructure.

```bash
# Create new project
npm create wrangler@latest uploadista-server
cd uploadista-server

# Install dependencies
npm install @uploadista/server @uploadista/adapters-hono @uploadista/data-store-s3
```

Create `src/index.ts`:

```typescript
import { Hono } from "hono";
import { createUploadServer } from "@uploadista/adapters-hono";
import { S3DataStore } from "@uploadista/data-store-s3";

const app = new Hono();

// Configure storage
const storage = new S3DataStore({
  bucket: "my-uploads",
  region: "us-east-1",
});

// Add upload routes
app.route("/api", createUploadServer({ storage }));

export default app;
```

Deploy:

```bash
wrangler publish
```

Your server is live at `https://uploadista-server.your-account.workers.dev`

### Option 2: Express + Node.js (Most popular)

Traditional Node.js server with proven tooling.

```bash
# Create directory
mkdir uploadista-server && cd uploadista-server

# Initialize
npm init -y
npm install express @uploadista/server @uploadista/adapters-express \
  @uploadista/data-store-s3 @uploadista/kv-store-redis \
  @uploadista/event-broadcaster-redis
```

Create `src/server.ts`:

```typescript
import express from "express";
import { createUploadServer } from "@uploadista/adapters-express";
import { S3DataStore } from "@uploadista/data-store-s3";
import { RedisKVStore } from "@uploadista/kv-store-redis";
import { RedisBroadcaster } from "@uploadista/event-broadcaster-redis";

const app = express();

const storage = new S3DataStore({ bucket: "my-uploads" });
const kvStore = new RedisKVStore({ url: process.env.REDIS_URL });
const broadcaster = new RedisBroadcaster({ url: process.env.REDIS_URL });

app.use(
  "/api",
  createUploadServer({
    storage,
    kvStore,
    broadcaster,
  })
);

app.listen(3000, () => console.log("Server running on port 3000"));
```

Start: `npm run dev`

Your server is at `http://localhost:3000`

## Framework Comparison

### Hono (Cloudflare Workers)

**Best For**: Global CDN, serverless, zero ops

```
✓ Deploy instantly
✓ Global edge locations
✓ No infrastructure management
✓ Scales automatically
✓ Perfect for small-medium projects
✗ Max 10 MB request body
✗ 30s timeout
✗ Cloudflare billing
```

**Setup Time**: 2 minutes

### Express

**Best For**: Traditional Node.js, maximum flexibility

```
✓ Massive ecosystem
✓ Familiar to most devs
✓ Runs anywhere (VPS, Docker, Kubernetes)
✓ No request size limits
✓ Perfect for complex logic
✗ Need to manage infrastructure
✗ Database setup required
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

### S3 (AWS) - Most popular

```typescript
import { S3DataStore } from "@uploadista/data-store-s3";

const storage = new S3DataStore({
  bucket: "my-uploads",
  region: "us-east-1",
  partSize: 5 * 1024 * 1024, // 5MB parts
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
import { AzureDataStore } from "@uploadista/data-store-azure";

const storage = new AzureDataStore({
  container: "uploads",
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
});
```

**Best For**: Microsoft ecosystem, existing Azure infrastructure

### Google Cloud Storage

```typescript
import { GCSDataStore } from "@uploadista/data-store-gcs";

const storage = new GCSDataStore({
  bucket: "my-uploads",
  projectId: process.env.GCP_PROJECT_ID,
});
```

**Best For**: Google ecosystem, BigQuery integration

### Filesystem (Development only)

```typescript
import { FilesystemDataStore } from "@uploadista/data-store-filesystem";

const storage = new FilesystemDataStore({
  basePath: "/uploads",
});
```

**Best For**: Development, testing, self-hosted

## State Management (KV Stores)

KV stores hold upload sessions, progress, metadata.

### Development: In-Memory

```typescript
import { MemoryKVStore } from "@uploadista/kv-store-memory";

const kvStore = new MemoryKVStore();
```

**Good For**: Development, single-process

**Limitation**: Data lost on restart, single process only

### Production: Redis

```typescript
import { RedisKVStore } from "@uploadista/kv-store-redis";

const kvStore = new RedisKVStore({
  url: process.env.REDIS_URL, // redis://localhost:6379
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
import { IORedisKVStore } from "@uploadista/kv-store-ioredis";

const kvStore = new IORedisKVStore({
  nodes: [
    { host: "redis-node-1", port: 6379 },
    { host: "redis-node-2", port: 6379 },
    { host: "redis-node-3", port: 6379 },
  ],
  options: {
    enableReadyCheck: false,
    enableOfflineQueue: true,
  },
});
```

**Best For**: Large scale, failover required, global distribution

### Cloudflare: Durable Objects

```typescript
import { DurableObjectKVStore } from "@uploadista/kv-store-cloudflare-do";

const kvStore = new DurableObjectKVStore(env.UPLOAD_STATE);
```

**Best For**: Cloudflare Workers, strong consistency, real-time coordination

## Real-Time Events Setup

Events notify clients of upload progress, errors, completion.

### Development: In-Memory Broadcaster

```typescript
import { MemoryBroadcaster } from "@uploadista/event-broadcaster-memory";

const broadcaster = new MemoryBroadcaster();
```

**Note**: Only works within same Node.js process

### Production: Redis Pub/Sub

```typescript
import { RedisBroadcaster } from "@uploadista/event-broadcaster-redis";

const broadcaster = new RedisBroadcaster({
  url: process.env.REDIS_URL,
});
```

**Setup**: Use same Redis instance as KV store

### Advanced: IORedis with Clustering

```typescript
import { IOREdisBroadcaster } from "@uploadista/event-broadcaster-ioredis";

const broadcaster = new IOREdisBroadcaster({
  nodes: [...cluster nodes...],
});
```

### WebSocket Emitter (Real-time to browsers)

```typescript
import { WebSocketEmitter } from "@uploadista/event-emitter-websocket";

const emitter = new WebSocketEmitter();

// In HTTP server:
app.ws("/api/uploads/stream", (ws, req) => {
  emitter.addConnection(ws);
  ws.on("close", () => emitter.removeConnection(ws));
});
```

## Authentication Setup

### Option 1: API Keys (Simple)

```typescript
import { createAuthMiddleware } from "@uploadista/server";

const authMiddleware = createAuthMiddleware({
  apiKey: process.env.API_KEY,
});

app.use("/api", authMiddleware);
```

**Use**: Internal services, third-party integrations

### Option 2: JWT (Recommended)

```typescript
import { createJWTMiddleware } from "@uploadista/server";

const authMiddleware = createJWTMiddleware({
  secret: process.env.JWT_SECRET,
  issuer: "my-auth-service",
});

app.use("/api", authMiddleware);
```

**Use**: Web apps, mobile apps, browser clients

**Token Generation**:
```typescript
import jwt from "jsonwebtoken";

const token = jwt.sign(
  { userId: "user-123", email: "user@example.com" },
  process.env.JWT_SECRET,
  { expiresIn: "1 hour", issuer: "my-auth-service" }
);
```

### Option 3: Session Cookies (Traditional web)

```typescript
import session from "express-session";
import { RedisStore } from "connect-redis";

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
```

## Complete Production Example

### Express + S3 + Redis

```typescript
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import { createUploadServer } from "@uploadista/adapters-express";
import { S3DataStore } from "@uploadista/data-store-s3";
import { RedisKVStore } from "@uploadista/kv-store-redis";
import { RedisBroadcaster } from "@uploadista/event-broadcaster-redis";
import { WebSocketEmitter } from "@uploadista/event-emitter-websocket";
import jwt from "jsonwebtoken";

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/api/stream" });

// Storage
const storage = new S3DataStore({
  bucket: process.env.S3_BUCKET,
  region: process.env.AWS_REGION,
});

// State
const kvStore = new RedisKVStore({
  url: process.env.REDIS_URL,
});

// Events
const broadcaster = new RedisBroadcaster({
  url: process.env.REDIS_URL,
});

const emitter = new WebSocketEmitter();

// WebSocket connections
wss.on("connection", (ws) => {
  emitter.addConnection(ws);
  ws.on("close", () => emitter.removeConnection(ws));
});

// Authentication middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

app.use(express.json());
app.use(authMiddleware);

// Upload routes
app.use(
  "/api",
  createUploadServer({
    storage,
    kvStore,
    broadcaster,
    emitter,
    context: async (req) => ({
      userId: req.user.id,
      email: req.user.email,
    }),
  })
);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/api/stream`);
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

# Redis
REDIS_URL=redis://redis-1:6379

# Auth
JWT_SECRET=your-secret-key-here
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

### Hono + Cloudflare Workers

```typescript
import { Hono } from "hono";
import { createUploadServer } from "@uploadista/adapters-hono";
import { S3DataStore } from "@uploadista/data-store-s3";
import { CloudflareKVStore } from "@uploadista/kv-store-cloudflare-kv";
import { CloudflareDOKVStore } from "@uploadista/kv-store-cloudflare-do";

export interface Env {
  UPLOAD_STATE: DurableObjectNamespace;
  UPLOAD_KV: KVNamespace;
  S3_BUCKET: string;
  AWS_REGION: string;
}

const app = new Hono<{ Bindings: Env }>();

app.post("/api/upload", async (c) => {
  const storage = new S3DataStore({
    bucket: c.env.S3_BUCKET,
    region: c.env.AWS_REGION,
  });

  const kvStore = new CloudflareDOKVStore(c.env.UPLOAD_STATE);

  const uploadServer = createUploadServer({ storage, kvStore });

  return uploadServer(c);
});

export default app;
```

**wrangler.toml**:
```toml
name = "uploadista-server"
type = "service-worker"
account_id = "your-account-id"

[env.production]
vars = { ENVIRONMENT = "production" }

[[r2_buckets]]
binding = "BUCKET"
bucket_name = "my-uploads"

[[durable_objects.bindings]]
name = "UPLOAD_STATE"
class_name = "UploadState"
script_name = "uploadista-server"
```

## Flow Processing Setup

Process uploads through custom pipelines (resize images, compress, etc.).

### Simple: Single Resize

```typescript
import { createFlowProcessor } from "@uploadista/core";
import { sharpImagePlugin } from "@uploadista/flow-images-sharp";

const flow = createFlowProcessor({
  nodes: [
    { id: "input", type: "input" },
    {
      id: "resize",
      type: "resize",
      params: { width: 1200, height: 800, fit: "cover" },
    },
    { id: "store", type: "s3" },
    { id: "output", type: "output" },
  ],
});
```

### Advanced: Image variants + compression

```typescript
const productImageFlow = createFlowProcessor({
  nodes: [
    { id: "input", type: "input" },
    // Split into 3 variants
    { id: "split", type: "multiplex", params: { outputCount: 3 } },
    // Thumbnail
    {
      id: "thumb",
      type: "resize",
      params: { width: 200, height: 200, fit: "cover" },
    },
    // Medium
    {
      id: "medium",
      type: "resize",
      params: { width: 600, height: 600, fit: "contain" },
    },
    // Full size
    {
      id: "full",
      type: "optimize",
      params: { quality: 90, format: "webp" },
    },
    { id: "store", type: "s3" },
    { id: "output", type: "output" },
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
```typescript
app.post("/api/upload", async (c) => {
  const body = await c.req.arrayBuffer();
  // body size can be large
});
```

### WebSocket connections drop after 30s

**Cause**: Proxy timeout or CloudFlare timeout

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

**Cause**: Default part size too small, bad AWS configuration

**Fix**:
```typescript
const storage = new S3DataStore({
  bucket: "my-uploads",
  partSize: 50 * 1024 * 1024, // 50MB parts (larger = faster)
  concurrency: 4, // Parallel uploads
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
// Increase part size
const storage = new S3DataStore({
  partSize: 100 * 1024 * 1024, // 100MB
});

// Use connection pooling
const kvStore = new RedisKVStore({
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: null, // Better for high concurrency
});

// Increase Express limits
app.use(express.json({ limit: "1gb" }));
```

### Optimize for Many Concurrent Uploads

```typescript
// Increase Redis connections
const broadcaster = new RedisBroadcaster({
  url: process.env.REDIS_URL,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Increase Node.js file descriptor limit
// Set in environment: ulimit -n 65535
```

### Monitor Performance

```typescript
import { EventBroadcaster } from "@uploadista/server";

app.get("/metrics", (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    activeUploads: store.getActiveUploads(),
  };
  res.json(metrics);
});
```

## Next Steps

1. **Client Integration**: See [CLIENT_INTEGRATION.md](./CLIENT_INTEGRATION.md) for frontend setup
2. **Flow Processing**: See [FLOW_NODES.md](./packages/flow/FLOW_NODES.md) for pipeline examples
3. **Production Checklist**:
   - [ ] Enable HTTPS/TLS
   - [ ] Configure CORS appropriately
   - [ ] Set up monitoring/logging
   - [ ] Configure backups for KV stores
   - [ ] Set up rate limiting
   - [ ] Add request validation
   - [ ] Monitor storage costs
   - [ ] Plan storage retention policies

## Related Guides

- [DATA_STORES_COMPARISON.md](./packages/data-stores/DATA_STORES_COMPARISON.md) - Storage backends
- [KV_STORES_COMPARISON.md](./packages/kv-stores/KV_STORES_COMPARISON.md) - State management
- [EVENT_SYSTEM.md](./packages/EVENT_SYSTEM.md) - Real-time events
- [FLOW_NODES.md](./packages/flow/FLOW_NODES.md) - Processing pipelines
- [@uploadista/adapters-express](./packages/servers/adapters-express/README.md)
- [@uploadista/adapters-hono](./packages/servers/adapters-hono/README.md)
- [@uploadista/adapters-fastify](./packages/servers/adapters-fastify/README.md)
