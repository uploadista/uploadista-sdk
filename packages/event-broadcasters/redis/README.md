# @uploadista/event-broadcaster-redis

Redis-backed event broadcaster for Uploadista. Distributes events across multiple server instances using Redis Pub/Sub.

## Overview

The Redis event broadcaster uses Redis Pub/Sub to broadcast events across distributed systems. Perfect for:

- **Distributed Servers**: Share events across multiple instances
- **Horizontal Scaling**: Add more servers without reconfiguration
- **Real-Time Updates**: Sub-millisecond event propagation
- **Production Deployments**: Battle-tested Redis infrastructure
- **Load Balancing**: Events reach any server instance

Events published to a channel are delivered to all subscribers on any server instance.

## Installation

```bash
npm install @uploadista/event-broadcaster-redis @redis/client
# or
pnpm add @uploadista/event-broadcaster-redis @redis/client
```

### Prerequisites

- Node.js 18+
- Redis 5.0+ server running and accessible
- Two Redis connections (one for publish, one for subscribe)

## Quick Start

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createClient } from "@redis/client";
import { Effect } from "effect";

// Create Redis clients (one for pub, one for sub)
const redisPublisher = createClient({
  url: "redis://localhost:6379",
});
const redisSubscriber = createClient({
  url: "redis://localhost:6379",
});

await redisPublisher.connect();
await redisSubscriber.connect();

const program = Effect.gen(function* () {
  // Event broadcaster is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(
      redisEventBroadcaster({
        redis: redisPublisher,
        subscriberRedis: redisSubscriber,
      })
    ),
    // ... other layers
  )
);
```

## Features

- ✅ **Distributed Broadcasting**: Events reach all servers
- ✅ **Scalable**: Add servers without reconfiguration
- ✅ **High Performance**: Redis optimized for Pub/Sub
- ✅ **Multiple Channels**: Independent event streams
- ✅ **Reliable**: Redis persistence optional
- ✅ **Type Safe**: Full TypeScript support

## API Reference

### Main Exports

#### `redisEventBroadcaster(config: RedisEventBroadcasterConfig): Layer<EventBroadcasterService>`

Creates an Effect layer providing the `EventBroadcasterService` backed by Redis Pub/Sub.

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createClient } from "@redis/client";

const redis = createClient({ url: "redis://localhost:6379" });
const subscriberRedis = createClient({ url: "redis://localhost:6379" });

await redis.connect();
await subscriberRedis.connect();

const layer = redisEventBroadcaster({
  redis,
  subscriberRedis,
});
```

**Configuration**:

```typescript
interface RedisEventBroadcasterConfig {
  redis: RedisClientType;           // Connection for publishing
  subscriberRedis: RedisClientType; // Connection for subscribing
}
```

#### `createRedisEventBroadcaster(config: RedisEventBroadcasterConfig): EventBroadcaster`

Factory function to create a broadcaster instance.

```typescript
import { createRedisEventBroadcaster } from "@uploadista/event-broadcaster-redis";

const broadcaster = createRedisEventBroadcaster({
  redis,
  subscriberRedis,
});
```

### Available Operations

The Redis broadcaster implements the `EventBroadcaster` interface:

#### `publish(channel: string, message: string): Effect<void>`

Broadcast a message to all subscribers on a channel (across all server instances).

```typescript
const program = Effect.gen(function* () {
  yield* broadcaster.publish("uploads:complete", JSON.stringify({
    uploadId: "abc123",
    duration: 45000,
  }));
  // Delivered to all subscribers on all servers
});
```

#### `subscribe(channel: string, handler: (message: string) => void): Effect<void>`

Subscribe to a channel and receive messages from this and other servers.

```typescript
const program = Effect.gen(function* () {
  yield* broadcaster.subscribe("uploads:complete", (message: string) => {
    const event = JSON.parse(message);
    console.log(`Upload complete: ${event.uploadId}`);
  });
});
```

#### `unsubscribe(channel: string): Effect<void>`

Unsubscribe from a channel.

```typescript
const program = Effect.gen(function* () {
  yield* broadcaster.unsubscribe("uploads:complete");
});
```

## Configuration

### Basic Setup

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createClient } from "@redis/client";

const redis = createClient({
  url: "redis://localhost:6379",
});
const subscriberRedis = createClient({
  url: "redis://localhost:6379",
});

await redis.connect();
await subscriberRedis.connect();

const layer = redisEventBroadcaster({
  redis,
  subscriberRedis,
});
```

### Environment-Based Configuration

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createClient } from "@redis/client";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

const redis = createClient({ url: redisUrl });
const subscriberRedis = createClient({ url: redisUrl });

await redis.connect();
await subscriberRedis.connect();

const layer = redisEventBroadcaster({
  redis,
  subscriberRedis,
});
```

