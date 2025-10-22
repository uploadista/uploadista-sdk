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

## Security Best Practices

1. **Always use HTTPS in production** - credentials sent over HTTP can be intercepted
2. **Don't log credentials or tokens** - they contain sensitive information
3. **Validate tokens properly** - use established libraries (jose, jsonwebtoken, etc.)
4. **Use short-lived tokens** - reduce impact if token is compromised
5. **Implement rate limiting** - prevent brute force attacks (future feature)


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

- **UploadistaCloud auth**: See `examples/next-cloud-client/` for a full Next.js implementation with UploadistaCloud auth mode
- Direct auth with Bearer token (coming soon)
- Direct auth with API key (coming soon)
- Direct auth with session cookies (coming soon)
