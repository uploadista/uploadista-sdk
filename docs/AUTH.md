# Authentication System

This document describes the authentication system for the Uploadista engine.

## Overview

The Uploadista engine supports optional authentication through a dual-mode system:

1. **Direct Auth Mode**: Bring your own authentication (BYO)
2. **UploadistaCloud Auth Mode**: Standard JWT token exchange with auth server with Uploadista Cloud and API Key

## Server-Side Authentication (Hono Adapter)

### Basic Setup

The Hono adapter accepts an optional `authMiddleware` parameter that validates requests:

```typescript
import { createHonoUploadistaAdapter } from '@uploadista/adapters-hono';
import type { AuthContext } from '@uploadista/server';

const adapter = await createHonoUploadistaAdapter<HonoAuthContext>({
  // ... other options

  authMiddleware: async (c) => {
    // Extract and validate credentials from the request
    const authHeader = c.req.header('Authorization');

    if (!authHeader) {
      return null; // No auth - will return 401
    }

    // Validate the auth header (example: Bearer token)
    const token = authHeader.replace('Bearer ', '');
    const user = await validateToken(token);

    if (!user) {
      return null; // Invalid auth - will return 401
    }

    // Return auth context
    return {
      clientId: user.id,
      metadata: {
        email: user.email,
      },
    };
  }
});
```

### Auth Middleware Contract

The auth middleware must follow this signature:

```typescript
type AuthMiddleware = (c: Context) => Promise<AuthContext | null>;

type AuthContext = {
  userId: string;                        // Required: unique user identifier
  metadata?: Record<string, unknown>;    // Optional: custom data (quotas, etc.)
};
```

**Return values**:
- `AuthContext` object: Authentication successful, request will be processed
- `null`: Authentication failed, returns 401 Unauthorized
- Throws error: Returns 500 Internal Server Error

### Common Authentication Patterns

#### Bearer Token Authentication

```typescript
authMiddleware: async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const user = await verifyJWT(token);
  return user ? { userId: user.sub } : null;
}
```

#### API Key Authentication

```typescript
authMiddleware: async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return null;

  const user = await db.users.findByApiKey(apiKey);
  return user ? { userId: user.id } : null;
}
```

#### Session Cookie Authentication

```typescript
authMiddleware: async (c) => {
  const sessionId = c.req.cookie('session');
  if (!sessionId) return null;

  const session = await getSession(sessionId);
  return session ? { userId: session.userId } : null;
}
```

## Client-Side Authentication

The uploadista client supports two authentication modes:

1. **Direct Mode**: Bring your own authentication (any protocol)
2. **UploadistaCloud Mode**: JWT token exchange with Uploadista Cloud

### Direct Auth Mode

Direct mode gives you complete control over authentication. You provide a function that returns credentials to attach to every request.

#### Basic Setup

```typescript
import { createUploadistaClient } from '@uploadista/client';

const client = createUploadistaClient({
  baseUrl: 'https://api.example.com',
  storageId: 'my-storage',
  chunkSize: 1024 * 1024,

  // Optional authentication
  auth: {
    mode: 'direct',
    getCredentials: async () => ({
      headers: {
        'Authorization': `Bearer ${await getAccessToken()}`
      }
    })
  }
});

// Use client normally - credentials are attached automatically
await client.upload(file);
```

#### Auth Config Types

```typescript
// Direct mode: Bring your own auth
type DirectAuthConfig = {
  mode: 'direct';
  getCredentials: () => RequestCredentials | Promise<RequestCredentials>;
};

type RequestCredentials = {
  headers?: Record<string, string>;  // HTTP headers
  cookies?: Record<string, string>;  // Cookies (browser only)
};
```

#### Direct Mode Examples

##### With OAuth Token

```typescript
auth: {
  mode: 'direct',
  getCredentials: async () => {
    const token = await oauth.getAccessToken();
    return {
      headers: { 'Authorization': `Bearer ${token}` }
    };
  }
}
```

##### With API Key

```typescript
auth: {
  mode: 'direct',
  getCredentials: () => ({
    headers: { 'X-API-Key': process.env.API_KEY }
  })
}
```

##### With Session Cookie