### Production with Replication

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { createClient } from "@redis/client";

// Use replicas for distribution
const redis = createClient({
  url: process.env.REDIS_PRIMARY,
  password: process.env.REDIS_PASSWORD,
});
const subscriberRedis = createClient({
  url: process.env.REDIS_REPLICA,
  password: process.env.REDIS_PASSWORD,
  readonly: true,
});

await redis.connect();
await subscriberRedis.connect();

const layer = redisEventBroadcaster({
  redis,
  subscriberRedis,
});
```

## Examples

### Example 1: Distributed Upload Server

Multiple server instances broadcasting upload events:

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { uploadServer } from "@uploadista/server";
import { createClient } from "@redis/client";
import { Effect } from "effect";

const redis = createClient({ url: "redis://redis-cluster:6379" });
const subscriberRedis = createClient({ url: "redis://redis-cluster:6379" });

await redis.connect();
await subscriberRedis.connect();

const program = Effect.gen(function* () {
  // Subscribe on this server
  yield* broadcaster.subscribe("uploads:complete", (message: string) => {
    const event = JSON.parse(message);
    console.log(`[Server] Upload complete: ${event.uploadId}`);
    // Trigger downstream processing on this server
  });

  // Any server can publish
  yield* broadcaster.publish("uploads:complete", JSON.stringify({
    uploadId: "abc123",
    source: "server-2",
  }));
  // ALL servers (including this one) receive the event
});

Effect.runSync(
  program.pipe(
    Effect.provide(
      redisEventBroadcaster({
        redis,
        subscriberRedis,
      })
    )
  )
);
```

### Example 2: Flow Job Notifications

Notify all servers when a flow job completes:

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { Effect } from "effect";

const broadcaster = createRedisEventBroadcaster({
  redis,
  subscriberRedis,
});

interface FlowCompletedEvent {
  jobId: string;
  uploadId: string;
  status: "success" | "failed";
  duration: number;
}

const notifyFlowComplete = (event: FlowCompletedEvent) =>
  Effect.gen(function* () {
    yield* broadcaster.publish(
      "flows:completed",
      JSON.stringify(event)
    );
  });

const program = Effect.gen(function* () {
  // Subscribe on all servers
  yield* broadcaster.subscribe("flows:completed", (message: string) => {
    const event: FlowCompletedEvent = JSON.parse(message);

    // Update metrics on this server
    console.log(`Job ${event.jobId}: ${event.status} (${event.duration}ms)`);

    // Cleanup local resources
    if (event.status === "success") {
      console.log(`Archiving results for upload ${event.uploadId}`);
    }
  });

  // When processing completes
  yield* notifyFlowComplete({
    jobId: "job_xyz",
    uploadId: "upl_abc",
    status: "success",
    duration: 12000,
  });
});

Effect.runSync(program);
```

### Example 3: Cross-Server Cache Invalidation

Invalidate cached data across all servers:

```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { Effect } from "effect";

const broadcaster = createRedisEventBroadcaster({
  redis,
  subscriberRedis,
});

// Local cache (in each server)
const localCache = new Map<string, any>();

const program = Effect.gen(function* () {
  // Subscribe to cache invalidation
  yield* broadcaster.subscribe("cache:invalidate", (message: string) => {
    const { key } = JSON.parse(message);
    localCache.delete(key);
    console.log(`Cache invalidated: ${key}`);
  });

  // When data changes, notify all servers
  yield* broadcaster.publish(
    "cache:invalidate",
    JSON.stringify({ key: "upload:abc123" })
  );
  // All servers clear their local cache for "upload:abc123"
});

Effect.runSync(program);
```

## Performance Characteristics

| Operation | Latency | Distribution |
|-----------|---------|--------------|
| publish() | 1-2ms | All servers |
| subscribe() | 2-5ms | Immediate |
| unsubscribe() | 1-2ms | Immediate |
| Event Delivery | 2-10ms | Global |

Events are delivered to all subscribers globally within milliseconds.

## Architecture

### Single Redis Instance

```
Server 1 ─┐
Server 2  ├──→ Redis ──→ Broadcast
Server 3 ─┘           to subscribers
```

### Redis Replication

```
Write: Server → Master Redis ─→ Replicate → Replicas
Read:  Server → Replica Redis (for subscribe connections)
```

### Redis Cluster

```
Server 1 ──→ Cluster Node 1
Server 2 ──→ Cluster Node 2  ──→ Auto-replicated
Server 3 ──→ Cluster Node 3     across cluster
```

## Scaling Patterns

### 2-3 Servers

Use single Redis instance or master-replica:

```
App 1 ──┐
App 2   ├──→ Redis Master ──→ Replica (optional)
App 3 ──┘
```

### 5-10 Servers

Use Redis Sentinel for automatic failover:

```
Apps ──→ Sentinel ──→ Master Redis
         (monitors)    + Replicas
         monitors
