# @uploadista/adapters-hono

Uploadista adapter for Hono - Deploy upload servers to Cloudflare Workers, Node.js, Deno, or Bun.

Provides lightweight adapters for integrating Uploadista's file upload and flow processing capabilities with Hono applications. Includes specialized support for both standard deployments and Cloudflare Durable Objects.

## Features

- **Universal Deployment** - Works on Cloudflare Workers, Node.js, Deno, Bun
- **Two Deployment Modes**:
  - **Standard Adapter** (`honoAdapter`) - Classic WebSocket with event broadcaster
  - **Durable Objects Adapter** (`honoDurableObjectAdapter`) - Cloudflare DO-specific with hibernatable WebSockets
- **Built-in WebSocket** - Real-time progress updates for uploads and flows
- **Authentication** - Flexible middleware for JWT, OAuth, or custom auth
- **Multi-Cloud Storage** - S3, R2, Azure, GCS, or filesystem backends
- **Event Broadcasting** - Real-time updates via memory, Redis, or Durable Objects
- **TypeScript** - Full type safety with comprehensive JSDoc
- **Lightweight** - Minimal adapter code delegates to core server

## Installation

```bash
npm install @uploadista/adapters-hono @uploadista/server hono
# or
pnpm add @uploadista/adapters-hono @uploadista/server hono
```

## Requirements

- Hono 4.0+
- Node.js 18+, Deno 1.x, Bun 1.x, or Cloudflare Workers
- TypeScript 5.0+ (optional but recommended)

## Choosing an Adapter

### When to use `honoAdapter` (Standard)

Use the standard adapter for:
- **Node.js, Deno, Bun deployments**
- **Standard Cloudflare Workers** (without Durable Objects)
- **Multiple instances** requiring state synchronization via Redis/broadcaster
- **Traditional load-balanced architectures**

### When to use `honoDurableObjectAdapter` (Durable Objects)

Use the Durable Objects adapter for:
- **Cloudflare Workers with Durable Objects**
- **Single-instance state** per upload/flow
- **Hibernatable WebSockets** for cost efficiency
- **No external broadcaster needed** (DO is the single source of truth)

## Quick Start

### Standard Adapter - Node.js Server

```typescript
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { honoAdapter } from "@uploadista/adapters-hono";
import { s3Store } from "@uploadista/data-store-s3";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { createUploadistaServer } from "@uploadista/server";
import { Hono } from "hono";
import { flows } from "./flows";

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Create KV store and data store
const kvStore = redisKvStore({ redis: redisClient });
const dataStore = s3Store({
  s3ClientConfig: {
    bucket: "my-bucket",
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  },
  deliveryUrl: "https://my-bucket.s3.amazonaws.com",
});

// Create uploadista server with Hono adapter
const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: honoAdapter(), // <-- New adapter pattern
});

// Mount HTTP endpoints
app.on(
  ["HEAD", "POST", "GET", "PATCH"],
  ["/uploadista/api/**", "/uploadista/api"],
  (c) => uploadistaServer.handler(c)
);

// Mount WebSocket endpoints
app.on(
  ["GET"],
  ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
  upgradeWebSocket(uploadistaServer.websocketHandler)
);

const server = serve({ port: 3000, fetch: app.fetch });
injectWebSocket(server);
```

### With Authentication

```typescript
import { honoAdapter } from "@uploadista/adapters-hono";
import { createUploadistaServer } from "@uploadista/server";

const uploadistaServer = await createUploadistaServer({
  dataStore,
  flows,
  kvStore,
  adapter: honoAdapter({
    // Optional auth middleware
    authMiddleware: async (c) => {
      const token = c.req.header("Authorization")?.split(" ")[1];
      if (!token) return null;

      try {
        // Verify JWT or other auth scheme
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

### Durable Objects Adapter - Cloudflare Workers

```typescript
import { honoDurableObjectAdapter } from "@uploadista/adapters-hono";
import { routeWebSocketToDurableObject } from "@uploadista/adapters-hono";
import { durableObjectEventEmitter } from "@uploadista/event-emitter-durable-object";
import { createUploadistaServer } from "@uploadista/server";
import { Hono } from "hono";

export interface Env {
  UPLOAD_DO: DurableObjectNamespace;
  MY_R2: R2Bucket;
}

