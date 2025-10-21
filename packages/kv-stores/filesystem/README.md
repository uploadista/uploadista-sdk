# @uploadista/kv-store-filesystem

Filesystem-backed key-value store for Uploadista. Provides persistent storage without external dependencies, perfect for development and self-hosted deployments.

## Overview

The filesystem KV store stores data as JSON files on disk. It's designed for:

- **Development & Testing**: No external services needed
- **Self-Hosted Deployments**: Full control over data storage
- **Small to Medium Deployments**: Suitable for 1-100 GB of data
- **Docker & VPS Hosting**: Persistent storage in mounted volumes
- **Backup-Friendly**: Easy filesystem snapshots and backups

Data is persisted to disk and survives process restarts. Performance depends on disk I/O speed.

## Installation

```bash
npm install @uploadista/kv-store-filesystem
# or
pnpm add @uploadista/kv-store-filesystem
```

### Prerequisites

- Node.js 18+
- Writable filesystem (local disk, mounted volume, or network storage)
- For concurrent access: Avoid multiple processes writing to same directory

## Quick Start

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { Effect } from "effect";

// Create store backed by filesystem
const layer = fileKvStore({
  directory: "./data/kv-store",
});

const program = Effect.gen(function* () {
  // The filesystem store is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(layer),
    // ... other layers
  )
);
```

## Features

- ✅ **Persistent Storage**: Data survives process restarts and crashes
- ✅ **No Dependencies**: No external services required
- ✅ **Easy Backups**: Standard filesystem backup tools work
- ✅ **Controlled Performance**: Tune with SSD vs HDD, caching strategies
- ✅ **Volume-Mounted**: Works perfectly in Docker/Kubernetes
- ✅ **Type Safe**: Full TypeScript support
- ✅ **Simple Debugging**: Data stored as readable JSON files

## API Reference

### Main Exports

#### `fileKvStore(config: FileKvStoreOptions): Layer<BaseKvStoreService>`

Creates an Effect layer providing the `BaseKvStoreService` backed by filesystem.

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";

const layer = fileKvStore({
  directory: "./data/uploads",
});
```

**Configuration**:

```typescript
type FileKvStoreOptions = {
  directory: string; // Directory path for storing files
};
```

#### `makeFileBaseKvStore(config: FileKvStoreOptions): BaseKvStore`

Factory function for creating a filesystem KV store.

```typescript
import { makeFileBaseKvStore } from "@uploadista/kv-store-filesystem";

const store = makeFileBaseKvStore({
  directory: "./data/kv-store",
});
```

### Available Operations

The filesystem store implements the `BaseKvStore` interface:

#### `get(key: string): Effect<string | null>`

Retrieve a value by key. Returns `null` if key doesn't exist.

```typescript
const program = Effect.gen(function* () {
  const value = yield* store.get("user:123");
  // Reads from ./data/kv-store/user:123.json
});
```

#### `set(key: string, value: string): Effect<void>`

Store a string value. Creates file if doesn't exist, overwrites if exists.

```typescript
const program = Effect.gen(function* () {
  yield* store.set("user:123", JSON.stringify({ name: "Alice" }));
  // Writes to ./data/kv-store/user:123.json
});
```

#### `delete(key: string): Effect<void>`

Remove a key from storage. Safe to call on non-existent keys.

```typescript
const program = Effect.gen(function* () {
  yield* store.delete("user:123");
  // Deletes ./data/kv-store/user:123.json
});
```

#### `list(keyPrefix: string): Effect<string[]>`

List all keys matching a prefix.

```typescript
const program = Effect.gen(function* () {
  const keys = yield* store.list("user:");
  // Returns: ["123", "456"] for files ["user:123.json", "user:456.json"]
});
```

## Configuration

### Basic Setup

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";

const layer = fileKvStore({
  directory: "./data/kv-store",
});
```

### Environment-Based Configuration

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import path from "path";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");

const layer = fileKvStore({
  directory: path.join(dataDir, "kv-store"),
});
```

