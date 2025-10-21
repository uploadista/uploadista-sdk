# @uploadista/kv-store-ioredis

IORedis-backed key-value store for Uploadista. Provides advanced Redis features including clustering, Sentinel support, and connection pooling.

## Overview

The IORedis KV store uses the `ioredis` library, offering:

- **Advanced Clustering**: Built-in Redis cluster support with auto-discovery
- **Sentinel Support**: Automatic failover with Redis Sentinel
- **Connection Pooling**: Efficient connection management
- **Lua Scripting**: Support for atomic multi-step operations
- **Cluster-Ready**: Production-grade cluster operations
- **Better Error Handling**: More granular retry and connection strategies

Compared to the standard Redis client, IORedis is optimized for complex deployments and high-availability setups.

## Installation

```bash
npm install @uploadista/kv-store-ioredis ioredis
# or
pnpm add @uploadista/kv-store-ioredis ioredis
```

### Prerequisites

- Node.js 18+
- Redis 5.0+ or Redis cluster
- Optional: Redis Sentinel for automatic failover

## Quick Start

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";
import { Effect } from "effect";

// Create IORedis instance
const redis = new Redis({
  host: "localhost",
  port: 6379,
});

// Use the KV store layer
const program = Effect.gen(function* () {
  // The ioRedisKvStore is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(ioRedisKvStore({ redis }))
  )
);
```

## Features

- ✅ **Redis Clustering**: Built-in support for Redis clusters
- ✅ **Sentinel Support**: Automatic master failover detection
- ✅ **Connection Pooling**: Efficient resource management
- ✅ **Cluster Replica Reads**: Distribute read load across replicas
- ✅ **Auto-Reconnect**: Robust connection recovery
- ✅ **Pub/Sub Support**: Integration with event systems
- ✅ **Lua Scripting**: Advanced atomic operations
- ✅ **Type Safe**: Full TypeScript support

## API Reference

### Main Exports

#### `ioRedisKvStore(config: IoRedisKvStoreConfig): Layer<BaseKvStoreService>`

Creates an Effect layer providing the `BaseKvStoreService` backed by IORedis.

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";

const redis = new Redis({ host: "localhost", port: 6379 });

const layer = ioRedisKvStore({ redis });
```

**Configuration**:

```typescript
type IoRedisKvStoreConfig = {
  redis: Redis; // Connected IORedis instance
};
```

#### `makeIoRedisBaseKvStore(config: IoRedisKvStoreConfig): BaseKvStore`

Factory function for creating a KV store with an existing IORedis instance.

```typescript
import { makeIoRedisBaseKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";

const redis = new Redis();
const store = makeIoRedisBaseKvStore({ redis });
```

### Available Operations

The IORedis store implements the `BaseKvStore` interface:

#### `get(key: string): Effect<string | null>`

Retrieve a value by key.

```typescript
const program = Effect.gen(function* () {
  const value = yield* store.get("upload:123");
});
```

#### `set(key: string, value: string): Effect<void>`

Store a string value.

```typescript
const program = Effect.gen(function* () {
  yield* store.set("upload:123", JSON.stringify(data));
});
```

#### `delete(key: string): Effect<void>`

Remove a key.

```typescript
const program = Effect.gen(function* () {
  yield* store.delete("upload:123");
});
```

#### `list(keyPrefix: string): Effect<string[]>`

List keys matching a prefix using SCAN (cluster-aware).

```typescript
const program = Effect.gen(function* () {
  const keys = yield* store.list("upload:");
});
```

## Configuration

### Single Instance

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";

const redis = new Redis({
  host: "localhost",
  port: 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy: (times: number) => Math.min(times * 50, 2000),
});

const layer = ioRedisKvStore({ redis });
```

### Redis Cluster

With automatic cluster discovery:

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";

const redis = new Redis.Cluster(
  [
    { host: "node1", port: 6379 },
    { host: "node2", port: 6379 },
    { host: "node3", port: 6379 },
  ],
  {
    dnsLookup: (address, callback) => callback(null, address),
    redisOptions: {
      password: process.env.REDIS_PASSWORD,
    },
  }
);

const layer = ioRedisKvStore({ redis: redis as any });
```

