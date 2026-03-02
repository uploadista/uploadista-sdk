# @uploadista/queue-store-ioredis

IORedis-backed `FlowQueueStore` implementation for the Uploadista flow queue.

Functionally identical to `@uploadista/queue-store-redis` but uses the `ioredis`
client API. Queue items are persisted to Redis and survive process restarts.

## Install

```bash
npm install @uploadista/queue-store-ioredis ioredis
# or
pnpm add @uploadista/queue-store-ioredis ioredis
```

## Usage

```typescript
import Redis from "ioredis";
import { IoRedisFlowQueueStore } from "@uploadista/queue-store-ioredis";
import { FlowQueueService } from "@uploadista/core/flow";
import { Effect } from "effect";

const redis = new Redis({ host: "localhost", port: 6379 });

const store = new IoRedisFlowQueueStore({ redis });

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

Same layout as `@uploadista/queue-store-redis`:

| Key | Type | Description |
|---|---|---|
| `uploadista:queue:item:<id>` | String (JSON) | Full FlowQueueItem serialized as JSON |
| `uploadista:queue:pending` | Sorted Set | Pending item IDs, scored by `enqueuedAt` ms (FIFO) |
| `uploadista:queue:running` | Set | Currently-running item IDs |

## IoRedisLike Interface

`IoRedisFlowQueueStore` accepts any client satisfying the `IoRedisLike` interface
(exported from this package). The standard `ioredis` Redis class satisfies this
interface out of the box.

Key API differences from node-redis (handled internally):
- `zadd(key, score, member)` — ioredis argument order (score before member)
- `scan(cursor, "MATCH", pattern, "COUNT", count)` — returns `[cursor, keys]` tuple

## Configuration

```typescript
interface IoRedisFlowQueueStoreConfig {
  redis: IoRedisLike;
}
```
