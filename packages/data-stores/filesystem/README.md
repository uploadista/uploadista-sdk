# @uploadista/data-store-filesystem

Local filesystem data store for Uploadista - Store files on disk.

Provides file system-based storage perfect for development, testing, and self-hosted deployments. Supports sequential uploads with resumable transfers and automatic cleanup of old files.

## Features

- **Local Storage** - Files stored on server disk or shared volume
- **Resumable Uploads** - Resume failed transfers at specific offsets
- **Sequential Mode** - Safe, ordered chunk uploads
- **Auto-Cleanup** - Automatic expiration of incomplete uploads
- **Simple Setup** - No external services required
- **Full Observability** - Metrics and logging included
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/data-store-filesystem @uploadista/core
# or
pnpm add @uploadista/data-store-filesystem @uploadista/core
```

## Requirements

- Node.js 18+
- Writable disk space
- Linux/macOS/Windows
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Create Filesystem Data Store

```typescript
import { createFileStore } from "@uploadista/data-store-filesystem";
import { createUploadServerLayer } from "@uploadista/server";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { Effect } from "effect";

// Create file store
const fileStore = createFileStore({
  directory: "./uploads",
  deliveryUrl: "http://localhost:3000/uploads",
});

// Use in upload server
const uploadLayer = createUploadServerLayer({
  dataStore: fileStore,
  kvStore: memoryKvStore,
  eventEmitter: webSocketEventEmitter,
});
```

### 2. Configure Upload Directory

```typescript
import path from "path";
import { createFileStore } from "@uploadista/data-store-filesystem";

// Development
const devStore = createFileStore({
  directory: "./uploads",
  deliveryUrl: "http://localhost:3000/files",
});

// Production
const prodStore = createFileStore({
  directory: "/var/uploads",
  deliveryUrl: "https://cdn.example.com/files",
});

// Docker/Kubernetes (mounted volume)
const containerStore = createFileStore({
  directory: "/mnt/uploads",
  deliveryUrl: "https://uploads.example.com",
});
```

### 3. Serve Files

```typescript
import express from "express";
import path from "path";

const app = express();

// Serve uploaded files statically
app.use("/uploads", express.static("./uploads"));

// Or with caching headers
app.use("/uploads", express.static("./uploads", {
  maxAge: "1d",
  etag: false,
}));
```

## Configuration

### `FileStoreOptions`

```typescript
type FileStoreOptions = {
  // Required
  directory: string;        // Base directory for file storage (created if missing)
  deliveryUrl: string;      // URL prefix for serving files

  // Optional (from parent config)
  kvStore?: KvStore;        // Metadata store (defaults to in-memory)
};
```

### Upload Behavior

The filesystem store operates in **sequential mode** only:

```typescript
// Upload state tracking
// File 1: upload-123 (1MB file)
// ├── write chunk 0-512KB
// ├── write chunk 512KB-1MB
// └── complete
//
// Cannot write chunks out of order - must resume from last successful position
```

## Storage Layout

Files are stored with metadata:

```
./uploads/
├── upload-123/
│   ├── file.bin              # Actual file content
│   ├── .metadata.json        # Upload metadata
│   └── .locks/               # Concurrency locks
├── upload-456/
│   ├── file.bin
│   └── .metadata.json
└── .expiration.log           # Expiration tracking
```

Metadata example:
```json
{
  "id": "upload-123",
  "filename": "document.pdf",
  "size": 1048576,
  "uploadedAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-22T10:30:00Z",
  "mimeType": "application/pdf"
}
```

## Complete Server Example

```typescript
import express, { Express } from "express";
import path from "path";
import { createExpressUploadistaAdapter } from "@uploadista/adapters-express";
import { createFileStore } from "@uploadista/data-store-filesystem";
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import http from "http";
import WebSocket from "ws";

const app: Express = express();

// Serve uploaded files
app.use("/files", express.static("./uploads"));

// Create file store
const fileStore = createFileStore({
  directory: process.env.UPLOAD_DIR || "./uploads",
  deliveryUrl: process.env.DELIVERY_URL || "http://localhost:3000/files",
});