### Redis Sentinel

For high availability with automatic failover:

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";

const redis = new Redis({
  sentinels: [
    { host: "sentinel1", port: 26379 },
    { host: "sentinel2", port: 26379 },
    { host: "sentinel3", port: 26379 },
  ],
  name: "mymaster",
  sentinelPassword: process.env.SENTINEL_PASSWORD,
  password: process.env.REDIS_PASSWORD,
  sentinelRetryStrategy: (times: number) => {
    const delay = Math.min(times * 10, 1000);
    return delay;
  },
});

const layer = ioRedisKvStore({ redis });
```

### Replica Reads

Distribute read load across replicas:

```typescript
import Redis from "ioredis";

const redis = new Redis.Cluster(
  [
    { host: "master", port: 6379 },
    { host: "replica1", port: 6379 },
    { host: "replica2", port: 6379 },
  ],
  {
    enableReadyCheck: true,
    enableOfflineQueue: true,
    scaleReads: "slave", // Read from replicas
  }
);
```

## Examples

### Example 1: Distributed Server with Clustering

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import { uploadServer } from "@uploadista/server";
import Redis from "ioredis";
import { Effect } from "effect";

// Cluster configuration
const redis = new Redis.Cluster(
  [
    { host: "redis1", port: 6379 },
    { host: "redis2", port: 6379 },
    { host: "redis3", port: 6379 },
  ],
  {
    redisOptions: {
      password: process.env.REDIS_PASSWORD,
    },
  }
);

const program = Effect.gen(function* () {
  const server = yield* uploadServer;

  // Handle uploads across cluster
  const upload = yield* server.createUpload(
    { filename: "large-file.zip", size: 104857600 },
    "client:123"
  );

  console.log(`Upload created: ${upload.id}`);
});

Effect.runSync(
  program.pipe(
    Effect.provide(ioRedisKvStore({ redis: redis as any }))
  )
);
```

### Example 2: Sentinel-Based High Availability

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";
import { Effect } from "effect";

const redis = new Redis({
  sentinels: [
    { host: "sentinel1", port: 26379 },
    { host: "sentinel2", port: 26379 },
    { host: "sentinel3", port: 26379 },
  ],
  name: "uploadista-master",
  password: process.env.REDIS_PASSWORD,
});

// Automatic failover is handled by IORedis
const store = ioRedisKvStore({ redis });

const program = Effect.gen(function* () {
  // Operations automatically route through Sentinel
  // If master fails, Sentinel promotes replica automatically
  const result = yield* Effect.tryPromise({
    try: async () => redis.ping(),
    catch: (e) => e as Error,
  });

  console.log(`Redis status: ${result}`);
});
```

### Example 3: Connection Pool Optimization

```typescript
import { ioRedisKvStore } from "@uploadista/kv-store-ioredis";
import Redis from "ioredis";
import { Effect } from "effect";

const redis = new Redis({
  host: "localhost",
  port: 6379,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
  connectTimeout: 10000,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    if (times > 10) {
      return null; // Stop retrying
    }
    return delay;
  },
  reconnectOnError: (err: Error) => {
    // Reconnect on all errors except AUTH errors
    if (err.message.includes("WRONGPASS")) {
      return false;
    }
    return true;
  },
});

