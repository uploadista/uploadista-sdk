# @uploadista/adapters-fastify

Uploadista adapter for Fastify - High-performance upload servers on Node.js.

Provides a lightweight adapter for integrating Uploadista's file upload and flow processing capabilities with Fastify applications. Built on the unified adapter pattern for consistent behavior across all frameworks.

## Features

- **High Performance** - Fastify's speed with zero-overhead abstractions
- **WebSocket Built-in** - Native `@fastify/websocket` plugin integration
- **Authentication** - Flexible middleware for JWT, OAuth, or custom auth
- **Multi-Cloud Storage** - S3, Azure, GCS, or filesystem backends
- **Event Broadcasting** - Real-time updates via memory or Redis
- **TypeScript** - Full type safety with comprehensive JSDoc
- **Lightweight** - Minimal adapter code (~310 lines) delegates to core server

## Installation

```bash
npm install @uploadista/adapters-fastify @uploadista/server fastify @fastify/websocket
# or
pnpm add @uploadista/adapters-fastify @uploadista/server fastify @fastify/websocket
```

## Requirements

- Fastify 4.x or 5.x
- `@fastify/websocket` 10.x or 11.x
- Node.js 18+
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### Basic Server

```typescript
import websocket from "@fastify/websocket";
import { fastifyAdapter } from "@uploadista/adapters-fastify";
import { fileStore } from "@uploadista/data-store-filesystem";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { createUploadistaServer } from "@uploadista/server";
import Fastify from "fastify";
import { flows } from "./flows";

const fastify = Fastify({ logger: true });

// Register WebSocket plugin
await fastify.register(websocket);

// Create KV store and data store
const kvStore = fileKvStore({ directory: "./uploads" });
const dataStore = fileStore({
  directory: "./uploads",
  deliveryUrl: "http://localhost:3000/uploads",
});

// Create uploadista server with Fastify adapter
const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: fastifyAdapter({}), // <-- New adapter pattern
});

// Add content type parser for binary upload data (PATCH requests)
fastify.addContentTypeParser(
  "application/octet-stream",
  (_req, _payload, done) => {
    done(null);
  }
);

// Mount HTTP endpoints
fastify.all("/uploadista/api/*", async (request, reply) => {
  return uploadistaServer.handler({ request, reply });
});

// Mount WebSocket endpoints
fastify.get(
  "/uploadista/ws/upload/:uploadId",
  { websocket: true },
  uploadistaServer.websocketHandler
);

fastify.get(
  "/uploadista/ws/flow/:jobId",
  { websocket: true },
  uploadistaServer.websocketHandler
);

// Start server
await fastify.listen({ port: 3000, host: "0.0.0.0" });
```

### With Authentication

```typescript
import { fastifyAdapter } from "@uploadista/adapters-fastify";
import { createUploadistaServer } from "@uploadista/server";

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: fastifyAdapter({
    // Optional auth middleware
    authMiddleware: async ({ request, reply }) => {
      const token = request.headers.authorization?.split(" ")[1];
      if (!token) return null;

      try {
        // Verify JWT
        const payload = await verifyToken(token);
        return {
          clientId: payload.sub,
          permissions: payload.permissions,
          metadata: { tier: payload.tier },
        };
      } catch {
        return null; // Null = authentication failed
      }
    },
  }),
  // Optional auth caching
  authCacheConfig: {
    maxSize: 5000,
    ttl: 3600000, // 1 hour
  },
});
```

### With Decorators

Fastify decorators work seamlessly with the adapter:

```typescript
// Add custom decorator
fastify.decorateRequest("customData", "");

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: fastifyAdapter({
    authMiddleware: async ({ request }) => {
      // Access decorated properties
      const userId = request.customData;

      if (!userId) return null;

      return { clientId: userId };
    },
  }),
});
```

### With Redis Event Broadcasting

```typescript
import { createClient } from "redis";
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";

const redisClient = createClient({ url: process.env.REDIS_URL });
const redisSubscriber = createClient({ url: process.env.REDIS_URL });

await redisClient.connect();
await redisSubscriber.connect();

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: fastifyAdapter({}),
  eventBroadcaster: redisEventBroadcaster({
    redis: redisClient,
    subscriberRedis: redisSubscriber,
  }),
});
```

## Configuration

### `fastifyAdapter(options?)`

Creates a Fastify adapter instance.

**Options:**
- `authMiddleware?: (ctx: FastifyContext) => Promise<AuthResult>` - Optional authentication middleware

**Returns:** `ServerAdapter<FastifyContext, FastifyReply, FastifyWebSocketHandler>`

### FastifyContext

The context object passed to auth middleware:

```typescript
interface FastifyContext {
  request: FastifyRequest;
  reply: FastifyReply;
}
```

### Authentication Middleware

The `authMiddleware` function receives `FastifyContext` and should return:
- `AuthContext` object on success with `clientId` and optional `permissions`, `metadata`
- `null` on authentication failure (returns 401 to client)
- Throws error on system failure (returns 500 to client)

