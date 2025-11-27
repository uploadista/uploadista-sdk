# @uploadista/server

Core server utilities and authentication for Uploadista file upload and flow processing.

This package provides framework-agnostic server components including authentication context management, caching utilities, and layer composition helpers. Use this with adapter packages (`@uploadista/adapters-hono`, `@uploadista/adapters-express`, `@uploadista/adapters-fastify`) to set up complete upload servers.

## Features

- **Authentication Context** - User identity and metadata management
- **Auth Caching** - LRU cache for auth contexts with TTL support
- **Health Checks** - Kubernetes-compatible liveness/readiness probes
- **Effect Layers** - Dependency injection for upload and flow servers
- **Error Handling** - Standardized error responses with HTTP status codes
- **HTTP Utilities** - Route parsing and error mapping helpers
- **TypeScript** - Full type safety with comprehensive JSDoc

## Installation

```bash
npm install @uploadista/server @uploadista/core
# or
pnpm add @uploadista/server @uploadista/core
```

## Requirements

- Node.js 18+
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Set Up Authentication

```typescript
import { AuthContextServiceLive } from "@uploadista/server";
import { Effect } from "effect";

// Create auth context for a request
const authContext = {
  clientId: "user-123",
  metadata: {
    permissions: ["upload:create", "flow:execute"],
    quota: { storage: 1000000000 }, // 1GB
  },
};

// Provide auth context to your effects
const effect = Effect.service(AuthContextService).pipe(
  Effect.andThen((authService) => authService.getClientId()),
);

const result = await Effect.runPromise(
  effect.pipe(Effect.provide(AuthContextServiceLive(authContext))),
);
console.log(result); // "user-123"
```

### 2. Get JWT Credentials

```typescript
import { getAuthCredentials } from "@uploadista/server";

// Exchange credentials for JWT token
const response = await getAuthCredentials({
  uploadistaClientId: process.env.UPLOADISTA_CLIENT_ID,
  uploadistaApiKey: process.env.UPLOADISTA_API_KEY,
});

if (response.isValid) {
  console.log(`Token: ${response.data.token}`);
  console.log(`Expires in: ${response.data.expiresIn}s`);
} else {
  console.error(`Auth failed: ${response.error}`);
}
```

### 3. Create Upload Server Layer

```typescript
import { createUploadServerLayer } from "@uploadista/server";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";
import { memoryEventBroadcaster } from "@uploadista/event-broadcaster-memory";

const uploadServerLayer = createUploadServerLayer({
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  dataStore: s3DataStore,
});

// Use in your framework adapter...
```

### 4. Create Flow Server Layer

```typescript
import { createFlowServerLayer } from "@uploadista/server";

const flowServerLayer = createFlowServerLayer({
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  flowProvider: createFlowsEffect,
  uploadServer: uploadServerLayer,
});

// Use in your framework adapter...
```

## API Reference

### Authentication

#### `AuthContext`

User identity and authorization metadata.

```typescript
type AuthContext = {
  clientId: string;
  metadata?: Record<string, unknown>;
  permissions?: string[];
};
```

**Properties**:
- `clientId` - Unique user identifier
- `metadata` - Custom authorization metadata (permissions, quotas, etc.)
- `permissions` - Array of permission strings for authorization

#### `AuthContextService`

Effect service for accessing auth context throughout request processing.

```typescript
export class AuthContextService extends Context.Tag("AuthContextService")<
  AuthContextService,
  {
    readonly getClientId: () => Effect.Effect<string | null>;
    readonly getMetadata: () => Effect.Effect<Record<string, unknown>>;
    readonly hasPermission: (permission: string) => Effect.Effect<boolean>;
    readonly getAuthContext: () => Effect.Effect<AuthContext | null>;
  }
>() {}
```

**Methods**:
- `getClientId()` - Get current client ID
- `getMetadata()` - Get auth metadata object
- `hasPermission(permission)` - Check if user has permission
- `getAuthContext()` - Get full auth context

#### `AuthContextServiceLive(authContext)`

Factory for creating AuthContextService layer.

```typescript
import { AuthContextServiceLive } from "@uploadista/server";

const authLayer = AuthContextServiceLive({
  clientId: "user-123",
  permissions: ["upload:create"],
});
```

#### `getAuthCredentials(params)`

Exchange client credentials for JWT token.

```typescript
import { getAuthCredentials } from "@uploadista/server";

const response = await getAuthCredentials({
  uploadistaClientId: "my-client",
  uploadistaApiKey: "sk_...",
  baseUrl: "https://api.uploadista.com", // optional
});

if (response.isValid) {
  // response.data.token - JWT token
  // response.data.expiresIn - Seconds until expiration
} else {
  // response.error - Error message
}
```

### Caching

#### `AuthCacheConfig`

Configuration for auth context caching.

```typescript
type AuthCacheConfig = {
  maxSize?: number;     // Default: 10000
  ttl?: number;        // Default: 3600000 (1 hour)
};
```

#### `AuthCacheService`