```typescript
auth: {
  mode: 'direct',
  getCredentials: () => ({
    cookies: { 'session': getSessionId() }
  })
}
```

### UploadistaCloud Auth Mode

UploadistaCloud mode provides a secure JWT token exchange system. Your backend exchanges credentials with Uploadista Cloud, and the client automatically manages token lifecycle.

#### How It Works

1. Client sends request to your auth server with client ID
2. Your auth server validates the request and calls Uploadista Cloud with API key
3. Uploadista Cloud returns a signed JWT token with expiration
4. Your auth server returns the token to the client
5. Client automatically attaches token to all upload requests
6. Client caches tokens and refreshes before expiration

#### Security Benefits

- API keys never exposed to the client
- Tokens are time-limited and automatically refreshed
- Per-job token caching for optimal performance
- Automatic retry with fresh token on 401 errors

#### Client Setup

```typescript
import { createUploadistaClient } from '@uploadista/client';

const client = createUploadistaClient({
  storageId: 'my-storage',
  chunkSize: 1024 * 1024,

  auth: {
    mode: 'uploadista-cloud',
    authServerUrl: '/api/auth/token',  // Your auth endpoint
    clientId: 'your-client-id'
  }
});

// Use client normally - token management is automatic
await client.upload(file);
```

#### Auth Config Type

```typescript
type UploadistaCloudAuthConfig = {
  mode: 'uploadista-cloud';
  /**
   * URL of your auth server that issues JWT tokens.
   * Should be a GET endpoint that accepts client ID in the URL path.
   * Example: /api/auth/token/{clientId}
   */
  authServerUrl: string;
  /**
   * Client ID to use for authentication.
   * Used to identify your application with Uploadista Cloud.
   */
  clientId: string;
};
```

#### Server Implementation (Next.js Example)

Create an API route that exchanges credentials with Uploadista Cloud:

```typescript
// app/api/auth/token/[clientId]/route.ts
import { getAuthCredentials } from '@uploadista/server/auth';
import { NextRequest, NextResponse } from 'next/server';

export const GET = async (
  req: NextRequest,
  ctx: { params: { clientId: string } }
) => {
  const { clientId } = await ctx.params;

  // Get your Uploadista API key from environment
  const apiKey = process.env.UPLOADISTA_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'UPLOADISTA_API_KEY is not set' },
      { status: 500 }
    );
  }

  // Exchange credentials with Uploadista Cloud
  const response = await getAuthCredentials({
    uploadistaClientId: clientId,
    uploadistaApiKey: apiKey,
  });

  if (!response.isValid) {
    return NextResponse.json(
      { error: response.error },
      { status: 500 }
    );
  }

  // Return token to client
  // Response shape: { token: string, expiresIn: number }
  return NextResponse.json(response.data);
};
```

#### Server Implementation (Express Example)

```typescript
import express from 'express';
import { getAuthCredentials } from '@uploadista/server/auth';

const app = express();

app.get('/api/auth/token/:clientId', async (req, res) => {
  const { clientId } = req.params;

  // Get your Uploadista API key from environment
  const apiKey = process.env.UPLOADISTA_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'UPLOADISTA_API_KEY is not set'
    });
  }

  // Exchange credentials with Uploadista Cloud
  const response = await getAuthCredentials({
    uploadistaClientId: clientId,
    uploadistaApiKey: apiKey,
  });

  if (!response.isValid) {
    return res.status(500).json({ error: response.error });
  }

  // Return token to client
  return res.json(response.data);
});
```

#### React Integration Example

Using the React hooks with UploadistaCloud auth:

```typescript
import { UploadistaProvider, useUpload } from '@uploadista/react';

// In your app root
function App() {
  return (
    <UploadistaProvider
      storageId={process.env.REACT_APP_STORAGE_ID}
      auth={{
        mode: 'uploadista-cloud',
        authServerUrl: '/api/auth/token',
        clientId: process.env.REACT_APP_CLIENT_ID
      }}
    >
      <UploadComponent />
    </UploadistaProvider>
  );
}

// In your component
function UploadComponent() {
  const upload = useUpload({
    onSuccess: (result) => console.log('Upload complete:', result),
    onError: (error) => console.error('Upload failed:', error)
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      upload.upload(file); // Token management is automatic
    }
  };

  return <input type="file" onChange={handleFileSelect} />;
}
```

