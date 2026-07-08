# @uploadista/queue-store-redis

Redis-backed `FlowQueueStore` implementation for the Uploadista flow queue.

Queue items are persisted to Redis and survive process restarts. Multiple server
instances sharing the same Redis connection share queue state (pending items are
stored in a sorted set for FIFO ordering; running items are tracked in a Redis set).

## Install

```bash
npm install @uploadista/queue-store-redis redis
# or
pnpm add @uploadista/queue-store-redis redis
```

## Usage

```typescript
import { createClient } from "redis";
import { RedisFlowQueueStore } from "@uploadista/queue-store-redis";
import { FlowQueueService } from "@uploadista/core/flow";
import { Effect } from "effect";

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const store = new RedisFlowQueueStore({ redis });

// Wire into FlowQueueService
const queueLayer = FlowQueueService.make(
  { maxConcurrency: 8, dlqRetryIntervalMs: 30_000 },
  store,
);

const program = myEffect.pipe(
  Effect.provide(queueLayer),
  Effect.provide(flowEngineLayer),
);
```

## Redis Data Layout

| Key | Type | Description |
|---|---|---|
| `uploadista:queue:item:<id>` | String (JSON) | Full FlowQueueItem serialized as JSON |
| `uploadista:queue:pending` | Sorted Set | Pending item IDs, scored by `enqueuedAt` ms (FIFO) |
| `uploadista:queue:running` | Set | Currently-running item IDs |

## RedisLike Interface

`RedisFlowQueueStore` accepts any client satisfying the `RedisLike` interface
(exported from `@uploadista/kv-store-redis`), plus the queue-specific commands
(`zadd`, `zrange`, `zrem`, `sadd`, `srem`, `smembers`). This means the standard
`redis` package (node-redis) works out of the box.

## Configuration

```typescript
interface RedisFlowQueueStoreConfig {
  redis: RedisLike & { zadd; zrange; zrem; sadd; srem; smembers };
}
```
