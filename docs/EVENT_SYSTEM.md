# Uploadista Event System Architecture

This guide explains the event broadcasting and emission system in Uploadista.

## Core Concepts

### Event Broadcaster

Distributes events across multiple subscribers, potentially across many server instances.

```
Publisher ──→ Broadcaster ──→ Subscriber 1
              (in-memory,    │ Subscriber 2
               redis,         └─ Subscriber 3
              ioredis,            (on different servers)
              or DO)
```

**Key Characteristics**:
- **Publish-Subscribe**: Many subscribers per channel
- **Fire-and-Forget**: Event lost if no subscribers
- **Channel-Based**: Organize by event types
- **Broadcast**: All subscribers receive same event

### Event Emitter

Sends events to specific connected clients via WebSocket.

```
Server ──→ Emitter ──→ WebSocket Connection 1
          (WebSocket   │ WebSocket Connection 2
           or DO)      └─ WebSocket Connection 3
```

**Key Characteristics**:
- **Connection-Based**: Tied to client connections
- **Real-Time**: Sub-millisecond delivery
- **Persistent**: Connection stays open
- **Addressed**: Events routed to specific clients

## Architecture Overview

```
┌─────────────────────── Upload Server ─────────────────────┐
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           Event System Layer                         │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  Event Emitter                                  │ │  │
│  │  │  (WebSocket or Durable Object)                  │ │  │
│  │  │  - subscribe(event, connection)                 │ │  │
│  │  │  - emit(event, message)                         │ │  │
│  │  │  - unsubscribe(event)                           │ │  │
│  │  └────────────────┬────────────────────────────────┘ │  │
│  │                   │                                    │  │
│  │                   ↓                                    │  │
│  │  ┌─────────────────────────────────────────────────┐ │  │
│  │  │  Event Broadcaster                              │ │  │
│  │  │  (Memory, Redis, IORedis, or Durable Object)    │ │  │
│  │  │  - publish(channel, message)                    │ │  │
│  │  │  - subscribe(channel, handler)                  │ │  │
│  │  │  - unsubscribe(channel)                         │ │  │
│  │  └─────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│                      │                                      │
│  ┌──────────────────┼──────────────────┐                   │
│  │                  │                  │                   │
│  ↓                  ↓                  ↓                   │
│ Upload        Flow Execution     Cache Management         │
│ Server        Coordinator        System                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         ↓                      ↓                      ↓
    Store Backends      Flow Processing        Connected Clients
    (S3, Azure, R2)     (Image Resize, etc)    (Browser WebSocket)
```

## Event Flow Patterns

### Pattern 1: Upload Progress to Client

```
1. Upload starts on server
2. Server publishes "uploads:started" event
3. Event emitter delivers to WebSocket client
4. Browser receives real-time progress updates

Flow:
  Server ──publish──→ Broadcaster ──→ Emitter ──→ WebSocket ──→ Browser
                                       (listening)
```

### Pattern 2: Cross-Server Coordination

```
1. Server A completes upload
2. Server A publishes "uploads:complete:abc123"
3. Broadcaster distributes to all servers
4. Server B, C receive and process independently

Flow:
  Server A ──publish──→ Broadcaster ──→ Server B (subscribe)
                          │
                          └──→ Server C (subscribe)
```

### Pattern 3: Real-Time Flow Updates

```
1. Flow job starts processing
2. Flow engine emits progress events
3. WebSocket delivers updates to monitoring client
4. Browser shows real-time processing status

Flow:
  Flow Engine ──emit──→ Emitter ──→ WebSocket ──→ Monitor Dashboard
```

## Broadcaster Comparison

### Memory Broadcaster
- **Use**: Single process, development
- **Distribution**: None (same process only)
- **Latency**: ~100μs
- **Scalability**: Limited to one server

```
Server (single process)
  ├─ Subscriber 1 ─┐
  ├─ Subscriber 2  ├─ All in same process
  └─ Subscriber 3 ─┘
```

### Redis Broadcaster
- **Use**: Distributed systems, moderate scale
- **Distribution**: All servers
- **Latency**: 1-2ms
- **Scalability**: 50+ servers

```
Server 1 ──→ Publisher ─┐
Server 2 ──→ Subscriber ├─ Redis Pub/Sub ──→ All servers subscribe
Server 3 ──→ Subscriber ─┘
```

### IORedis Broadcaster
- **Use**: Large scale, clustering, failover
- **Distribution**: Cluster-aware, replicated
- **Latency**: 1-2ms
- **Scalability**: 100+ servers, auto-failover