const app = new Hono<{ Bindings: Env }>();

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // Create server with Durable Objects adapter
    const uploadistaServer = await createUploadistaServer({
      dataStore: { type: "r2", config: { bucket: env.MY_R2 } },
      flows,
      kvStore: durableObjectKvStore,
      eventEmitter: durableObjectEventEmitter(env.UPLOAD_DO),
      // Use the Durable Objects adapter (no broadcaster needed)
      adapter: honoDurableObjectAdapter(),
    });

    // HTTP routes use the standard handler
    app.all("/uploadista/api/**", (c) => uploadistaServer.handler(c));

    // WebSocket routes go directly to Durable Objects
    app.get("/uploadista/ws/upload/:uploadId", async (c) => {
      return routeWebSocketToDurableObject(c, env.UPLOAD_DO, {
        idParam: "uploadId",
      });
    });

    return app.fetch(request, env, ctx);
  },
};

// Your Durable Object class
export class UploadDurableObject extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");

    if (upgradeHeader === "websocket") {
      // Create WebSocket pair
      const { 0: client, 1: server } = new WebSocketPair();

      // Accept with hibernation API
      this.ctx.acceptWebSocket(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Not found", { status: 404 });
  }

  // Hibernation API handlers
  async webSocketMessage(ws: WebSocket, message: string) {
    // Handle messages automatically when they arrive
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    // Handle connection close
  }
}
```

## Configuration

### `honoAdapter(options?)` - Standard Adapter

Creates a standard Hono adapter for Node.js, Deno, Bun, or Cloudflare Workers.

**Options:**
- `authMiddleware?: (c: Context) => Promise<AuthResult>` - Optional authentication middleware

**Returns:** `ServerAdapter<Context, Response, HonoWebSocketHandler>`

### `honoDurableObjectAdapter(options?)` - Durable Objects Adapter

Creates a Durable Objects-specific adapter for Cloudflare Workers.

**Options:**
- `authMiddleware?: (c: Context) => Promise<AuthResult>` - Optional authentication middleware (for HTTP requests only)

**Returns:** `ServerAdapter<Context, Response, never>`

**Important:** This adapter does NOT provide a `webSocketHandler`. WebSocket connections must be routed directly to Durable Object instances using the helper functions provided.

### Authentication Middleware

The `authMiddleware` function receives the Hono `Context` and should return:
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

### Durable Objects Helper Functions

When using `honoDurableObjectAdapter`, use these helper functions to route WebSocket connections:

#### `routeWebSocketToDurableObject(c, namespace, options?)`

Routes a WebSocket upgrade request to a Durable Object instance.

**Parameters:**
- `c: Context` - Hono context
- `namespace: DurableObjectNamespace` - The DO namespace binding
- `options?: object`
  - `idParam?: string` - Route parameter name (default: "uploadId")
  - `validateId?: (id: string) => boolean | Promise<boolean>` - Optional ID validator
  - `onValidationError?: (id: string) => Response` - Custom error handler

**Example:**
```typescript
app.get("/uploadista/ws/upload/:uploadId", async (c) => {
  return routeWebSocketToDurableObject(c, c.env.UPLOAD_DO, {
    idParam: "uploadId",
    validateId: async (id) => {
      // Check if upload exists
      return await db.uploads.exists(id);
    },
  });
});
```

#### `createDurableObjectWebSocketHandler(getNamespace, options?)`

Creates a reusable route handler for DO WebSocket routing.

**Parameters:**
- `getNamespace: (c: Context) => DurableObjectNamespace` - Function to get DO namespace from context
- `options?: object` - Same as `routeWebSocketToDurableObject`

**Example:**
```typescript
const uploadWsHandler = createDurableObjectWebSocketHandler(
  (c) => c.env.UPLOAD_DO,
  { idParam: "uploadId" }
);

app.get("/uploadista/ws/upload/:uploadId", uploadWsHandler);
```

## WebSocket Support

### Standard Adapter - Node.js

Uses `@hono/node-ws` package:

```typescript
import { createNodeWebSocket } from "@hono/node-ws";

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Mount WebSocket routes
app.on(
  ["GET"],
  ["/uploadista/ws/upload/:uploadId", "/uploadista/ws/flow/:jobId"],
  upgradeWebSocket(uploadistaServer.websocketHandler)
);