```

### 50+ Servers

Use Redis Cluster:

```
Apps ──→ Redis Cluster (auto-distributed)
         16+ shards with replicas
```

## Best Practices

### 1. Use Two Connections

Always use separate connections for pub and sub:

```typescript
// ✅ Correct
const publisher = createClient({ url: redis_url });
const subscriber = createClient({ url: redis_url });
await publisher.connect();
await subscriber.connect();

const broadcaster = redisEventBroadcaster({
  redis: publisher,
  subscriberRedis: subscriber,
});

// ❌ Wrong (will deadlock)
const redis = createClient({ url: redis_url });
const broadcaster = redisEventBroadcaster({
  redis,
  subscriberRedis: redis, // Same connection!
});
```

### 2. Structured Event Format

Use consistent JSON structure:

```typescript
// Good: Type-safe events
interface UploadEvent {
  type: "started" | "progress" | "completed";
  uploadId: string;
  timestamp: string;
  data?: Record<string, any>;
}

yield* broadcaster.publish("uploads", JSON.stringify(event));

// Handle with parsing
yield* broadcaster.subscribe("uploads", (message: string) => {
  const event: UploadEvent = JSON.parse(message);
  // Fully typed
});
```

### 3. Channel Naming Convention

Organize channels hierarchically:

```typescript
// Good: Clear hierarchy
"uploads:started"
"uploads:completed"
"flows:job:123:status"
"cache:invalidate"

// Avoid: Flat or unclear
"event", "update", "msg"
```

## Deployment

### Docker Compose

```yaml
version: "3"
services:
  app1:
    build: .
    environment:
      REDIS_URL: redis://redis:6379
    depends_on:
      - redis
  app2:
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
          value: redis://redis-service.default.svc.cluster.local:6379
```

## Monitoring

### Check Active Subscriptions

```bash
redis-cli PUBSUB CHANNELS
# Shows all active channels

redis-cli PUBSUB NUMSUB uploads:complete
# Shows number of subscribers per channel
```

### Monitor Published Events

```bash
redis-cli
> SUBSCRIBE uploads:complete
```

## Related Packages

- [@uploadista/core](../../core) - Core types
- [@uploadista/event-broadcaster-ioredis](../ioredis) - IORedis broadcaster with clustering
- [@uploadista/event-broadcaster-memory](../memory) - Single-process broadcaster
- [@uploadista/event-emitter-websocket](../../event-emitters/websocket) - WebSocket real-time
- [@uploadista/kv-store-redis](../../kv-stores/redis) - Redis KV store
- [@uploadista/server](../../servers/server) - Upload server

## Troubleshooting

### "Pub/Sub connection blocked" Error

Using same connection for pub and sub:

```typescript
// ❌ Wrong
const redis = createClient();
const broadcaster = redisEventBroadcaster({
  redis,
  subscriberRedis: redis, // Same!
});

// ✅ Fix
const pubRedis = createClient();
const subRedis = createClient();
const broadcaster = redisEventBroadcaster({
  redis: pubRedis,
  subscriberRedis: subRedis,
});
```

### Events Not Delivered

Verify subscription is active before publishing:

```typescript
// ✅ Subscribe first
yield* broadcaster.subscribe("channel", handler);
yield* broadcaster.publish("channel", "message");

// ❌ Publish without subscribers
yield* broadcaster.publish("channel", "message"); // Lost!
yield* broadcaster.subscribe("channel", handler); // Never receives
```

### High Latency

Check Redis connection and network:

```bash
# Monitor Redis latency
redis-cli --latency

# Check network between app and Redis
ping redis-host
```

### Memory Growth

Redis stores subscriptions in memory. Clean up when done:

```typescript
yield* broadcaster.subscribe("channel", handler);
// Do work...
yield* broadcaster.unsubscribe("channel");
```

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [EVENT_SYSTEM.md](./EVENT_SYSTEM.md) - Architecture and patterns
- [Server Setup Guide](../../../SERVER_SETUP.md#redis-events) - Redis in servers
- [Redis Pub/Sub Documentation](https://redis.io/topics/pubsub) - Official Redis Pub/Sub
- [IORedis Broadcaster](../ioredis/README.md) - For clustering
- [WebSocket Event Emitter](../../event-emitters/websocket/README.md) - Real-time WebSocket