```typescript
type AuthResult = AuthContext | null;

interface AuthContext {
  clientId: string;
  permissions?: string[];
  metadata?: Record<string, unknown>;
}
```

The middleware has a 5-second timeout to prevent hanging requests.

## WebSocket Support

### Basic Setup

```typescript
import websocket from "@fastify/websocket";

const fastify = Fastify();

// Register WebSocket plugin first
await fastify.register(websocket);

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: fastifyAdapter({}),
});

// Mount WebSocket routes with { websocket: true } option
fastify.get(
  "/uploadista/ws/upload/:uploadId",
  { websocket: true },
  uploadistaServer.websocketHandler
);

fastify.get(
  "/uploadista/ws/flow/:jobId",
  { websocket: true },
  uploadistaServer.websocketHandler
);
```

### Path-Based Routing

The WebSocket handler automatically routes based on path:
- `/uploadista/ws/upload/:uploadId` - Upload progress events
- `/uploadista/ws/flow/:jobId` - Flow execution events

```typescript
// Client connects to:
const ws = new WebSocket("ws://localhost:3000/uploadista/ws/upload/abc123");
// or
const ws = new WebSocket("ws://localhost:3000/uploadista/ws/flow/job456");
```

### Authentication

WebSocket connections support both token and cookie-based authentication:

**Token-based:**
```typescript
// Client sends token in query param
const ws = new WebSocket(
  "ws://localhost:3000/uploadista/ws/upload/abc123?token=YOUR_JWT"
);
```

**Cookie-based:**
```typescript
// Cookies are automatically sent with WebSocket upgrade request
const ws = new WebSocket("ws://localhost:3000/uploadista/ws/upload/abc123");
```

## Binary Upload Handling

For chunked uploads (PATCH requests), configure Fastify to not parse the body:

```typescript
fastify.addContentTypeParser(
  "application/octet-stream",
  (_req, _payload, done) => {
    done(null); // Don't parse, allow raw stream access
  }
);
```

This allows the adapter to properly convert Node.js streams to Web ReadableStreams.

## Example Project

See the complete [Fastify server example](https://github.com/uploadista/uploadista-sdk/tree/main/examples/fastify-server) for:
- Full server setup
- Authentication middleware
- WebSocket integration
- Error handling
- Graceful shutdown
- Binary upload handling

## API Reference

### Core Server Integration

The Fastify adapter integrates with `@uploadista/server`:

```typescript
import { createUploadistaServer } from "@uploadista/server";
import { fastifyAdapter } from "@uploadista/adapters-fastify";

const server = await createUploadistaServer({
  adapter: fastifyAdapter(/* options */),
  // ... other config
});
```

See [`@uploadista/server` documentation](../server) for full configuration options.

## Migration from v1

If you're migrating from the legacy `createFastifyUploadistaAdapter` API:

**Before (v1):**
```typescript
const adapter = await createFastifyUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore,
  kvStore,
  flows,
  authMiddleware,
});

fastify.all(`/${adapter.baseUrl}/*`, adapter.handler);
```

**After (v2 - current):**
```typescript
const server = await createUploadistaServer({
  dataStore,
  kvStore,
  flows,
  adapter: fastifyAdapter({ authMiddleware }),
});

fastify.all("/uploadista/api/*", async (request, reply) => {
  return server.handler({ request, reply });
});
```

### Key Changes
- Configuration moved to `createUploadistaServer()`
- Adapter only handles Fastify-specific translation
- `baseUrl` now configured in `createUploadistaServer()` (defaults to "uploadista")
- Handler now expects `{ request, reply }` object
- WebSocket handler accessed via `server.websocketHandler`
- Binary upload stream handling fixed (no more "getReader is not a function" error)

## TypeScript Support

The adapter is fully typed with Fastify generics:

```typescript
import type { FastifyInstance } from "fastify";

const fastify: FastifyInstance = Fastify();

const adapter = fastifyAdapter({
  authMiddleware: async ({ request, reply }) => {
    // Full Fastify types available
    request.id; // typed
    request.log; // typed
    reply.code(200); // typed
    return { clientId: "user-123" };
  },
});
```

## Performance Tips

1. **Enable Logging**: Fastify's pino logger is very fast
```typescript
const fastify = Fastify({
  logger: true // or configure pino options
});
```

2. **Use Binary Parser**: Configure content type parser for uploads
```typescript
fastify.addContentTypeParser("application/octet-stream", ...);
```

3. **Connection Pooling**: Reuse Redis/database connections
```typescript
const redisClient = createClient({ /* ... */ });
await redisClient.connect(); // Connect once, reuse
```

4. **Caching**: Enable auth caching for repeat requests
```typescript
authCacheConfig: { maxSize: 5000, ttl: 3600000 }
```

## License

MIT
