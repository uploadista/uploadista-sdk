# Express Adapter for Uploadista

This package provides an Express.js adapter for the Uploadista upload server, following the same patterns as the Hono adapter but adapted for Express.js applications.

## Installation

```bash
npm install @uploadista/adapters-express express
# or
pnpm add @uploadista/adapters-express express
```

## Basic Usage

```typescript
import express from 'express';
import { createExpressUploadAdapter } from '@uploadista/adapters-express';
import { Layer } from 'effect';

// Set up your layers (same as Hono adapter)
const userLayer = Layer.mergeAll(
  dataStoreLayer,
  kvStoreLayer,
  eventEmitterLayer,
  generateIdLayer
);

// Create the adapter
const uploadAdapter = await createExpressUploadAdapter({
  kvStore: kvStoreLayer,
  dataStore: dataStoreLayer,
  eventEmitter: eventEmitterLayer,
  withTracing: true,
  enableWebSockets: true
});

const app = express();

// Apply JSON middleware for POST requests
app.use(express.json());

// HTTP endpoints - Express style
app.use('/api/upload', uploadAdapter.handler);

app.listen(3000, () => {
  console.log('Express server running on port 3000');
});
```

## WebSocket Integration

Unlike Hono which has built-in WebSocket support, Express requires an external WebSocket library. Here's how to integrate with the popular `ws` library:

```typescript
import express from 'express';
import { createServer } from 'http';
import WebSocket from 'ws';
import { createExpressUploadAdapter } from '@uploadista/adapters-express';

const app = express();
const server = createServer(app);

// Create the upload adapter
const uploadAdapter = await createExpressUploadAdapter({
  kvStore: kvStoreLayer,
  dataStore: dataStoreLayer,
  eventEmitter: eventEmitterLayer,
  enableWebSockets: true
});

// HTTP endpoints
app.use('/api/upload', uploadAdapter.handler);

// WebSocket server setup
const wss = new WebSocket.Server({ 
  server,
  path: '/ws/upload' 
});

wss.on('connection', (ws, req) => {
  const connection = {
    id: `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    send: (data: string) => ws.send(data),
    close: (code?: number, reason?: string) => ws.close(code, reason),
    readyState: ws.readyState
  };
  
  // Handle WebSocket connection with Uploadista
  uploadAdapter.websocketHandler(req, connection);
  
  // Handle incoming messages
  ws.on('message', (message) => {
    // You can add custom message handling here
    console.log('WebSocket message:', message.toString());
  });
  
  // Handle connection close
  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

server.listen(3000, () => {
  console.log('Express server with WebSocket support running on port 3000');
});
```

## Effect-native API

For Effect-based applications, you can use the Effect-native API:

```typescript
import { Effect } from 'effect';
import { createExpressUploadServer } from '@uploadista/adapters-express';

const serverEffect = createExpressUploadServer({
  kvStore: kvStoreLayer,
  dataStore: dataStoreLayer,
  eventEmitter: eventEmitterLayer,
  enableWebSockets: true
});

// Use within Effect context
const program = Effect.gen(function* () {
  const server = yield* serverEffect;
  
  // server.handler, server.upload, and server.websocketHandler
  // are available as Effect-returning functions
});
```

## API Reference

### Types

- `ExpressUploadAdapter`: Promise-based adapter for standard Express apps
- `ExpressUploadServer`: Effect-native server for Effect-based applications
- `WebSocketConnection`: Interface for WebSocket connection abstraction
- `ExpressWebSocketHandler`: Type for WebSocket handler functions

### Functions

- `createExpressUploadAdapter(options)`: Creates a Promise-based adapter
- `createExpressUploadServer(options)`: Creates an Effect-native server
- WebSocket utilities: `createWebSocketHandler`, `createWebSocketMessageHandler`, etc.

## Differences from Hono Adapter

1. **WebSocket Handling**: Express requires external WebSocket library integration
2. **Middleware**: Uses Express middleware patterns instead of Hono's context pattern
3. **Request/Response**: Works with Express's `req`/`res` objects
4. **Error Handling**: Integrates with Express error handling middleware

## Configuration Options

Same as the Hono adapter:

- `kvStore`: Key-value store layer
- `dataStore`: Data store layer (depends on kvStore)
- `eventEmitter`: Event emitter layer
- `webSocketManager`: Optional WebSocket manager layer
- `generateId`: Optional ID generation layer
- `withTracing`: Enable OpenTelemetry tracing
- `enableWebSockets`: Enable WebSocket support