const program = Effect.gen(function* () {
  // Connection pool is managed automatically
  const store = ioRedisKvStore({ redis });
  // Use store...
});
```

## Performance Tuning

### Cluster Mode Optimization

```typescript
const redis = new Redis.Cluster(
  [
    { host: "node1", port: 6379 },
    { host: "node2", port: 6379 },
    { host: "node3", port: 6379 },
  ],
  {
    // Optimize cluster operations
    maxRedirections: 16,        // Cluster redirects
    retryDelayOnFailover: 100,  // Wait before retry
    retryDelayOnClusterDown: 300, // Cluster down delay
    dnsLookup: (address, callback) => {
      // Implement custom DNS if needed
      callback(null, address);
    },
  }
);
```

### Connection Settings

```typescript
const redis = new Redis({
  // Performance tuning
  lazyConnect: false,           // Connect immediately
  enableReadyCheck: false,      // Skip ready check for speed
  enableOfflineQueue: true,     // Queue commands when offline
  maxRetriesPerRequest: 3,      // Limit retries
  socketConnectTimeout: 5000,   // Socket timeout
  socketKeepAlive: 30000,       // Keep-alive
});
```

## Scaling Patterns

### Single Instance with Replica

```
Write Operations ──→ Master ──→ Replicates to ──→ Replica 1
Read Operations  ─────────────────────────────→ Replica 2
```

### Redis Cluster

```
Client A ──→ Node 1 (Hash slots 0-5460)
Client B ──→ Node 2 (Hash slots 5461-10922)
Client C ──→ Node 3 (Hash slots 10923-16383)
```

### Sentinel Setup

```
Sentinel 1 ┐
Sentinel 2 ├─→ Monitors ──→ Master ──→ Replica
Sentinel 3 ┘         ↓
                  Promotes on failure
```

## Advanced Features

### Lua Scripting

For atomic operations:

```typescript
import Redis from "ioredis";

const redis = new Redis();

// Atomic increment with limit
const script = `
  local val = redis.call('get', KEYS[1])
  val = (val or 0) + 1
  if val > tonumber(ARGV[1]) then
    return 0
  end
  redis.call('set', KEYS[1], val)
  return val
`;

const result = await redis.eval(script, 1, "counter", 100);
```

### Pub/Sub for Events

```typescript
import Redis from "ioredis";

const redis = new Redis();
const subscriber = new Redis();

subscriber.on("message", (channel, message) => {
  console.log(`${channel}: ${message}`);
});

subscriber.subscribe("upload-events");

// Publish from main instance
redis.publish("upload-events", JSON.stringify({
  type: "upload-complete",
  uploadId: "abc123",
}));
```

## Deployment

### Docker Compose with Cluster

```yaml
version: "3"
services:
  app:
    environment:
      REDIS_CLUSTER_NODES: redis1:6379,redis2:6379,redis3:6379
  redis1:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
  redis2:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
  redis3:
    image: redis:7-alpine
    command: redis-server --cluster-enabled yes --cluster-config-file nodes.conf
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis-cluster
spec:
  serviceName: redis-cluster
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        - containerPort: 16379
```

## Related Packages

- [@uploadista/core](../../core) - Core types
- [@uploadista/kv-store-redis](../redis) - Standard Redis client
- [@uploadista/kv-store-memory](../memory) - For development
- [@uploadista/event-broadcaster-ioredis](../../event-emitters/event-broadcaster-ioredis) - Event broadcasting
- [@uploadista/server](../../servers/server) - Upload server

## Troubleshooting

### Cluster Connection Issues

```
Error: Failed to refresh slots cache
```

Solutions:
1. Verify cluster nodes are accessible
2. Check cluster configuration: `redis-cli -c cluster info`
3. Ensure password matches across all nodes

```bash
redis-cli -c cluster nodes
# Should show all nodes as connected
```

### Sentinel Detection Failed

```
Error: Cannot find master from Sentinel
```

Solutions:
1. Verify Sentinel is running
2. Check Sentinel configuration: `redis-cli -p 26379 SENTINEL MASTERS`
3. Verify master name matches configuration

```bash
redis-cli -p 26379
> SENTINEL get-master-addr-by-name uploadista-master
```

### High Memory Usage

Monitor cluster memory:

```bash
redis-cli -c info memory | grep used_memory
```

Implement cleanup:

```typescript
// Set TTL on session keys
await redis.setex("session:user123", 3600, sessionData);
```

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [KV Stores Comparison Guide](../KV_STORES_COMPARISON.md) - Compare IORedis with other options
- [Server Setup Guide](../../../SERVER_SETUP.md) - IORedis in production
- [ioredis Documentation](https://github.com/luin/ioredis) - Official ioredis docs
- [Redis Cluster Guide](https://redis.io/topics/cluster-tutorial) - Redis clustering
- [Redis Sentinel Guide](https://redis.io/topics/sentinel) - High availability
