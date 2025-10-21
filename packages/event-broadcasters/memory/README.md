# @uploadista/event-broadcaster-memory

In-memory event broadcaster for Uploadista. Broadcasts events within a single process for development and single-server deployments.

## Overview

The memory event broadcaster uses JavaScript Maps to distribute events within a single process. Perfect for:

- **Development & Testing**: No external services needed
- **Single-Process Servers**: All instances in same process
- **WebSocket Servers**: Real-time updates to connected clients
- **Prototyping**: Quick experimentation with event flows

Events are only broadcast to subscribers in the same process. For distributed systems, use [Redis](#see-also) or [Cloudflare Durable Objects](#see-also).

## Installation

```bash
npm install @uploadista/event-broadcaster-memory
# or
pnpm add @uploadista/event-broadcaster-memory
```

### Prerequisites

- Node.js 18+
- No external services required

## Quick Start

```typescript
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { Effect } from "effect";

// Use the memory broadcaster layer
const program = Effect.gen(function* () {
  // Event broadcaster is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(memoryEventBroadcaster),
    // ... other layers
  )
);
```

## Features

- ✅ **Zero Setup**: Works out of the box
- ✅ **Sub-Millisecond Latency**: In-memory operations (~100μs)
- ✅ **Synchronous Broadcasting**: Events delivered immediately
- ✅ **Type Safe**: Full TypeScript support
- ✅ **Simple API**: Publish/subscribe pattern

## API Reference

### Main Exports

#### `memoryEventBroadcaster: Layer<EventBroadcasterService>`

Pre-configured Effect layer providing the `EventBroadcasterService` with in-memory broadcasting.

```typescript
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const layer = memoryEventBroadcaster;
// Type: Layer<never, never, EventBroadcasterService>
```

#### `createMemoryEventBroadcaster(): EventBroadcaster`

Factory function to create a new broadcaster instance.

```typescript
import { createMemoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const broadcaster = createMemoryEventBroadcaster();
```

### Available Operations

The memory broadcaster implements the `EventBroadcaster` interface:

#### `publish(channel: string, message: string): Effect<void>`

Broadcast a message to all subscribers on a channel.

```typescript
const program = Effect.gen(function* () {
  yield* broadcaster.publish("uploads:complete", JSON.stringify({
    uploadId: "abc123",
    status: "completed",
  }));
});
```

#### `subscribe(channel: string, handler: (message: string) => void): Effect<void>`

Subscribe to a channel and receive messages.

```typescript
const program = Effect.gen(function* () {
  yield* broadcaster.subscribe("uploads:complete", (message: string) => {
    const event = JSON.parse(message);
    console.log(`Upload complete: ${event.uploadId}`);
  });
});
```

#### `unsubscribe(channel: string): Effect<void>`

Unsubscribe from a channel (removes all handlers).

```typescript
const program = Effect.gen(function* () {
  yield* broadcaster.unsubscribe("uploads:complete");
});
```

## Configuration

The memory broadcaster requires no configuration:

```typescript
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { uploadServer } from "@uploadista/server";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const server = yield* uploadServer;
  // Broadcaster is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(memoryEventBroadcaster),
    // ... other layers
  )
);
```

## Examples

### Example 1: Upload Progress Notifications

```typescript
import { createMemoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { Effect } from "effect";

const broadcaster = createMemoryEventBroadcaster();

interface UploadEvent {
  uploadId: string;
  status: "started" | "progress" | "completed" | "failed";
  progress?: number;
  error?: string;
}

const program = Effect.gen(function* () {
  // Subscribe to upload events
  yield* broadcaster.subscribe("uploads:*", (message: string) => {
    const event: UploadEvent = JSON.parse(message);
    console.log(`[${event.status}] Upload ${event.uploadId}`);

    if (event.progress !== undefined) {
      console.log(`  Progress: ${(event.progress * 100).toFixed(1)}%`);
    }

    if (event.error) {
      console.log(`  Error: ${event.error}`);
    }
  });

  // Simulate upload events
  yield* broadcaster.publish("uploads:*", JSON.stringify({
    uploadId: "upl_123",
    status: "started",
  }));

  yield* broadcaster.publish("uploads:*", JSON.stringify({
    uploadId: "upl_123",
    status: "progress",
    progress: 0.5,
  }));

  yield* broadcaster.publish("uploads:*", JSON.stringify({
    uploadId: "upl_123",
    status: "completed",
  }));
});

Effect.runSync(program);
```

### Example 2: Flow Job Status Updates

```typescript
import { createMemoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { Effect } from "effect";

const broadcaster = createMemoryEventBroadcaster();

interface FlowEvent {
  jobId: string;
  stage: "queued" | "processing" | "completed";
  duration?: number;
}

const trackFlowJob = (jobId: string) =>
  Effect.gen(function* () {
    // Subscribe to job events
    yield* broadcaster.subscribe(`flow:${jobId}`, (message: string) => {
      const event: FlowEvent = JSON.parse(message);
      console.log(`Job ${event.jobId}: ${event.stage}`);

      if (event.duration) {
        console.log(`  Duration: ${event.duration}ms`);
      }
    });

    // Emit events
    yield* broadcaster.publish(
      `flow:${jobId}`,
      JSON.stringify({ jobId, stage: "queued" })
    );

    yield* Effect.sleep("1 seconds");

    yield* broadcaster.publish(
      `flow:${jobId}`,
      JSON.stringify({ jobId, stage: "processing" })
    );

    yield* Effect.sleep("3 seconds");

    yield* broadcaster.publish(
      `flow:${jobId}`,
      JSON.stringify({ jobId, stage: "completed", duration: 4000 })
    );
  });

const program = Effect.gen(function* () {
  yield* trackFlowJob("job_abc123");
});

Effect.runSync(program);
```

### Example 3: Integration with WebSocket

```typescript
import { createMemoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { Effect } from "effect";

const broadcaster = createMemoryEventBroadcaster();

// In your WebSocket handler
const handleUploadEvent = (
  uploadId: string,
  clientWebSocket: WebSocket
) =>
  Effect.gen(function* () {
    // Subscribe to upload events
    yield* broadcaster.subscribe(`uploads:${uploadId}`, (message: string) => {
      // Send to WebSocket client
      clientWebSocket.send(message);
    });
  });
```

## Performance Characteristics

| Operation | Latency | Throughput |
|-----------|---------|-----------|
| publish() | ~100μs  | 10,000+ events/sec |
| subscribe() | ~100μs  | N/A |
| unsubscribe() | ~100μs  | N/A |

All operations are synchronous and complete in microseconds.

## Limitations

- **Single Process Only**: No distribution across servers
- **No Persistence**: Events are lost if not immediately processed
- **No Pattern Matching**: Cannot use wildcards in channel names
- **Memory Grows**: Subscribers accumulate in memory
- **No TTL**: Subscriptions persist until explicitly removed

## Use Cases

✅ **Perfect For**:
- Local development
- Unit/integration testing
- Single-server deployments
- Real-time WebSocket updates
- Prototyping event flows

❌ **Not Recommended For**:
- Distributed systems (use Redis)
- Event persistence (use database)
- Pub/Sub patterns with many subscribers
- High-throughput production systems (>1000 events/sec)

## Best Practices

### 1. Use Consistent Channel Naming

```typescript
// Good: Hierarchical naming
"uploads:started"
"uploads:progress"
"uploads:completed"
"flows:abc123:status"

// Avoid: Generic names
"events", "updates", "status"
```

### 2. Clean Up Subscriptions

```typescript
const program = Effect.gen(function* () {
  // Subscribe
  yield* broadcaster.subscribe("uploads:*", handler);

  // Do work...

  // Clean up when done
  yield* broadcaster.unsubscribe("uploads:*");
});
```

### 3. Handle Synchronous Publishing

Events are delivered immediately and synchronously:

```typescript
// This handler runs immediately
yield* broadcaster.subscribe("channel", (msg) => {
  console.log("Received:", msg);
});

// This publishes immediately to handler above
yield* broadcaster.publish("channel", "test");
// "Received: test" is printed before publish() completes
```

## Deployment

### Single-Server Node.js

```typescript
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";
import { uploadServer } from "@uploadista/server";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const server = yield* uploadServer;
  // Use broadcaster for WebSocket updates
});

Effect.runSync(
  program.pipe(
    Effect.provide(memoryEventBroadcaster),
    // ... other layers
  )
);
```

### Docker Single Container

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY . .
RUN npm ci --omit=dev && npm run build

ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
```

```yaml
version: "3"
services:
  app:
    build: .
    ports:
      - "3000:3000"
    # Single instance only
```

## Limitations & Workarounds

### Multiple Instances Don't Share Events

If you scale to multiple processes, they won't communicate:

```typescript
// Server 1: Publishes to memory broadcaster
yield* broadcaster.publish("channel", "message1");

// Server 2: Will NOT receive message1 (different process)
// Solution: Use Redis broadcaster instead
```

### High Subscriber Count

If many subscribers accumulate, unsubscribe to clean up:

```typescript
// Create isolated broadcaster instances
const createIsolatedBroadcaster = () => createMemoryEventBroadcaster();

// Use separate instance per namespace
const uploadBroadcaster = createIsolatedBroadcaster();
const flowBroadcaster = createIsolatedBroadcaster();
```

## Troubleshooting

### Events Not Received

Ensure subscribers are registered before publishing:

```typescript
// ❌ Wrong: Subscribe after publish
yield* broadcaster.publish("channel", "message");
yield* broadcaster.subscribe("channel", handler); // Won't receive above

// ✅ Correct: Subscribe first
yield* broadcaster.subscribe("channel", handler);
yield* broadcaster.publish("channel", "message");
```

### Memory Leaks

Unsubscribe when no longer needed:

```typescript
// ❌ Don't do this in loops
for (let i = 0; i < 1000; i++) {
  yield* broadcaster.subscribe("channel", handler);
}

// ✅ Clean up explicitly
yield* broadcaster.unsubscribe("channel");
```

## Related Packages

- [@uploadista/core](../../core) - Core types
- [@uploadista/event-broadcaster-redis](../event-broadcasters/redis) - Distributed Redis broadcaster
- [@uploadista/event-emitter-websocket](../event-emitters/websocket) - WebSocket real-time events
- [@uploadista/server](../../servers/server) - Upload server with events
- [@uploadista/kv-store-memory](../../kv-stores/memory) - In-memory KV store

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [EVENT_SYSTEM.md](./EVENT_SYSTEM.md) - Architecture and patterns
- [Server Setup Guide](../../../SERVER_SETUP.md#events) - Using broadcasters in servers
- [WebSocket Event Emitter](../event-emitters/websocket/README.md) - Real-time WebSocket events
