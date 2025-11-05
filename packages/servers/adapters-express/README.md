# @uploadista/adapters-express

Uploadista adapter for Express - The most popular Node.js web framework.

Provides a lightweight adapter for integrating Uploadista's file upload and flow processing capabilities with Express applications. Built on the unified adapter pattern for consistent behavior across all frameworks.

## Features

- **Express 4 & 5** - Compatible with both major versions
- **WebSocket Support** - Real-time progress via `ws` package
- **Authentication** - Flexible middleware for JWT, sessions, or custom auth
- **Multi-Cloud Storage** - S3, Azure, GCS, or filesystem backends
- **Event Broadcasting** - Real-time updates via memory or Redis
- **TypeScript** - Full type safety with comprehensive JSDoc
- **Lightweight** - Minimal adapter code delegates to core server

## Installation

```bash
npm install @uploadista/adapters-express @uploadista/server express ws
# or
pnpm add @uploadista/adapters-express @uploadista/server express ws
```

## Requirements

- Express 4.x or 5.x
- Node.js 18+
- `ws` package for WebSocket support
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### Basic Server

```typescript
import { createServer } from "node:http";
import { expressAdapter } from "@uploadista/adapters-express";
import { fileStore } from "@uploadista/data-store-filesystem";
import { fileKvStore } from "@uploadista/kv-store-filesystem";
import { createUploadistaServer } from "@uploadista/server";
import express from "express";
import { WebSocketServer } from "ws";
import { flows } from "./flows";

const app = express();
const server = createServer(app);

// Middleware
app.use(express.json());

// Create KV store and data store
const kvStore = fileKvStore({ directory: "./uploads" });
const dataStore = fileStore({
  directory: "./uploads",
  deliveryUrl: "http://localhost:3000/uploads",
});

// Create uploadista server with Express adapter
const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: expressAdapter({}), // <-- New adapter pattern
});

// Mount HTTP endpoints (Express 5)
app.all("/uploadista/api/*splat", (request, response, next) => {
  uploadistaServer.handler({ request, response, next });
});

// For Express 4, use:
// app.all("/uploadista/api/*", (request, response, next) => {
//   uploadistaServer.handler({ request, response, next });
// });

// WebSocket server setup
const wss = new WebSocketServer({ server });
wss.on("connection", uploadistaServer.websocketHandler);

// Start server
server.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

### With Authentication

```typescript
import { expressAdapter } from "@uploadista/adapters-express";
import { createUploadistaServer } from "@uploadista/server";

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: expressAdapter({
    // Optional auth middleware
    authMiddleware: async ({ request, response }) => {
      const token = request.headers.authorization?.split(" ")[1];
      if (!token) return null;

      try {
        // Verify JWT or session
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

### With Session-Based Auth

```typescript
import session from "express-session";

// Configure session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
  })
);

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: expressAdapter({
    authMiddleware: async ({ request }) => {
      // Access session from Express request
      if (!request.session?.userId) {
        return null;
      }

      return {
        clientId: request.session.userId,
        metadata: { sessionId: request.sessionID },
      };
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
  adapter: expressAdapter({}),
  eventBroadcaster: redisEventBroadcaster({
    redis: redisClient,
    subscriberRedis: redisSubscriber,
  }),
});
```

## Configuration

### `expressAdapter(options?)`

Creates an Express adapter instance.

**Options:**
- `authMiddleware?: (ctx: ExpressContext) => Promise<AuthResult>` - Optional authentication middleware

**Returns:** `ServerAdapter<ExpressContext, Response, ExpressWebSocketHandler>`

### ExpressContext

The context object passed to auth middleware:

```typescript
interface ExpressContext {
  request: Request;
  response: Response;
  next?: (error?: Error) => void;
}
```

### Authentication Middleware

The `authMiddleware` function receives `ExpressContext` and should return:
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
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const app = express();
const server = createServer(app);

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: expressAdapter({}),
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Connect uploadista handler
wss.on("connection", uploadistaServer.websocketHandler);

server.listen(3000);
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
// Your auth middleware can read them from request.headers.cookie
const ws = new WebSocket("ws://localhost:3000/uploadista/ws/upload/abc123");
```

## Express Version Compatibility

### Express 4

Use wildcard routes without named parameters:

```typescript
app.all("/uploadista/api/*", (request, response, next) => {
  uploadistaServer.handler({ request, response, next });
});
```

### Express 5

Use named wildcards (`*splat`):

```typescript
app.all("/uploadista/api/*splat", (request, response, next) => {
  uploadistaServer.handler({ request, response, next });
});
```

## Example Project

See the complete [Express server example](https://github.com/uploadista/uploadista-sdk/tree/main/examples/express-server) for:
- Full server setup
- Authentication middleware
- WebSocket integration
- Error handling
- Graceful shutdown

## API Reference

### Core Server Integration

The Express adapter integrates with `@uploadista/server`:

```typescript
import { createUploadistaServer } from "@uploadista/server";
import { expressAdapter } from "@uploadista/adapters-express";

const server = await createUploadistaServer({
  adapter: expressAdapter(/* options */),
  // ... other config
});
```

See [`@uploadista/server` documentation](../server) for full configuration options.

## Migration from v1

If you're migrating from the legacy `createExpressUploadistaAdapter` API:

**Before (v1):**
```typescript
const adapter = await createExpressUploadistaAdapter({
  baseUrl: "uploadista",
  dataStore,
  kvStore,
  flows,
  authMiddleware,
});

app.all(`/${adapter.baseUrl}/*`, adapter.handler);
```

**After (v2 - current):**
```typescript
const server = await createUploadistaServer({
  dataStore,
  kvStore,
  flows,
  adapter: expressAdapter({ authMiddleware }),
});

app.all("/uploadista/api/*splat", (request, response, next) => {
  server.handler({ request, response, next });
});
```

### Key Changes
- Configuration moved to `createUploadistaServer()`
- Adapter only handles Express-specific translation
- `baseUrl` now configured in `createUploadistaServer()` (defaults to "uploadista")
- Handler now expects `{ request, response, next }` object
- WebSocket handler accessed via `server.websocketHandler`

## TypeScript Support

The adapter is fully typed:

```typescript
import type { Request, Response, NextFunction } from "express";

const adapter = expressAdapter({
  authMiddleware: async ({ request, response, next }) => {
    // Full Express types available
    request.session; // typed
    response.locals; // typed
    return { clientId: "user-123" };
  },
});
```

## License

MIT
