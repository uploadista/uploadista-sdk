# @uploadista/kv-store-memory

In-memory key-value store for Uploadista. Perfect for development, testing, and single-process deployments.

## Overview

The memory KV store provides a simple, synchronous in-memory storage backend using JavaScript Maps. It's designed for:

- **Development**: Instant setup, no external dependencies
- **Testing**: Predictable behavior, no network latency
- **Single-Process Servers**: Single-machine deployments without state sharing
- **Prototyping**: Quick proof-of-concepts

All data is stored in RAM and will be lost when the process exits. For persistent or distributed storage, use [Redis](#see-also), [Cloudflare KV](#see-also), or [Filesystem](#see-also) stores.

## Installation

```bash
npm install @uploadista/kv-store-memory
# or
pnpm add @uploadista/kv-store-memory
```

### Prerequisites

- Node.js 18+ (JavaScript runtime)
- No external services required

## Quick Start

```typescript
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { Effect } from "effect";

// Use the memory store layer directly
const program = Effect.gen(function* () {
  // The memoryKvStore layer is already configured
  // No additional setup needed
});

// Run with the memory store
Effect.runSync(program.pipe(Effect.provide(memoryKvStore)));
```

## Features

- ✅ **Zero Setup**: Works out of the box with no configuration
- ✅ **Synchronous Operations**: Fast in-memory access (~1μs per operation)
- ✅ **Pattern Matching**: Prefix-based key listing for batch operations
- ✅ **Effect-TS Integration**: Full async/error handling with Effect
- ✅ **Type Safe**: Full TypeScript support with strict typing

## API Reference

### Main Exports

#### `memoryKvStore: Layer<BaseKvStoreService>`

Pre-configured Effect layer providing the `BaseKvStoreService` with in-memory storage.

```typescript
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { Effect, Layer } from "effect";

const layer = memoryKvStore;
// Type: Layer<never, never, BaseKvStoreService>
```

#### `makeMemoryBaseKvStore(): BaseKvStore`

Factory function to create a new memory KV store instance. Useful for creating multiple isolated stores.

```typescript
import { makeMemoryBaseKvStore } from "@uploadista/kv-store-memory";

const store = makeMemoryBaseKvStore();
const value = store.get("key"); // Effect<string | null>
```

### Available Operations

The memory store implements the `BaseKvStore` interface:

#### `get(key: string): Effect<string | null>`

Retrieve a value by key. Returns `null` if key doesn't exist.

```typescript
const program = Effect.gen(function* () {
  const value = yield* store.get("user:123");
  // value is either a string or null
});
```

#### `set(key: string, value: string): Effect<void>`

Store a string value. Overwrites existing value if key exists.

```typescript
const program = Effect.gen(function* () {
  yield* store.set("user:123", JSON.stringify({ name: "Alice" }));
});
```

#### `delete(key: string): Effect<void>`

Remove a key. Safe to call on non-existent keys (no-op).

```typescript
const program = Effect.gen(function* () {
  yield* store.delete("user:123");
});
```

#### `list(keyPrefix: string): Effect<string[]>`

List all keys matching a prefix. Returns array of key names (without prefix).

```typescript
const program = Effect.gen(function* () {
  const keys = yield* store.list("user:");
  // Returns: ["123", "456", "789"] for keys ["user:123", "user:456", "user:789"]
});
```

## Configuration

The memory store requires no configuration. Simply import and use:

```typescript
import { memoryKvStore } from "@uploadista/kv-store-memory";
import { uploadServer } from "@uploadista/server";
import { Effect } from "effect";

const program = Effect.gen(function* () {
  const server = yield* uploadServer;
  // Store is automatically available
});

Effect.runSync(
  program.pipe(
    Effect.provide(memoryKvStore),
    // ... other layers
  )
);
```

## Examples

### Example 1: Upload Session Storage

Store and retrieve upload file metadata:

```typescript
import { makeMemoryBaseKvStore } from "@uploadista/kv-store-memory";
import { Effect } from "effect";

const store = makeMemoryBaseKvStore();

interface UploadMetadata {
  filename: string;
  size: number;
  uploadedAt: string;
}

const program = Effect.gen(function* () {
  // Store metadata
  const metadata: UploadMetadata = {
    filename: "document.pdf",
    size: 2097152,
    uploadedAt: new Date().toISOString(),
  };

  yield* store.set("upload:abc123", JSON.stringify(metadata));

  // Retrieve metadata
  const stored = yield* store.get("upload:abc123");
  const parsed = stored ? JSON.parse(stored) : null;
  console.log(parsed);
  // { filename: "document.pdf", size: 2097152, uploadedAt: "2025-10-21T..." }
});

Effect.runSync(program);
```

### Example 2: Batch Operations

List and process multiple keys:

```typescript
import { makeMemoryBaseKvStore } from "@uploadista/kv-store-memory";
import { Effect } from "effect";

const store = makeMemoryBaseKvStore();

const program = Effect.gen(function* () {
  // Store multiple items
  yield* store.set("session:user1", JSON.stringify({ token: "abc" }));
  yield* store.set("session:user2", JSON.stringify({ token: "def" }));
  yield* store.set("session:user3", JSON.stringify({ token: "ghi" }));

  // List all sessions
  const sessionKeys = yield* store.list("session:");
  console.log(sessionKeys); // ["user1", "user2", "user3"]

  // Process each session
  for (const key of sessionKeys) {
    const fullKey = `session:${key}`;
    const data = yield* store.get(fullKey);
    console.log(`${fullKey}: ${data}`);
  }
});

Effect.runSync(program);
```

### Example 3: Error Handling

Memory store operations rarely fail, but always handle effects properly:

```typescript
import { makeMemoryBaseKvStore } from "@uploadista/kv-store-memory";
import { Effect } from "effect";

const store = makeMemoryBaseKvStore();

const program = Effect.gen(function* () {
  const value = yield* store.get("key");

  if (value === null) {
    console.log("Key not found, using default");
    yield* store.set("key", "default-value");
  } else {
    console.log("Value:", value);
  }
});

Effect.runSync(program);
```

## Limitations

- **No Persistence**: Data is lost when the process exits
- **Single-Process Only**: Not suitable for distributed systems
- **No TTL/Expiration**: Values persist until explicitly deleted
- **Memory Growth**: No automatic cleanup; responsibility falls to application
- **No Transactions**: Individual operations are atomic, but multi-step operations are not

## Use Cases

✅ **Perfect For**:
- Local development and testing
- Prototype and MVP applications
- Single-server deployments (same machine)
- Unit/integration tests with fast execution

❌ **Not Recommended For**:
- Distributed/clustered systems (use [Redis](#see-also) instead)
- Applications requiring data persistence (use [Filesystem](#see-also) or [Azure](#see-also))
- High-memory applications with millions of keys
- Serverless/edge deployments (use [Cloudflare KV](#see-also))

## Performance Characteristics

| Operation | Latency | Scaling |
|-----------|---------|---------|
| get()     | ~1μs    | O(1) |
| set()     | ~1μs    | O(1) |
| delete()  | ~1μs    | O(1) |
| list()    | ~100μs  | O(n) where n = matching keys |

Memory usage is proportional to total data stored. 1MB of data ≈ 1MB RAM.

## Related Packages

- [@uploadista/core](../../core) - Core types and interfaces
- [@uploadista/kv-store-redis](../redis) - Distributed Redis store
- [@uploadista/kv-store-ioredis](../ioredis) - IORedis with clustering
- [@uploadista/kv-store-cloudflare-kv](../cloudflare-kv) - Edge-deployed KV
- [@uploadista/kv-store-filesystem](../filesystem) - Persistent file-based store
- [@uploadista/server](../../servers/server) - Upload server using KV stores

## Troubleshooting

### Data Lost After Process Restart

This is expected behavior. Memory stores are ephemeral by design. For persistent storage:

```typescript
// Use filesystem store instead
import { fileKvStore } from "@uploadista/kv-store-filesystem";

const layer = fileKvStore({ directory: "./data" });
```

### Out of Memory Errors

If handling massive files or many concurrent uploads, memory may be exhausted. Solutions:

1. **Reduce In-Flight Uploads**: Implement rate limiting at the upload endpoint
2. **Use Streaming**: Implement chunked uploads to avoid buffering entire files
3. **Switch to Persistent Store**: Use Redis or Filesystem for external state management

```typescript
// Monitor memory usage
console.log(process.memoryUsage());
// { rss: 45MB, heapTotal: 30MB, heapUsed: 20MB, external: 5MB }
```

### Multiple Instances Share Data?

Each `makeMemoryBaseKvStore()` call creates an isolated store. To share state:

```typescript
// These are separate stores - data doesn't cross
const store1 = makeMemoryBaseKvStore();
const store2 = makeMemoryBaseKvStore();

// Use a single instance across your app
const sharedStore = makeMemoryBaseKvStore();
export { sharedStore };
```

## License

See [LICENSE](../../../LICENSE) in the main repository.

## See Also

- [KV Stores Comparison Guide](../KV_STORES_COMPARISON.md) - Compare all KV store options
- [Server Setup Guide](../../../SERVER_SETUP.md) - Using KV stores in production servers
- [Effect-TS Documentation](https://effect.website/) - Learn Effect patterns used throughout