### Production Configuration with Volume Mounts

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";

// Use mount point provided by orchestration system
const layer = fileKvStore({
  directory: process.env.KV_STORE_PATH || "/mnt/persistent-data/kv-store",
});
```

## Examples

### Example 1: Local Development Server

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { uploadServer } from "@uploadista/server";
import { Effect } from "effect";
import path from "path";

const developmentLayer = fileKvStore({
  directory: path.join(process.cwd(), "./dev-data"),
});

const program = Effect.gen(function* () {
  const server = yield* uploadServer;

  // Use filesystem store for development
  const upload = yield* server.createUpload(
    {
      filename: "test-file.pdf",
      size: 2097152,
      mimeType: "application/pdf",
    },
    "client-dev"
  );

  console.log(`Upload created: ${upload.id}`);
});

Effect.runSync(
  program.pipe(
    Effect.provide(developmentLayer),
    // ... other layers
  )
);
```

### Example 2: Session Storage

```typescript
import { makeFileBaseKvStore } from "@uploadista/kv-store-filesystem";
import { Effect } from "effect";

const store = makeFileBaseKvStore({
  directory: "./data/sessions",
});

interface Session {
  userId: string;
  loginTime: number;
  lastActivity: number;
  permissions: string[];
}

const createSession = (sessionId: string, userId: string) =>
  Effect.gen(function* () {
    const session: Session = {
      userId,
      loginTime: Date.now(),
      lastActivity: Date.now(),
      permissions: ["upload", "download"],
    };

    yield* store.set(`session:${sessionId}`, JSON.stringify(session));
    console.log(`Session created: ${sessionId}`);
  });

const getSession = (sessionId: string) =>
  Effect.gen(function* () {
    const data = yield* store.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  });

// Usage
const program = Effect.gen(function* () {
  yield* createSession("sess_abc123", "user_xyz");
  const session = yield* getSession("sess_abc123");
  console.log(session);
  // {
  //   userId: "user_xyz",
  //   loginTime: 1729516800000,
  //   lastActivity: 1729516800000,
  //   permissions: ["upload", "download"]
  // }
});

Effect.runSync(program);
```

### Example 3: Upload Metadata Tracking

```typescript
import { makeFileBaseKvStore } from "@uploadista/kv-store-filesystem";
import { Effect } from "effect";

const store = makeFileBaseKvStore({
  directory: "./data/uploads",
});

interface UploadMetadata {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
  completedAt?: string;
  status: "in-progress" | "completed" | "failed";
}

const trackUpload = (metadata: UploadMetadata) =>
  Effect.gen(function* () {
    const key = `upload:${metadata.id}`;
    yield* store.set(key, JSON.stringify(metadata));
  });

const completeUpload = (uploadId: string) =>
  Effect.gen(function* () {
    const key = `upload:${uploadId}`;
    const dataStr = yield* store.get(key);

    if (!dataStr) {
      return; // Upload not found
    }

    const metadata: UploadMetadata = JSON.parse(dataStr);
    metadata.status = "completed";
    metadata.completedAt = new Date().toISOString();

    yield* store.set(key, JSON.stringify(metadata));
  });

const listAllUploads = () =>
  Effect.gen(function* () {
    const keys = yield* store.list("upload:");

    const uploads = yield* Effect.all(
      keys.map((key) =>
        Effect.gen(function* () {
          const data = yield* store.get(`upload:${key}`);
          return data ? JSON.parse(data) : null;
        })
      )
    );

    return uploads.filter((u) => u !== null);
  });

// Usage
const program = Effect.gen(function* () {
  // Track new upload
  yield* trackUpload({
    id: "upl_123",
    filename: "document.pdf",
    size: 1048576,
    uploadedAt: new Date().toISOString(),
    status: "in-progress",
  });

  // Complete upload
  yield* completeUpload("upl_123");

  // List all uploads
  const uploads = yield* listAllUploads();
  console.log(uploads);
});

Effect.runSync(program);
```