// Create adapter
const adapter = await createExpressUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore: fileStore,
  kvStore: memoryKvStore,
  eventEmitter: webSocketEventEmitter,
  eventBroadcaster: memoryEventBroadcaster,
  flows: createFlowsEffect,
});

// Mount HTTP handler
app.use(`/${adapter.baseUrl}`, (req, res) => {
  adapter.handler(req, res);
});

// WebSocket server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  adapter.websocketConnectionHandler(ws, req);
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log(`Files stored in: ${process.env.UPLOAD_DIR || './uploads'}`);
});
```

## Environment Configuration

### .env File

```env
# Storage
UPLOAD_DIR=./uploads
DELIVERY_URL=http://localhost:3000/files

# Or with subdirectory for temporary uploads
UPLOAD_DIR=/tmp/uploads

# Production with volume mount
UPLOAD_DIR=/mnt/persistent-storage/uploads
DELIVERY_URL=https://files.example.com
```

### Creating Upload Directory

```typescript
import fs from "fs";
import path from "path";

// Automatically created by the store
// But you can pre-create it:
const uploadDir = process.env.UPLOAD_DIR || "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true, mode: 0o755 });
}

const fileStore = createFileStore({
  directory: uploadDir,
  deliveryUrl: process.env.DELIVERY_URL,
});
```

## Use Cases

### Development

Perfect for local development without external dependencies:

```typescript
const devStore = createFileStore({
  directory: "./uploads",
  deliveryUrl: "http://localhost:3000/uploads",
});

// Server runs on your machine - files stored locally
```

### Testing

Use temporary directories for test isolation:

```typescript
import { tmpdir } from "os";
import path from "path";

const testDir = path.join(tmpdir(), `uploadista-test-${Date.now()}`);
const testStore = createFileStore({
  directory: testDir,
  deliveryUrl: "http://localhost:3000/uploads",
});

// Clean up after tests
afterEach(() => {
  fs.rmSync(testDir, { recursive: true });
});
```

### Docker/Kubernetes

Mount volumes for persistent storage:

```typescript
const k8sStore = createFileStore({
  directory: "/mnt/uploads",  // Kubernetes PersistentVolume
  deliveryUrl: "https://files.example.com",
});

// Deployment YAML:
// volumeMounts:
// - name: uploads-volume
//   mountPath: /mnt/uploads
// volumes:
// - name: uploads-volume
//   persistentVolumeClaim:
//     claimName: uploads-pvc
```

### NFS/Shared Storage

For distributed deployments:

```typescript
const nfsStore = createFileStore({
  directory: "/mnt/nfs/uploads",  // NFS mount point
  deliveryUrl: "https://files.example.com",
});

// Multiple servers share the same storage
// Files visible to all instances
```

## Storage Considerations

### Disk Space

Calculate required storage:

```
Daily uploads = 100 files × 5MB = 500MB/day
Monthly = 500MB × 30 = 15GB/month
Yearly = 15GB × 12 = 180GB/year

Reserve 20% buffer for OS and system = 216GB required
```

### Backup Strategy

```bash
# Daily backup to cloud storage
# Example: rsync to AWS S3
0 2 * * * aws s3 sync /mnt/uploads s3://my-backup-bucket/uploads/$(date +\%Y-\%m-\%d)

# Or with tar
0 2 * * * tar czf /backups/uploads-$(date +\%Y-\%m-\%d).tar.gz /mnt/uploads
```

### Cleanup

```typescript
// Old uploads automatically cleaned up after expiration
// Default: 7 days (configurable in KV store)

// Manual cleanup
import fs from "fs";
const uploadDir = "./uploads";
const files = fs.readdirSync(uploadDir);

