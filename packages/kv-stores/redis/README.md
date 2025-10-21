# @uploadista/kv-store-redis

Redis-backed key-value store for Uploadista. Provides distributed, persistent storage with high performance and clustering support.

## Overview

The Redis KV store uses the official `@redis/client` library to connect to Redis servers. It's designed for:

- **Distributed Systems**: Share state across multiple server instances
- **Persistent Storage**: Data survives process restarts
- **Production Deployments**: High availability and clustering
- **Real-Time Applications**: Pub/Sub support for event broadcasting
- **Scaling**: Horizontal scaling with Redis clusters

Supports Redis 5.0+ running standalone, in master-replica setup, or clustered mode.

## Installation

```bash
npm install @uploadista/kv-store-redis @redis/client
# or
pnpm add @uploadista/kv-store-redis @redis/client
```

### Prerequisites

- Node.js 18+
- Redis 5.0+ server running and accessible
- Network connectivity to Redis instance

## Quick Start

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";
import { Effect } from "effect";

// Create Redis client
const redisClient = createClient({
  url: "redis://localhost:6379",
});

await redisClient.connect();

// Use the KV store layer
const program = Effect.gen(function* () {
  // The redisKvStore is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(redisKvStore({ redis: redisClient }))
  )
);
```

## Features

- ✅ **Distributed State**: Share uploads and flows across servers
- ✅ **Persistence**: Data persists between deployments (with RDB/AOF)
- ✅ **High Performance**: Single-digit millisecond latency
- ✅ **Clustering**: Support for Redis clusters with replicas
- ✅ **Pub/Sub Ready**: Integration with event broadcasting
- ✅ **Automatic Failover**: Works with sentinel-monitored Redis
- ✅ **Type Safe**: Full TypeScript support

## API Reference

### Main Exports

#### `redisKvStore(config: RedisKvStoreConfig): Layer<BaseKvStoreService>`

Creates an Effect layer providing the `BaseKvStoreService` backed by Redis.

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";

const redisClient = createClient({ url: "redis://localhost:6379" });
await redisClient.connect();

const layer = redisKvStore({ redis: redisClient });
```

**Configuration**:

```typescript
interface RedisKvStoreConfig {
  redis: RedisClientType; // Connected @redis/client instance
}
```

#### `makeRedisBaseKvStore(config: RedisKvStoreConfig): BaseKvStore`

Factory function for creating a KV store with an existing Redis client.

```typescript
import { makeRedisBaseKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const store = makeRedisBaseKvStore({ redis });
```

### Available Operations

The Redis store implements the `BaseKvStore` interface with automatic serialization:

#### `get(key: string): Effect<string | null>`

Retrieve a value by key. Returns `null` if key doesn't exist.

```typescript
const program = Effect.gen(function* () {
  const value = yield* store.get("user:123");
  // Fetches from Redis with automatic error handling
});
```

#### `set(key: string, value: string): Effect<void>`

Store a string value. Overwrites existing value if key exists.

```typescript
const program = Effect.gen(function* () {
  yield* store.set("user:123", JSON.stringify({ name: "Alice" }));
  // Persisted in Redis
});
```

#### `delete(key: string): Effect<void>`

Remove a key from Redis. Safe to call on non-existent keys.

```typescript
const program = Effect.gen(function* () {
  yield* store.delete("user:123");
});
```

#### `list(keyPrefix: string): Effect<string[]>`

List keys matching a prefix using Redis SCAN (cursor-based, non-blocking).

```typescript
const program = Effect.gen(function* () {
  const keys = yield* store.list("user:");
  // Returns: ["123", "456", "789"]
  // Uses SCAN internally to avoid blocking Redis
});
```

## Configuration

### Basic Setup

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";

const redis = createClient({
  url: "redis://localhost:6379",
});

await redis.connect();