```
Servers ──→ Redis Cluster ──→ Auto-replicated ──→ All servers
         (16 shards)           across cluster
            + Sentinel
         (automatic failover)
```

### Durable Objects Broadcaster
- **Use**: Cloudflare Workers, global edge
- **Distribution**: 300+ edge locations
- **Latency**: 5-10ms globally
- **Scalability**: Unlimited

```
Workers globally ──→ Durable Object ──→ Replicated globally ──→ All regions
                   (edge)
```

## Emitter Comparison

### WebSocket Emitter
- **Use**: Real-time client updates
- **Connection**: Persistent WebSocket
- **Latency**: 5-50ms (depends on network)
- **Clients**: Browsers, Node.js clients

```
┌─ Connected Client 1
├─ Connected Client 2
└─ Connected Client 3
   (all receive events)
```

### Durable Object Emitter
- **Use**: Cloudflare Workers, global coordination
- **Connection**: Persistent WebSocket via DO
- **Latency**: 10-50ms globally
- **Clients**: Anywhere globally

```
┌─ Client in US
├─ Client in EU
└─ Client in Asia
   (all connected via edge)
```

## Common Use Cases

### Use Case 1: Single-Server Upload Service

```
Architecture:
- Memory Broadcaster (single process)
- WebSocket Emitter
- Browser clients

Code:
```typescript
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";

Effect.provide(
  webSocketEventEmitter(memoryEventBroadcaster)
);
```

### Use Case 2: Distributed Upload Service (10+ servers)

```
Architecture:
- Redis Broadcaster (distributed)
- WebSocket Emitter on each server
- Browser clients connect to load balancer

Code:
```typescript
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";

const broadcaster = redisEventBroadcaster({
  redis: pubClient,
  subscriberRedis: subClient,
});

Effect.provide(
  webSocketEventEmitter(broadcaster)
);
```

### Use Case 3: High-Scale Clustered Service (100+ servers)

```
Architecture:
- IORedis Broadcaster with Sentinel
- WebSocket Emitter on each server
- Automatic failover

Code:
```typescript
import { ioRedisEventBroadcaster } from "@uploadista/event-broadcaster-ioredis";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";

const broadcaster = ioRedisEventBroadcaster({
  redis: new Redis.Cluster(nodes, { Sentinel setup }),
  subscriberRedis: new Redis.Cluster(nodes, { Sentinel setup }),
});

Effect.provide(
  webSocketEventEmitter(broadcaster)
);
```

### Use Case 4: Global Serverless (Cloudflare Workers)

```
Architecture:
- Durable Objects Broadcaster
- Durable Objects Emitter
- Browser clients globally

Code:
```typescript
import { uploadEventEmitterDurableObjectStore } from "@uploadista/event-emitter-durable-object";

Effect.provide(
  uploadEventEmitterDurableObjectStore({
    durableObject: env.EVENT_EMITTER_DO,
  })
);
```

## Event Types

### Upload Events

```typescript
interface UploadEvent {
  type: "started" | "progress" | "completed" | "failed";
  uploadId: string;
  timestamp: string;
  progress?: number;        // 0.0 - 1.0
  bytesReceived?: number;
  totalBytes?: number;
  error?: string;
}
```

### Flow Events

```typescript
interface FlowEvent {
  type: "queued" | "running" | "completed" | "failed";
  jobId: string;
  uploadId: string;
  timestamp: string;
  progress?: number;
  duration?: number;
  error?: string;
}
```

### Cache Events

```typescript
interface CacheEvent {
  type: "invalidate";
  key: string;
  timestamp: string;
}
```

## Channel Naming Convention

Organize channels hierarchically:

```
uploads:*
  ├─ uploads:started
  ├─ uploads:progress
  ├─ uploads:completed
  └─ uploads:failed

flows:*
  ├─ flows:queued
  ├─ flows:processing
  └─ flows:completed

cache:*
  ├─ cache:invalidate
  └─ cache:refresh
```

## Implementation Strategies

### Strategy 1: Broadcasters Only (Backend Coordination)

**When**: Servers coordinate without browser clients

```typescript
// Servers listen to each other
yield* broadcaster.subscribe("uploads:complete", (msg) => {
  // Server B processes the event
  // No WebSocket involved
});

// Server A publishes
yield* broadcaster.publish("uploads:complete", data);
```

### Strategy 2: Emitters Only (Direct WebSocket)

**When**: Server sends directly to connected clients