Effect service for storing and retrieving cached auth contexts.

```typescript
export class AuthCacheService extends Context.Tag("AuthCacheService")<
  AuthCacheService,
  {
    readonly set: (
      jobId: string,
      authContext: AuthContext,
    ) => Effect.Effect<void>;
    readonly get: (jobId: string) => Effect.Effect<AuthContext | null>;
    readonly delete: (jobId: string) => Effect.Effect<void>;
    readonly clear: () => Effect.Effect<void>;
    readonly size: () => Effect.Effect<number>;
  }
>() {}
```

**Methods**:
- `set(jobId, authContext)` - Cache auth for a job
- `get(jobId)` - Retrieve cached auth
- `delete(jobId)` - Remove specific cache entry
- `clear()` - Clear all cached entries
- `size()` - Get number of cached entries

#### `AuthCacheServiceLive(config?)`

Create in-memory auth cache layer.

```typescript
import { AuthCacheServiceLive } from "@uploadista/server";

const cacheLayer = AuthCacheServiceLive({
  maxSize: 5000,
  ttl: 1800000, // 30 minutes
});
```

### Layer Composition

#### `UploadServerLayerConfig`

Configuration for creating upload server layer.

```typescript
interface UploadServerLayerConfig {
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  dataStore: Layer.Layer<UploadFileDataStores, never, UploadFileKVStore>;
  bufferedDataStore?: Layer.Layer<UploadFileDataStore>;
  generateId?: Layer.Layer<GenerateId>;
}
```

#### `createUploadServerLayer(config)`

Compose upload server with all dependencies.

```typescript
import { createUploadServerLayer } from "@uploadista/server";

const uploadLayer = createUploadServerLayer({
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  dataStore: s3DataStore,
});
```

#### `FlowServerLayerConfig`

Configuration for creating flow server layer.

```typescript
interface FlowServerLayerConfig {
  kvStore: Layer.Layer<BaseKvStoreService>;
  eventEmitter: Layer.Layer<BaseEventEmitterService>;
  flowProvider: Layer.Layer<FlowProvider>;
  uploadServer: Layer.Layer<UploadServer>;
}
```

#### `createFlowServerLayer(config)`

Compose flow server with all dependencies.

```typescript
import { createFlowServerLayer } from "@uploadista/server";

const flowLayer = createFlowServerLayer({
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  flowProvider: createFlowsEffect,
  uploadServer: uploadLayer,
});
```

### Error Handling

#### `AdapterError`

Base error class for adapter errors.

```typescript
class AdapterError extends Error {
  constructor(
    message: string,
    statusCode?: number,
    errorCode?: string,
  ) {}
}
```

**Properties**:
- `statusCode` - HTTP status code (default: 500)
- `errorCode` - Machine-readable error code

#### `ValidationError`, `NotFoundError`, `BadRequestError`

Pre-configured error classes:

```typescript
import {
  ValidationError,
  NotFoundError,
  BadRequestError,
} from "@uploadista/server";

// Validation error (400)
throw new ValidationError("Invalid upload ID format");

// Not found (404)
throw new NotFoundError("Upload");

// Bad request (400)
throw new BadRequestError("Invalid JSON body");
```

#### Error Response Factories

```typescript
import {
  createErrorResponseBody,
  createUploadistaErrorResponseBody,
  createGenericErrorResponseBody,
} from "@uploadista/server";

// For adapter errors
const errorResponse = createErrorResponseBody(
  new ValidationError("Invalid data"),
);
// => { error: "Invalid data", code: "VALIDATION_ERROR", timestamp: "..." }

// For core library errors
const uploadistaErrorResponse = createUploadistaErrorResponseBody(error);

// For unknown errors
const genericErrorResponse = createGenericErrorResponseBody("Something went wrong");
```

### HTTP Utilities

```typescript
import {
  parseUrlSegments,
  getLastSegment,
  hasBasePath,
  getRouteSegments,
  handleFlowError,
  extractJobIdFromStatus,
  extractJobAndNodeId,
  extractFlowAndStorageId,
} from "@uploadista/server";

// Parse route
const segments = parseUrlSegments("/uploadista/api/upload/abc");
// => ["uploadista", "api", "upload", "abc"]

// Check if request is for uploadista
const isUploadistaRequest = hasBasePath("/uploadista/api/upload", "uploadista");
// => true

// Extract parameters from URL
const jobId = extractJobIdFromStatus(["jobs", "job-123", "status"]);
// => "job-123"

// Handle errors consistently
const errorInfo = handleFlowError({
  code: "FILE_NOT_FOUND",
  message: "File not found",
});
// => { status: 404, code: "FILE_NOT_FOUND", message: "File not found" }
```

## Health Check Endpoints

The server provides Kubernetes-compatible health check endpoints for production deployments.

### Available Endpoints

| Endpoint | Purpose | Checks |
|----------|---------|--------|
| `/{baseUrl}/health` | Liveness probe | None (always returns healthy) |
| `/{baseUrl}/ready` | Readiness probe | Storage, KV store, event broadcaster |
| `/{baseUrl}/health/components` | Detailed status | All components + circuit breakers + DLQ |