const layer = redisKvStore({ redis });
```

### Environment-Based Configuration

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redis = createClient({
  url: redisUrl,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || "0"),
});

await redis.connect();

const layer = redisKvStore({ redis });
```

### Master-Replica Setup

For high availability with automatic failover:

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";

const redis = createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  password: process.env.REDIS_PASSWORD,
  // Reads can use replicas
  readonly: true,
});

await redis.connect();

const layer = redisKvStore({ redis });
```

### Redis Cluster Setup

For horizontal scaling:

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createCluster } from "@redis/client";

const cluster = createCluster({
  rootNodes: [
    { host: "node1", port: 6379 },
    { host: "node2", port: 6379 },
    { host: "node3", port: 6379 },
  ],
  defaults: {
    password: process.env.REDIS_PASSWORD,
  },
});

await cluster.connect();

const layer = redisKvStore({ redis: cluster as any }); // Cast needed for cluster
```

## Examples

### Example 1: Distributed Upload Server

Multiple servers sharing upload state via Redis:

```typescript
import { redisKvStore } from "@uploadista/kv-store-redis";
import { uploadServer } from "@uploadista/server";
import { createClient } from "@redis/client";
import { Effect } from "effect";

const redis = createClient({ url: "redis://redis-server:6379" });
await redis.connect();

const program = Effect.gen(function* () {
  const server = yield* uploadServer;

  // Server can handle requests on any instance
  // Upload state is stored in shared Redis
  const upload = yield* server.createUpload(
    { filename: "file.pdf", size: 1024 },
    "client-1"
  );

  console.log(upload.id); // Accessible from any server instance
});

Effect.runSync(
  program.pipe(
    Effect.provide(redisKvStore({ redis })),
    // ... other layers
  )
);
```

### Example 2: Rate Limiting

Use Redis to track and limit upload attempts:

```typescript
import { makeRedisBaseKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";
import { Effect } from "effect";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const store = makeRedisBaseKvStore({ redis });

const checkRateLimit = (clientId: string, limit: number = 10) =>
  Effect.gen(function* () {
    const key = `ratelimit:${clientId}`;
    const count = yield* store.get(key);

    const current = count ? parseInt(count) : 0;

    if (current >= limit) {
      return false; // Rate limited
    }

    // Increment counter
    yield* store.set(key, String(current + 1));

    return true; // Allowed
  });

// Usage
const program = Effect.gen(function* () {
  const allowed = yield* checkRateLimit("user:123", 100);
  console.log(allowed ? "Upload allowed" : "Rate limited");
});

Effect.runSync(program);
```

### Example 3: Session Management

Store user session data:

```typescript
import { makeRedisBaseKvStore } from "@uploadista/kv-store-redis";
import { createClient } from "@redis/client";
import { Effect } from "effect";

const redis = createClient({ url: "redis://localhost:6379" });
await redis.connect();

const store = makeRedisBaseKvStore({ redis });

interface Session {
  userId: string;
  loginTime: number;
  lastActivity: number;
}

const storeSession = (sessionId: string, session: Session) =>
  Effect.gen(function* () {
    yield* store.set(`session:${sessionId}`, JSON.stringify(session));
  });

const getSession = (sessionId: string) =>
  Effect.gen(function* () {
    const data = yield* store.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  });

// Usage
const program = Effect.gen(function* () {
  const session: Session = {
    userId: "user:123",
    loginTime: Date.now(),
    lastActivity: Date.now(),
  };

  yield* storeSession("sess_abc123", session);

  const retrieved = yield* getSession("sess_abc123");
  console.log(retrieved);
});

Effect.runSync(program);
```

## Performance Tuning

### Connection Pooling

For high-throughput applications, connection pooling is automatic but tune if needed:

```typescript
import { createClient } from "@redis/client";

const redis = createClient({
  url: "redis://localhost:6379",
  socket: {
    keepAlive: 30000, // Keep connections alive
    noDelay: true,    // Disable Nagle's algorithm for low latency
  },
  // Pipelining is automatic - commands are batched
});

await redis.connect();
```