#### Token Lifecycle

The client automatically handles token management:

- **Caching**: Tokens are cached per job to minimize auth server requests
- **Expiration**: Tokens are refreshed 60 seconds before expiration
- **Retry**: Automatic retry with fresh token on 401 Unauthorized errors
- **Cleanup**: Token cache is cleared when jobs complete

You can monitor token cache statistics:

```typescript
// Access the auth manager (internal API)
const stats = client.authManager?.getCacheStats();
console.log(`Cached tokens: ${stats?.cachedJobCount}`);
console.log(`Has global token: ${stats?.hasGlobalToken}`);
```

## Backward Compatibility

Authentication is **completely optional**. If you don't provide `authMiddleware` (server) or `auth` config (client), everything works as before:

```typescript
// Server - no auth
const adapter = await createHonoUploadistaAdapter({
  // No authMiddleware - all requests allowed
});

// Client - no auth
const client = createUploadistaClient({
  // No auth - no credentials sent
});
```

## Error Handling

### Server Errors

- **401 Unauthorized**: Auth middleware returned `null`
- **500 Internal Server Error**: Auth middleware threw an error

### Client Errors

When the server returns 401, the client will propagate the error to your error handler:

```typescript
client.upload(file, {
  onError: (error) => {
    if (error.message.includes('401')) {
      // Handle authentication failure
      console.error('Authentication failed');
    }
  }
});
```

## Fine-Grained Permissions

The Uploadista engine supports fine-grained, permission-based access control. Permissions allow you to control exactly what operations each authenticated user can perform.

### Permission Model

Permissions follow a `resource:action` format with support for wildcards and hierarchies:

```typescript
// Permission format: resource:action
"upload:create"    // Create new uploads
"flow:execute"     // Execute flows
"engine:health"    // Access health endpoints
```

### Available Permissions

#### Engine Permissions

| Permission | Description |
|------------|-------------|
| `engine:*` | All engine permissions (wildcard) |
| `engine:health` | Access health/liveness endpoint |
| `engine:readiness` | Access readiness and components endpoints |
| `engine:metrics` | Access metrics endpoint |
| `engine:dlq` | All DLQ permissions (hierarchical) |
| `engine:dlq:read` | Read DLQ items (list, get, stats) |
| `engine:dlq:write` | Modify DLQ items (retry, delete, resolve, cleanup) |

#### Flow Permissions

| Permission | Description |
|------------|-------------|
| `flow:*` | All flow permissions (wildcard) |
| `flow:execute` | Execute and resume flows |
| `flow:status` | Check flow/job status |
| `flow:cancel` | Cancel and pause flows |

#### Upload Permissions

| Permission | Description |
|------------|-------------|
| `upload:*` | All upload permissions (wildcard) |
| `upload:create` | Create uploads and upload chunks |
| `upload:read` | Read upload status and capabilities |
| `upload:cancel` | Cancel uploads |

### Wildcard Permissions

Wildcards (`*`) match any action within a resource:

```typescript
// User with "engine:*" can access:
// - engine:health
// - engine:readiness
// - engine:metrics
// - engine:dlq:read
// - engine:dlq:write

// User with "flow:*" can access:
// - flow:execute
// - flow:status
// - flow:cancel
```

### Hierarchical Permissions

Some permissions imply sub-permissions:

```typescript
// "engine:dlq" implies both:
// - engine:dlq:read
// - engine:dlq:write
```

### Granting Permissions

Include permissions in the `AuthContext` returned by your auth middleware:

```typescript
authMiddleware: async (c) => {
  const user = await validateUser(c);

  if (!user) return null;

  return {
    clientId: user.organizationId,
    permissions: user.isAdmin
      ? ['engine:*']  // Admin gets full access
      : ['flow:*', 'upload:*'],  // Regular user gets flow and upload access
    metadata: {
      email: user.email,
    },
  };
}
```

### Permission-Based API Key Example