## Performance Characteristics

| Operation | Latency | Scaling |
|-----------|---------|---------|
| get()     | 1-5ms   | O(1) + disk I/O |
| set()     | 2-10ms  | O(1) + disk write |
| delete()  | 1-5ms   | O(1) + disk delete |
| list()    | 5-50ms  | O(n) where n = files |

Performance depends heavily on:
- **Disk Type**: SSD (1-5ms) vs HDD (10-50ms)
- **I/O System**: NVMe >> SSD >> HDD
- **File Count**: More files in directory = slower list operations

## Deployment

### Docker with Volume Mount

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .
RUN npm run build

ENV KV_STORE_PATH=/data/kv-store
EXPOSE 3000

CMD ["npm", "start"]
```

```yaml
version: "3"
services:
  app:
    build: .
    environment:
      KV_STORE_PATH: /data/kv-store
    volumes:
      - kv_data:/data/kv-store
    ports:
      - "3000:3000"

volumes:
  kv_data:
    driver: local
```

### Kubernetes with PersistentVolume

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kv-store-pvc
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uploadista-app
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: app
        image: uploadista:latest
        env:
        - name: KV_STORE_PATH
          value: /data/kv-store
        volumeMounts:
        - name: kv-storage
          mountPath: /data/kv-store
      volumes:
      - name: kv-storage
        persistentVolumeClaim:
          claimName: kv-store-pvc
```

### Manual Backup

```bash
# Backup using tar
tar -czf kv-backup-$(date +%Y%m%d).tar.gz ./data/kv-store

# Backup using rsync
rsync -avz ./data/kv-store /backup/location/

# Restore from backup
tar -xzf kv-backup-20251021.tar.gz -C ./
```

## Best Practices

### 1. Use Hierarchical Key Naming

```typescript
// Good: Organized by type and owner
"upload:user:123:abc"
"session:user:456:xyz"
"metadata:upload:abc"

// Avoid: Flat, unclear naming
"data1", "x", "tmp123"
```

### 2. Implement Cleanup for Old Data

```typescript
import { makeFileBaseKvStore } from "@uploadista/kv-store-filesystem";
import { Effect } from "effect";
import fs from "fs/promises";
import path from "path";

const cleanupOldSessions = (storePath: string, maxAge: number) =>
  Effect.gen(function* () {
    const now = Date.now();
    const files = yield* Effect.tryPromise({
      try: () => fs.readdir(storePath),
      catch: (e) => e as Error,
    });

    for (const file of files) {
      if (!file.startsWith("session:")) continue;

      const filePath = path.join(storePath, file);
      const stats = yield* Effect.tryPromise({
        try: () => fs.stat(filePath),
        catch: (e) => e as Error,
      });

      if (now - stats.mtimeMs > maxAge) {
        yield* Effect.tryPromise({
          try: () => fs.unlink(filePath),
          catch: (e) => e as Error,
        });
      }
    }
  });

// Run cleanup daily
setInterval(() => {
  Effect.runSync(
    cleanupOldSessions("./data/kv-store", 24 * 60 * 60 * 1000) // 24 hours
  );
}, 60 * 60 * 1000); // Every hour
```

### 3. Handle Directory Creation

```typescript
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import fs from "fs/promises";
import path from "path";

const ensureDirectory = async (dir: string) => {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    if ((e as any).code !== "EEXIST") {
      throw e;
    }
  }
};

// In initialization
await ensureDirectory("./data/kv-store");

const layer = fileKvStore({
  directory: "./data/kv-store",
});
```

### 4. Monitor Disk Space

