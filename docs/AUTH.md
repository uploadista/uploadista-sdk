# Authentication System (MVP)

This document describes the authentication system for the uploadista engine.

## Overview

The uploadista engine supports optional authentication through a dual-mode system:

1. **Direct Auth Mode**: Bring your own authentication (BYO)
2. **UploadistaCloud Auth Mode**: Standard JWT token exchange with auth server (coming soon)

**Current MVP Status**: ✅ Direct Auth Mode with Hono adapter

## Server-Side Authentication (Hono Adapter)

### Basic Setup

The Hono adapter accepts an optional `authMiddleware` parameter that validates requests:

```typescript
import { createHonoUploadistaAdapter } from '@uploadista/adapters-hono';
import type { AuthContext } from '@uploadista/server';

const adapter = await createHonoUploadistaAdapter({
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
      userId: user.id,
      metadata: {
        email: user.email,
        plan: user.plan
      },
      permissions: user.permissions
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
  permissions?: string[];                // Optional: permission list
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

### Basic Setup

The uploadista client accepts an optional `auth` configuration:

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

### Auth Config Types

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

### Client Examples

#### With OAuth Token

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

#### With API Key

```typescript
auth: {
  mode: 'direct',
  getCredentials: () => ({
    headers: { 'X-API-Key': process.env.API_KEY }
  })
}
```

#### With Session Cookie

```typescript
auth: {
  mode: 'direct',
  getCredentials: () => ({
    cookies: { 'session': getSessionId() }
  })
}
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

## Security Best Practices

1. **Always use HTTPS in production** - credentials sent over HTTP can be intercepted
2. **Don't log credentials or tokens** - they contain sensitive information
3. **Validate tokens properly** - use established libraries (jose, jsonwebtoken, etc.)
4. **Use short-lived tokens** - reduce impact if token is compromised
5. **Implement rate limiting** - prevent brute force attacks (future feature)

## Future Enhancements

The MVP provides the foundation for:

- ✅ Direct auth mode (DONE)
- ⏳ UploadistaCloud auth mode with JWT token exchange
- ⏳ Auth context available in upload/flow processing
- ⏳ WebSocket authentication
- ⏳ Express and Fastify adapter support
- ⏳ Rate limiting per user
- ⏳ Storage quotas per user
- ⏳ Fine-grained permissions

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

## API Reference

### Server Types

```typescript
// From @uploadista/server
export type AuthContext = {
  userId: string;
  metadata?: Record<string, unknown>;
  permissions?: string[];
};

export type AuthResult = AuthContext | null;

export class AuthContextService { /* ... */ }
export const AuthContextServiceLive: (context: AuthContext | null) => Layer
export const NoAuthContextServiceLive: Layer
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

- Direct auth with Bearer token (coming soon)
- Direct auth with API key (coming soon)
- Direct auth with session cookies (coming soon)