files.forEach(file => {
  const stats = fs.statSync(`${uploadDir}/${file}`);
  const age = Date.now() - stats.mtimeMs;

  // Delete files older than 30 days
  if (age > 30 * 24 * 60 * 60 * 1000) {
    fs.rmSync(`${uploadDir}/${file}`, { recursive: true });
  }
});
```

## Performance Characteristics

**Sequential uploads only:**
```
✓ Slow uploads (must resume from last position)
✗ Cannot parallel write chunks (safety constraint)
✓ Stable and reliable for small-medium files
✓ Good for development and testing
```

**Use for:**
- Development environments
- Testing scenarios
- Small to medium files (<1GB)
- Self-hosted deployments with local disk
- Shared storage (NFS, SMB)

**Don't use for:**
- High-concurrency production (use S3/Azure/GCS instead)
- Very large files (>10GB)
- Cloud-native applications (no S3/GCS/Azure integration)

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist ./dist

ENV NODE_ENV=production
ENV UPLOAD_DIR=/data/uploads
ENV DELIVERY_URL=https://files.example.com

VOLUME ["/data/uploads"]

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
    volumes:
      - uploads:/data/uploads
      - ./uploads:/app/public/uploads:ro  # serve from web
    environment:
      UPLOAD_DIR: /data/uploads
      DELIVERY_URL: http://localhost:3000/files

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - uploads:/usr/share/nginx/html/files:ro
      - ./nginx.conf:/etc/nginx/nginx.conf

volumes:
  uploads:
```

### Kubernetes

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: uploads-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uploadista-server
spec:
  replicas: 1  # Note: Single replica due to sequential writes
  selector:
    matchLabels:
      app: uploadista
  template:
    metadata:
      labels:
        app: uploadista
    spec:
      containers:
      - name: app
        image: uploadista:latest
        ports:
        - containerPort: 3000
        env:
        - name: UPLOAD_DIR
          value: /mnt/uploads
        - name: DELIVERY_URL
          value: https://files.example.com
        volumeMounts:
        - name: uploads
          mountPath: /mnt/uploads
      volumes:
      - name: uploads
        persistentVolumeClaim:
          claimName: uploads-pvc
```

## Monitoring

### Disk Usage

```bash
# Check disk usage
du -sh ./uploads

# Monitor in real-time
watch 'du -sh ./uploads && ls -la ./uploads | wc -l'
```

### Metrics

```typescript
// Track storage metrics
import fs from "fs";

const uploadDir = "./uploads";
const files = fs.readdirSync(uploadDir);
const totalSize = files.reduce((sum, file) => {
  const stats = fs.statSync(`${uploadDir}/${file}`);
  return sum + stats.size;
}, 0);

console.log(`Total files: ${files.length}`);
console.log(`Total size: ${(totalSize / 1024 / 1024).toFixed(2)}MB`);
```

## Limitations

Due to sequential-only uploads:

1. **Single Replica Only** - Multiple servers can't share same directory
2. **No Parallel Chunks** - Chunks must upload in order
3. **Slower Resume** - Must re-upload from last position
4. **Disk Dependent** - Speed limited by disk I/O
5. **No Cloud Scaling** - Can't span multiple servers

For high-scale production, use S3/Azure/GCS instead.

## Related Packages

- **[@uploadista/data-store-s3](../s3/)** - AWS S3 (recommended for production)
- **[@uploadista/data-store-azure](../azure/)** - Azure Blob Storage
- **[@uploadista/data-store-gcs](../gcs/)** - Google Cloud Storage
- **[@uploadista/server](../../servers/server/)** - Core server utilities
- **[@uploadista/kv-store-memory](../../kv-stores/memory/)** - In-memory KV store
- **[@uploadista/core](../../core/)** - Core engine

## TypeScript Support

Full TypeScript support:

```typescript
import type { FileStoreOptions } from "@uploadista/data-store-filesystem";
import { createFileStore, fileStore } from "@uploadista/data-store-filesystem";
```

## Troubleshooting

### Permission Denied

```bash
# Check directory permissions
ls -ld ./uploads

# Fix permissions
chmod 755 ./uploads
chmod 644 ./uploads/*
```

### Disk Full

```bash
# Check available space
df -h

# Find largest files
du -sh ./uploads/* | sort -rh | head -10

# Clean old uploads
find ./uploads -mtime +30 -delete  # Files older than 30 days
```

### Upload Fails

```bash
# Check if directory exists
test -d ./uploads && echo "exists" || echo "missing"

# Create if missing
mkdir -p ./uploads

# Verify write permissions
touch ./uploads/test && rm ./uploads/test
```

## License

MIT