Alternative paths `/healthz` and `/readyz` are also supported for Kubernetes compatibility.

### Response Format

Health endpoints support content negotiation via the `Accept` header:
- `Accept: application/json` - JSON response with full details
- `Accept: text/plain` - Simple text response (`OK`, `DEGRADED`, `UNHEALTHY`)

```json
{
  "status": "healthy",
  "timestamp": "2024-11-27T10:30:00.000Z",
  "version": "1.0.0",
  "uptime": 3600000,
  "components": {
    "storage": {
      "status": "healthy",
      "latency": 15,
      "lastCheck": "2024-11-27T10:30:00.000Z"
    },
    "kvStore": {
      "status": "healthy",
      "latency": 5,
      "lastCheck": "2024-11-27T10:30:00.000Z"
    }
  }
}
```

### Configuration

Configure health checks in your server setup:

```typescript
import { createUploadistaServer } from "@uploadista/server";

const server = createUploadistaServer({
  // ... other config
  healthCheck: {
    version: "1.0.0",           // Application version
    checkStorage: true,          // Enable storage health checks
    checkKvStore: true,          // Enable KV store health checks
    checkEventBroadcaster: false, // Disable event broadcaster checks
    timeout: 5000,               // Health check timeout in ms
  },
});
```

### Kubernetes Integration

Example Kubernetes deployment configuration:

```yaml
livenessProbe:
  httpGet:
    path: /uploadista/health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /uploadista/ready
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5
```

For complete documentation, see [docs/HEALTH_CHECKS.md](./docs/HEALTH_CHECKS.md).

## Framework Integration

This package is used by framework adapters:

- **[@uploadista/adapters-hono](../adapters-hono/)** - For Cloudflare Workers
- **[@uploadista/adapters-express](../adapters-express/)** - For Node.js Express
- **[@uploadista/adapters-fastify](../adapters-fastify/)** - For Node.js Fastify

## Complete Server Example

```typescript
import { Effect, Layer } from "effect";
import {
  createUploadServerLayer,
  createFlowServerLayer,
  AuthContextServiceLive,
} from "@uploadista/server";
import { redisKvStore } from "@uploadista/kv-store-redis";
import { s3DataStore } from "@uploadista/data-store-s3";
import { webSocketEventEmitter } from "@uploadista/event-emitter-websocket";

// Configure servers
const uploadLayer = createUploadServerLayer({
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  dataStore: s3DataStore,
});

const flowLayer = createFlowServerLayer({
  kvStore: redisKvStore,
  eventEmitter: webSocketEventEmitter,
  flowProvider: createFlowsEffect,
  uploadServer: uploadLayer,
});

// Set up authentication for a request
const authContext = {
  clientId: "user-123",
  permissions: ["upload:create", "flow:execute"],
};

// Compose all layers
const appLayer = Layer.provide(flowLayer, uploadLayer).pipe(
  Layer.provide(AuthContextServiceLive(authContext)),
);

// Run effects
const myEffect = Effect.gen(function* () {
  const uploadServer = yield* UploadServer;
  const flowServer = yield* FlowServer;
  // ... use uploadServer and flowServer
});

Effect.runPromise(myEffect.pipe(Effect.provide(appLayer)));
```

## TypeScript Support

Full TypeScript support with comprehensive types:

```typescript
import type {
  AuthContext,
  AuthResult,
  AuthCacheConfig,
  UploadServerLayerConfig,
  FlowServerLayerConfig,
} from "@uploadista/server";
import type { UploadServer, FlowServer } from "@uploadista/core";
```

## Architecture Notes

### Authentication Flow

1. Client authenticates with credentials (ID + API key)
2. Server validates and issues JWT token
3. Token includes user identity and permissions
4. Subsequent requests include token in Authorization header
5. Auth context created from token claims
6. Auth context passed through Effect layers to handlers
7. Handlers check permissions before processing

### Effect Layer Pattern

- Use `Layer.provide()` to compose dependencies
- Each layer provides one service (UploadServer, FlowServer, etc.)
- Auth context automatically available via AuthContextService
- Cache automatically handles auth context persistence across requests

### Error Handling Strategy

1. Catch domain errors in handlers
2. Map to AdapterError with appropriate HTTP status
3. Format using createErrorResponseBody
4. Return JSON error response with timestamp
5. Log errors for monitoring

## Related Packages

- **[@uploadista/core](../../core/)** - Core upload and flow engine
- **[@uploadista/adapters-hono](../adapters-hono/)** - Hono adapter
- **[@uploadista/adapters-express](../adapters-express/)** - Express adapter
- **[@uploadista/adapters-fastify](../adapters-fastify/)** - Fastify adapter
- **[@uploadista/kv-store-redis](../../kv-stores/redis/)** - Redis KV store
- **[@uploadista/data-store-s3](../../data-stores/s3/)** - AWS S3 storage

## License

MIT