### Key Naming Strategy

For efficient SCAN operations:

```typescript
// Good: Hierarchical naming with colons
"upload:abc123"
"upload:abc123:chunk:0"
"session:user123"
"ratelimit:client456"

// Avoid: Long keys or random prefixes
"up_abc123_data"
"sess_user123_session_data"
```

### Memory Management

Monitor and manage Redis memory:

```typescript
const info = await redis.info("memory");
console.log(info);
// "memory:peak_allocated": 1048576
// "memory:used": 524288

// Set eviction policy in redis.conf:
// maxmemory 2gb
// maxmemory-policy allkeys-lru
```

## Scaling Patterns

### Single Instance

For development and small deployments:

```
Client ──→ Redis (single instance)
```

### Master-Replica

For read-heavy workloads:

```
Read-Only Clients ──→ Replica 1 ─┐
                                  ├─ Master (writes) ──→ Replicas
Read-Only Clients ──→ Replica 2 ─┘
```

### Cluster

For massive scale (100GB+ data):

```
Clients ──→ Redis Cluster (16 shards)
  - Automatic data distribution
  - Automatic failover
  - Linear scaling
```

## Deployment Options

### Docker Compose

```yaml
version: "3"
services:
  app:
    build: .
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

volumes:
  redis_data:
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: uploadista-app
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: app
        env:
        - name: REDIS_URL
          value: redis://redis-cluster.default.svc.cluster.local:6379
```

### Managed Services

- **AWS ElastiCache**: `rediscloud.c6g.large` on AWS
- **Heroku Redis**: `heroku-redis:premium-2`
- **UpCloud Managed Database**: Production-grade Redis

## Related Packages

- [@uploadista/core](../../core) - Core types and interfaces
- [@uploadista/kv-store-ioredis](../ioredis) - Alternative Redis client with clustering
- [@uploadista/kv-store-memory](../memory) - For development/testing
- [@uploadista/kv-store-cloudflare-kv](../cloudflare-kv) - Edge deployment
- [@uploadista/event-broadcaster-redis](../../event-emitters/event-broadcaster-redis) - Event broadcasting with Redis
- [@uploadista/server](../../servers/server) - Upload server using KV stores

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 127.0.0.1:6379
```

Solutions:
1. Verify Redis is running: `redis-cli ping`
2. Check hostname/port configuration
3. Verify firewall rules if remote Redis

```bash
# Test connection
redis-cli -h redis-host -p 6379 ping
# Should return: PONG
```

### Memory Issues

If Redis memory grows unexpectedly:

```bash
# Check which keys consume most memory
redis-cli --bigkeys

# Set max memory policy
redis-cli CONFIG SET maxmemory 2gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Slow SCAN Operations

If `list()` operations are slow:

1. Reduce key volume or use hierarchical naming
2. Implement custom scanning with batch limits
3. Consider Redis cluster for distribution

```typescript
// Optimize SCAN by reducing results returned
yield* store.list("upload:"); // Might scan many keys
```

### Connection Timeouts

For unreliable networks:

```typescript
const redis = createClient({
  url: "redis://redis-host:6379",
  socket: {
    reconnectStrategy: (attempt: number) => {
      if (attempt > 10) return new Error("Max retries exceeded");
      return Math.min(attempt * 50, 500);
    },
    connectTimeout: 5000,
  },
});
```

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [KV Stores Comparison Guide](../KV_STORES_COMPARISON.md) - Compare Redis with other options
- [Server Setup Guide](../../../SERVER_SETUP.md) - Redis in production servers
- [Event Broadcasting with Redis](../../event-emitters/event-broadcaster-redis/README.md) - Pub/Sub patterns
- [Redis Documentation](https://redis.io/documentation) - Official Redis docs
- [@redis/client Docs](https://github.com/redis/node-redis) - Node.js Redis client