```typescript
authMiddleware: async (c) => {
  const apiKey = c.req.header('X-API-Key');
  if (!apiKey) return null;

  const key = await db.apiKeys.findByKey(apiKey);
  if (!key) return null;

  // API keys have limited permissions
  return {
    clientId: key.organizationId,
    permissions: ['flow:execute', 'upload:create'],  // Limited access
    metadata: {
      keyId: key.id,
    },
  };
}
```

### Checking Permissions in Custom Code

The `AuthContextService` provides methods to check permissions:

```typescript
import { Effect } from 'effect';
import { AuthContextService, PERMISSIONS } from '@uploadista/server';

const myHandler = Effect.gen(function* () {
  const authService = yield* AuthContextService;

  // Check if user has a specific permission
  const canExecute = yield* authService.hasPermission(PERMISSIONS.FLOW.EXECUTE);

  // Check if user has any of multiple permissions
  const canManageDlq = yield* authService.hasAnyPermission([
    PERMISSIONS.ENGINE.DLQ_READ,
    PERMISSIONS.ENGINE.DLQ_WRITE,
  ]);

  // Require a permission (fails with AuthorizationError if not granted)
  yield* authService.requirePermission(PERMISSIONS.UPLOAD.CREATE);

  // Get all granted permissions
  const permissions = yield* authService.getPermissions();
});
```

### Error Responses

When a permission check fails, the server returns:

```json
{
  "code": "PERMISSION_DENIED",
  "message": "Permission denied: flow:execute required"
}
```

With HTTP status:
- `401 Unauthorized` - No authentication provided
- `403 Forbidden` - Authenticated but missing required permission

## Usage Hooks

Usage hooks allow you to intercept upload and flow operations for quota checking, usage tracking, and billing integration.

### Overview

Usage hooks are called at key lifecycle points:

| Hook | When Called | Can Abort? |
|------|-------------|------------|
| `onUploadStart` | Before upload is created | Yes |
| `onUploadComplete` | After upload completes successfully | No |
| `onFlowStart` | Before flow execution begins | Yes |
| `onFlowComplete` | After flow completes or is cancelled | No |

### Configuration

Add usage hooks to your server configuration:

```typescript
import { createUploadistaServer } from '@uploadista/server';
import { Effect } from 'effect';

const server = await createUploadistaServer({
  // ... other config

  usageHooks: {
    hooks: {
      onUploadStart: (ctx) => Effect.gen(function* () {
        // Check quota before upload
        const quota = yield* checkUserQuota(ctx.clientId);

        if (quota.storageUsed + ctx.metadata.fileSize > quota.storageLimit) {
          return {
            action: 'abort',
            reason: 'Storage quota exceeded',
            code: 'QUOTA_EXCEEDED',
          };
        }

        return { action: 'continue' };
      }),

      onUploadComplete: (ctx) => Effect.gen(function* () {
        // Track usage after upload
        yield* recordUsage(ctx.clientId, {
          type: 'upload',
          fileSize: ctx.metadata.fileSize,
          uploadId: ctx.metadata.uploadId,
        });
      }),

      onFlowStart: (ctx) => Effect.gen(function* () {
        // Check subscription before flow execution
        const subscription = yield* getSubscription(ctx.clientId);

        if (!subscription || subscription.status !== 'active') {
          return {
            action: 'abort',
            reason: 'Active subscription required',
            code: 'SUBSCRIPTION_REQUIRED',
          };
        }

        return { action: 'continue' };
      }),

      onFlowComplete: (ctx) => Effect.gen(function* () {
        // Track flow execution
        yield* recordUsage(ctx.clientId, {
          type: 'flow',
          flowId: ctx.metadata.flowId,
          jobId: ctx.metadata.jobId,
          status: ctx.metadata.status,
        });
      }),
    },

    // Optional: Configure timeout (default: 5000ms)
    timeout: 5000,
  },
});
```

### Hook Types