```typescript
import { Effect } from "effect";
import { exec } from "child_process";
import { promisify } from "util";

const checkDiskSpace = (dir: string) =>
  Effect.gen(function* () {
    const execPromise = promisify(exec);
    const { stdout } = yield* Effect.tryPromise({
      try: () => execPromise(`df -B1 "${dir}" | tail -1`),
      catch: (e) => e as Error,
    });

    const [, , available] = stdout.trim().split(/\s+/);
    const availableGB = parseInt(available) / 1024 / 1024 / 1024;

    if (availableGB < 1) {
      console.warn("Less than 1GB disk space remaining!");
    }
  });
```

## Scaling Limitations

The filesystem store is suitable for:

| Data Size | Deployment | Recommendation |
|-----------|-----------|-----------------|
| < 1 GB | Single Server | ✅ Perfect |
| 1-10 GB | Single Server | ✅ Good |
| 10-100 GB | Single Server with fast disk | ✅ Acceptable |
| > 100 GB | Distributed | ❌ Use Redis or Database |

For larger scale or distributed systems, migrate to [Redis](#see-also) or a database.

## Troubleshooting

### "ENOENT: no such file or directory"

Directory doesn't exist. Solutions:

```typescript
import { mkdirSync } from "fs";
import path from "path";

const dir = "./data/kv-store";
mkdirSync(dir, { recursive: true });

const layer = fileKvStore({ directory: dir });
```

### "EACCES: permission denied"

No write permissions to directory:

```bash
# Check permissions
ls -la ./data/

# Fix permissions
chmod 755 ./data/
chmod 755 ./data/kv-store
```

### "Disk quota exceeded" or "No space left on device"

Disk is full:

```bash
# Check disk usage
df -h

# Find large files
du -sh ./data/kv-store/*

# Clean up old files
find ./data/kv-store -mtime +30 -delete
```

### Slow Performance on list() Operations

Too many files in directory:

1. **Implement archiving**: Move old files to separate directory
2. **Partition by date**: Use `./data/2025-10/uploads` structure
3. **Switch backends**: Migrate to Redis for frequent queries

```typescript
// Better structure
"./data/kv-store/2025-10/upload:abc123.json"
"./data/kv-store/2025-11/upload:def456.json"
```

### Multi-Process Conflicts

Multiple processes writing to same directory:

```typescript
// Use process-level locking
import lockfile from "proper-lockfile";

const store = makeFileBaseKvStore({
  directory: "./data/kv-store",
});

// Wrap operations with locks if needed
const safeSet = (key: string, value: string) =>
  Effect.gen(function* () {
    const lock = yield* Effect.tryPromise({
      try: () => lockfile.lock(`${key}.lock`),
      catch: (e) => e as Error,
    });

    try {
      yield* store.set(key, value);
    } finally {
      yield* Effect.tryPromise({
        try: () => lockfile.unlock(lock),
        catch: (e) => e as Error,
      });
    }
  });
```

## Migration Paths

### From Memory Store

```typescript
// Replace
import { memoryKvStore } from "@uploadista/kv-store-memory";
// With
import { fileKvStore } from "@uploadista/kv-store-filesystem";

// Data is not automatically migrated - applications must handle data transfer
```

### To Redis

When your data grows beyond filesystem capacity:

```bash
# Export filesystem data
node scripts/export-to-redis.js ./data/kv-store

# Verify Redis has all data
redis-cli KEYS "upload:*"

# Switch connection and test
# Then deploy new code with Redis store
```

## Related Packages

- [@uploadista/core](../../core) - Core types
- [@uploadista/kv-store-memory](../memory) - For development/testing
- [@uploadista/kv-store-redis](../redis) - For distributed systems
- [@uploadista/server](../../servers/server) - Upload server
- [@uploadista/data-store-s3](../../data-stores/s3) - For file content storage

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [KV Stores Comparison Guide](../KV_STORES_COMPARISON.md) - Compare storage options
- [Server Setup Guide](../../../SERVER_SETUP.md) - Filesystem in production
- [Docker Documentation](https://docs.docker.com/storage/) - Volume mounting
- [Kubernetes PersistentVolumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) - Persistent storage
