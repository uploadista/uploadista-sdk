# @uploadista/kv-store-bun

Bun Redis KV store adapter for Uploadista. Uses Bun's native Redis client for high-performance key-value storage.

## Requirements

- **Runtime**: Bun (this package only works in Bun runtime, not Node.js)
- **Redis**: Version 7.2 or higher

## Installation

```bash
pnpm add @uploadista/kv-store-bun
```

## Usage

### Basic Usage

```typescript
import { RedisClient } from "bun";
import { makeBunBaseKvStore } from "@uploadista/kv-store-bun";
import { Effect } from "effect";

// Create a Bun Redis client
const redis = new RedisClient("redis://localhost:6379");

// Create the KV store
const store = makeBunBaseKvStore({ redis });

// Use the store
const program = Effect.gen(function* () {
  // Set a value
  yield* store.set("user:123", JSON.stringify({ name: "John" }));

  // Get a value
  const value = yield* store.get("user:123");
  console.log(value); // '{"name":"John"}'

  // Delete a value
  yield* store.delete("user:123");

  // List keys with prefix
  const keys = yield* store.list!("user:");
  console.log(keys); // ['123', '456', ...]
});

await Effect.runPromise(program);
```

### With Effect Layer

```typescript
import { RedisClient } from "bun";
import { bunKvStore } from "@uploadista/kv-store-bun";
import { BaseKvStoreService } from "@uploadista/core/types";
import { Effect, Layer } from "effect";

const redis = new RedisClient("redis://localhost:6379");

// Create the layer
const kvStoreLayer = bunKvStore({ redis });

// Use in your program
const program = Effect.gen(function* () {
  const store = yield* BaseKvStoreService;
  yield* store.set("key", "value");
  const value = yield* store.get("key");
  return value;
}).pipe(Effect.provide(kvStoreLayer));

await Effect.runPromise(program);
```

## API Reference

### `makeBunBaseKvStore(config)`

Creates a `BaseKvStore` instance using Bun's Redis client.

**Parameters:**
- `config.redis` - A Bun `RedisClient` instance

**Returns:** `BaseKvStore`

### `bunKvStore(config)`

Creates an Effect `Layer` that provides `BaseKvStoreService`.

**Parameters:**
- `config.redis` - A Bun `RedisClient` instance

**Returns:** `Layer<BaseKvStoreService>`

### `BunKvStoreConfig`

Configuration interface for the Bun KV store.

```typescript
interface BunKvStoreConfig {
  redis: RedisClient;
}
```

## BaseKvStore Interface

The store implements the standard `BaseKvStore` interface:

| Method | Description |
|--------|-------------|
| `get(key)` | Retrieves a value by key, returns `null` if not found |
| `set(key, value)` | Stores a string value with the given key |
| `delete(key)` | Removes a value by key |
| `list(keyPrefix)` | Lists all keys matching the prefix (prefix is stripped from results) |

## Performance

Bun's native Redis client offers significant performance benefits over Node.js alternatives:

- ~6x faster than `@redis/client` or `ioredis`
- Built-in automatic pipelining
- Zero external dependencies (part of Bun runtime)
- Native async/await support

## Limitations

- **Bun runtime only**: This package will not work in Node.js or other runtimes
- **Redis 7.2+**: Requires Redis server version 7.2 or higher
- **No Cluster support**: Bun's Redis client does not support Redis Cluster
- **No Sentinel support**: Bun's Redis client does not support Redis Sentinel

## Related Packages

- `@uploadista/kv-store-redis` - For Node.js with `@redis/client`
- `@uploadista/kv-store-ioredis` - For Node.js with `ioredis`
- `@uploadista/kv-store-memory` - In-memory store for testing

## License

MIT