```typescript
// Each connection subscribes directly
yield* emitter.subscribe("upload:123", wsConnection);

// Server emits to this upload's subscribers
yield* emitter.emit("upload:123", progressUpdate);
```

### Strategy 3: Combined (Full Stack)

**When**: Servers coordinate AND clients get updates

```typescript
// Servers listen to each other via broadcaster
yield* broadcaster.subscribe("uploads:complete", (msg) => {
  const { uploadId, status } = JSON.parse(msg);

  // Emit to connected clients
  yield* emitter.emit(`upload:${uploadId}`, {
    status,
    timestamp: new Date().toISOString(),
  });
});

// Server A publishes
yield* broadcaster.publish("uploads:complete", JSON.stringify({
  uploadId,
  status: "completed",
}));
```

## Performance Optimization

### 1. Use Specific Channel Names

```typescript
// Good: Specific uploads
"uploads:abc123"
"uploads:xyz789"

// Bad: Generic
"updates"
"events"

// Result: Fewer subscribers per channel = faster delivery
```

### 2. Batch Events

```typescript
// Instead of many publishes
for (const update of updates) {
  yield* broadcaster.publish("channel", JSON.stringify(update));
}

// Batch them
const batch = JSON.stringify(updates);
yield* broadcaster.publish("channel", batch);

// Client unmarshals batch
const updates = JSON.parse(message);
```

### 3. Compress Large Messages

```typescript
import { compress, decompress } from "lz4";

// Compress before publish
const compressed = compress(JSON.stringify(largeData));
yield* broadcaster.publish("channel", compressed);

// Client decompresses
const decompressed = decompress(message);
```

## Monitoring & Debugging

### Redis Monitor

```bash
# Watch all events
redis-cli MONITOR

# Check channels
redis-cli PUBSUB CHANNELS

# Count subscribers
redis-cli PUBSUB NUMSUB "uploads:*"
```

### WebSocket Debugging

```typescript
// Log all events
yield* emitter.subscribe("*", (msg) => {
  console.log("Event:", msg);
  yield* emitter.emit(key, msg); // Re-emit for subscribers
});

// Browser DevTools
ws.addEventListener("message", (event) => {
  console.log("Received:", event.data);
});
```

## Troubleshooting

### Events Not Delivered

**Check**: Are subscribers registered before publishing?

```typescript
// ❌ Wrong order
yield* broadcaster.publish("channel", message);
yield* broadcaster.subscribe("channel", handler);

// ✅ Correct
yield* broadcaster.subscribe("channel", handler);
yield* broadcaster.publish("channel", message);
```

### High Latency

**Check**:
1. Broadcaster connection: `redis-cli LATENCY LATEST`
2. Network: `ping server`
3. Client distance: Use geographic testing tools

### Memory Leaks

**Check**: Are unsubscribe() called when done?

```typescript
// Cleanup
ws.addEventListener("close", () => {
  yield* emitter.unsubscribe(eventKey);
  yield* broadcaster.unsubscribe(channel);
});
```

## Decision Tree

```
START: "I need events in my upload system"

├─ Are servers separate instances?
│  ├─ NO → Memory Broadcaster + WebSocket Emitter
│  ├─ YES (< 5 servers) → Redis Broadcaster + WebSocket
│  └─ YES (5+ servers) → IORedis with Sentinel + WebSocket
│
├─ Do clients need real-time updates?
│  ├─ NO → Broadcaster only (server-to-server)
│  ├─ YES → Add WebSocket Emitter
│  └─ YES (Cloudflare) → Durable Objects Emitter
│
├─ What's the scale?
│  ├─ Development → Memory Broadcaster
│  ├─ Small (1 server) → Filesystem KV + Memory
│  ├─ Medium (2-10 servers) → Redis Broadcaster
│  ├─ Large (10-100 servers) → IORedis + Sentinel
│  └─ Global/Edge → Durable Objects
```

## Related Packages

- [@uploadista/event-broadcaster-memory](./event-broadcasters/memory/README.md)
- [@uploadista/event-broadcaster-redis](./event-broadcasters/redis/README.md)
- [@uploadista/event-broadcaster-ioredis](./event-broadcasters/ioredis/README.md)
- [@uploadista/event-emitter-websocket](./event-emitters/websocket/README.md)
- [@uploadista/event-emitter-durable-object](./event-emitters/durable-object/README.md)

## See Also

- [Server Setup Guide](../../SERVER_SETUP.md) - Integration examples
- [KV Stores Comparison](./kv-stores/KV_STORES_COMPARISON.md) - State management