```typescript
import type { UsageHooks, UsageHookResult } from '@uploadista/server';

// Hook result type
type UsageHookResult =
  | { action: 'continue' }  // Allow operation to proceed
  | {
      action: 'abort';
      reason: string;       // Error message shown to user
      code?: string;        // Error code (e.g., 'QUOTA_EXCEEDED')
    };

// Upload context
interface UploadUsageContext {
  clientId: string;
  operation: 'upload';
  metadata: {
    fileSize?: number;
    mimeType?: string;
    fileName?: string;
    uploadId?: string;
    duration?: number;  // Only in onUploadComplete
  };
}

// Flow context
interface FlowUsageContext {
  clientId: string;
  operation: 'flow';
  metadata: {
    flowId?: string;
    jobId?: string;
    status?: string;  // Only in onFlowComplete
  };
}
```

### Fail-Open Design

Usage hooks follow a "fail-open" design for availability:

- **Timeout**: If a hook takes longer than the configured timeout, the operation proceeds
- **Errors**: If a hook throws an error, the operation proceeds (error is logged)
- **Only explicit abort**: Operations are only blocked when hooks return `{ action: 'abort' }`

This ensures that temporary issues with quota checking or billing services don't block your users.

### Quota Checking Example

```typescript
const usageHooks = {
  hooks: {
    onUploadStart: (ctx) => Effect.gen(function* () {
      // Skip quota check if no client ID
      if (!ctx.clientId) {
        return { action: 'continue' };
      }

      // Check storage quota
      const usage = yield* getStorageUsage(ctx.clientId);
      const limit = yield* getStorageLimit(ctx.clientId);

      const newUsage = usage + (ctx.metadata.fileSize ?? 0);

      if (newUsage > limit) {
        return {
          action: 'abort',
          reason: `Storage quota exceeded. Used: ${formatBytes(usage)}, Limit: ${formatBytes(limit)}`,
          code: 'STORAGE_QUOTA_EXCEEDED',
        };
      }

      return { action: 'continue' };
    }),
  },
};
```

### Billing Integration Example

```typescript
const usageHooks = {
  hooks: {
    onUploadComplete: (ctx) => Effect.gen(function* () {
      if (!ctx.clientId || !ctx.metadata.fileSize) {
        return;
      }

      // Report usage to billing system (e.g., Stripe, Polar)
      yield* billingService.reportUsage({
        customerId: ctx.clientId,
        metric: 'storage_bytes',
        quantity: ctx.metadata.fileSize,
        timestamp: new Date(),
      });
    }),

    onFlowComplete: (ctx) => Effect.gen(function* () {
      if (!ctx.clientId) {
        return;
      }

      // Report flow execution to billing
      yield* billingService.reportUsage({
        customerId: ctx.clientId,
        metric: 'flow_executions',
        quantity: 1,
        timestamp: new Date(),
      });
    }),
  },
};
```

### Error Responses

When a hook aborts an operation:

```json
{
  "code": "QUOTA_EXCEEDED",
  "message": "Storage quota exceeded. Used: 9.5 GB, Limit: 10 GB"
}
```

With HTTP status `402 Payment Required`.

## Security Best Practices

1. **Always use HTTPS in production** - credentials sent over HTTP can be intercepted
2. **Don't log credentials or tokens** - they contain sensitive information
3. **Validate tokens properly** - use established libraries (jose, jsonwebtoken, etc.)
4. **Use short-lived tokens** - reduce impact if token is compromised
5. **Implement rate limiting** - prevent brute force attacks (future feature)
6. **Use least-privilege permissions** - grant only the permissions each user needs
7. **Audit permission changes** - log when user permissions are modified
8. **Test permission boundaries** - verify users can't access unauthorized resources


## Troubleshooting

### Auth middleware not being called

Check that you're passing `authMiddleware` to the adapter options.

### Always getting 401

- Verify your auth middleware is returning a valid `AuthContext` object
- Check the credentials are being sent correctly from the client
- Add logging to your auth middleware to debug

### Client credentials not being sent

- Verify `auth` config is passed to `createUploadistaClient`
- Check `getCredentials()` is returning the correct format
- Ensure credentials are not empty

### Getting 403 Forbidden errors

- Check that `permissions` array is included in your `AuthContext`
- Verify the required permission is in the user's permissions list
- Use wildcard permissions (`engine:*`, `flow:*`, `upload:*`) for full access
- Check server logs for `[Auth] Permission denied` messages

### Usage hook not being called