// Inject into HTTP server
const server = serve({ port: 3000, fetch: app.fetch });
injectWebSocket(server);
```

### Standard Adapter - Cloudflare Workers

Native WebSocket support with event broadcaster:

```typescript
import { Hono } from "hono";
import { honoAdapter } from "@uploadista/adapters-hono";
import { redisEventBroadcaster } from "@uploadista/event-broadcaster-redis";

const app = new Hono();

// Requires event broadcaster to sync across workers
const server = await createUploadistaServer({
  adapter: honoAdapter(),
  eventBroadcaster: redisEventBroadcaster(), // Sync state
  // ... other config
});

app.get("/uploadista/ws/**", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected websocket", 400);
  }
  return uploadistaServer.websocketHandler(c);
});
```

### Durable Objects Adapter - Cloudflare Workers

WebSocket connections route directly to Durable Objects (no broadcaster needed):

```typescript
import { honoDurableObjectAdapter, routeWebSocketToDurableObject } from "@uploadista/adapters-hono";

const server = await createUploadistaServer({
  adapter: honoDurableObjectAdapter(),
  eventEmitter: durableObjectEventEmitter(env.UPLOAD_DO),
  // NO eventBroadcaster needed - DO is single source of truth
});

// Route WebSocket connections to DO instances
app.get("/uploadista/ws/upload/:uploadId", async (c) => {
  return routeWebSocketToDurableObject(c, c.env.UPLOAD_DO, {
    idParam: "uploadId",
  });
});
```

## Deployment Comparison

| Feature | Standard Adapter (`honoAdapter`) | Durable Objects Adapter (`honoDurableObjectAdapter`) |
|---------|----------------------------------|------------------------------------------------------|
| **Runtime** | Node.js, Deno, Bun, CF Workers | Cloudflare Workers only |
| **WebSocket Pattern** | Classic with broadcaster | Hibernatable (DO native) |
| **State Management** | External broadcaster required | Built into DO instance |
| **Scaling** | Horizontal with sync overhead | Per-entity DO instances |
| **Cost** | Broadcaster infrastructure | DO request + duration fees |
| **Use Case** | Multi-region, load-balanced | Single-region, per-entity |

## Example Projects

- [Node.js Server](https://github.com/uploadista/uploadista-sdk/tree/main/examples/hono-server) - Complete server with Redis and S3
- [Cloudflare Workers with Standard Adapter](https://github.com/uploadista/uploadista-sdk/tree/main/examples/hono-cf-standard) - Edge deployment with Redis broadcaster
- [Cloudflare Workers with Durable Objects](https://github.com/uploadista/uploadista-sdk/tree/main/examples/hono-cf-durable-objects) - DO-based deployment with hibernatable WebSockets

## API Reference

### Core Server Integration

The Hono adapter integrates with `@uploadista/server`:

```typescript
import { createUploadistaServer } from "@uploadista/server";
import { honoAdapter } from "@uploadista/adapters-hono";

const server = await createUploadistaServer({
  adapter: honoAdapter(/* options */),
  // ... other config
});
```

See [`@uploadista/server` documentation](../server) for full configuration options.

## Migration from v1

If you're migrating from the legacy `createHonoUploadistaAdapter` API:

**Before (v1):**
```typescript
const adapter = await createHonoUploadistaAdapter({
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
  adapter: honoAdapter({ authMiddleware }),
});

app.on(["HEAD", "POST", "GET", "PATCH"], "/uploadista/api/**", (c) =>
  server.handler(c)
);
```

### Key Changes
- Configuration moved to `createUploadistaServer()`
- Adapter only handles Hono-specific translation
- `baseUrl` now configured in `createUploadistaServer()` (defaults to "uploadista")
- WebSocket handler accessed via `server.websocketHandler`

## TypeScript Support

The adapter is fully typed with generics for Hono environments:

```typescript
import type { Env } from "hono";

interface MyEnv extends Env {
  Bindings: {
    MY_KV: KVNamespace;
    MY_R2: R2Bucket;
  };
}

const app = new Hono<MyEnv>();
const adapter = honoAdapter<MyEnv>({ /* ... */ });
```

## License

MIT