- Verify `usageHooks` is configured in `createUploadistaServer`
- Check that the hook function returns an Effect (not a Promise)
- Look for timeout warnings in server logs
- Ensure `clientId` is set in `AuthContext` (hooks only run for authenticated requests)

### Usage hook timeout

- Increase the `timeout` value in `usageHooks` config (default: 5000ms)
- Optimize your quota checking or billing API calls
- Consider caching subscription/quota data
- Note: Timeouts don't block operations (fail-open design)

## API Reference

### Server Types

```typescript
// From @uploadista/server

// Authentication context
export type AuthContext = {
  clientId: string;
  metadata?: Record<string, unknown>;
  permissions?: string[];
};

export type AuthResult = AuthContext | null;

// Permission constants
export const PERMISSIONS = {
  ENGINE: {
    ALL: 'engine:*',
    HEALTH: 'engine:health',
    READINESS: 'engine:readiness',
    METRICS: 'engine:metrics',
    DLQ: 'engine:dlq',
    DLQ_READ: 'engine:dlq:read',
    DLQ_WRITE: 'engine:dlq:write',
  },
  FLOW: {
    ALL: 'flow:*',
    EXECUTE: 'flow:execute',
    CANCEL: 'flow:cancel',
    STATUS: 'flow:status',
  },
  UPLOAD: {
    ALL: 'upload:*',
    CREATE: 'upload:create',
    READ: 'upload:read',
    CANCEL: 'upload:cancel',
  },
} as const;

// Authorization errors
export class AuthorizationError extends Error {
  readonly requiredPermission: string;
  readonly code = 'PERMISSION_DENIED';
  readonly status = 403;
}

export class AuthenticationRequiredError extends Error {
  readonly code = 'AUTHENTICATION_REQUIRED';
  readonly status = 401;
}

export class QuotaExceededError extends Error {
  readonly code: string;  // Custom code like 'QUOTA_EXCEEDED'
  readonly status = 402;
}

// Auth context service
export class AuthContextService {
  getClientId(): Effect<string | null>;
  getMetadata(): Effect<Record<string, unknown>>;
  hasPermission(permission: string): Effect<boolean>;
  hasAnyPermission(permissions: readonly string[]): Effect<boolean>;
  requirePermission(permission: string): Effect<void, AuthorizationError | AuthenticationRequiredError>;
  requireAuthentication(): Effect<AuthContext, AuthenticationRequiredError>;
  getPermissions(): Effect<readonly string[]>;
  getAuthContext(): Effect<AuthContext | null>;
}

// Usage hooks
export type UsageHookResult =
  | { action: 'continue' }
  | { action: 'abort'; reason: string; code?: string };

export interface UploadUsageContext {
  clientId: string;
  operation: 'upload';
  metadata: {
    fileSize?: number;
    mimeType?: string;
    fileName?: string;
    uploadId?: string;
    duration?: number;
  };
}

export interface FlowUsageContext {
  clientId: string;
  operation: 'flow';
  metadata: {
    flowId?: string;
    jobId?: string;
    status?: string;
  };
}

export interface UsageHooks {
  onUploadStart?: (ctx: UploadUsageContext) => Effect<UsageHookResult>;
  onUploadComplete?: (ctx: UploadUsageContext) => Effect<void>;
  onFlowStart?: (ctx: FlowUsageContext) => Effect<UsageHookResult>;
  onFlowComplete?: (ctx: FlowUsageContext) => Effect<void>;
}

export interface UsageHookConfig {
  hooks?: UsageHooks;
  timeout?: number;  // Default: 5000ms
}
```

### Client Types

```typescript
// From @uploadista/client
export type AuthConfig = DirectAuthConfig | UploadistaCloudAuthConfig;

export type DirectAuthConfig = {
  mode: 'direct';
  getCredentials: () => RequestCredentials | Promise<RequestCredentials>;
};

export type RequestCredentials = {
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
};
```

## Examples

See the `examples/` directory for complete working examples:

- **UploadistaCloud auth**: See `examples/next-cloud-client/` for a full Next.js implementation with UploadistaCloud auth mode
- Direct auth with Bearer token (coming soon)
- Direct auth with API key (coming soon)
- Direct auth with session cookies (coming soon)
