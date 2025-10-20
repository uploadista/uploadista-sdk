# Hono Adapter with Effect DI - Usage Examples

This document demonstrates how to use the new Effect-based Hono adapter with smooth DX while maintaining full dependency injection capabilities.

## Basic Usage

### Simple Layer-Based Setup

```typescript
import { Hono } from 'hono';
import { Layer } from 'effect';
import { createStandardHonoAdapter } from '@uploadista/adapters-hono';
import { myDataStoreLayer, myKvStoreLayer, myEventEmitterLayer, myGenerateIdLayer } from './my-layers';

// Create your layers
const userLayer = Layer.mergeAll(
  myDataStoreLayer,
  myKvStoreLayer, 
  myEventEmitterLayer,
  myGenerateIdLayer
);

// Create adapter with automatic WebSocket manager integration
const uploadAdapter = createStandardHonoAdapter(userLayer, {
  withTracing: true,
  enableWebSockets: true
});

const app = new Hono();

// HTTP endpoints - handles upload, chunking, etc.
app.on(['POST', 'GET', 'PATCH'], '/api/upload/**', (c) =>
  uploadAdapter.handler(c)
);

// WebSocket endpoint - automatically configured with Effect DI
if (uploadAdapter.websocketHandler) {
  app.get('/ws/upload/:uploadId', uploadAdapter.websocketHandler);
}

export default app;
```

### Advanced Usage with Full Configuration

```typescript
import { createHonoUploadAdapter } from '@uploadista/adapters-hono';
import { Layer } from 'effect';

const userLayer = Layer.mergeAll(
  dataStoreLayer,
  kvStoreLayer,
  eventEmitterLayer,
  generateIdLayer
);

const uploadAdapter = createHonoUploadAdapter({
  layer: userLayer,
  withTracing: true,
  enableWebSockets: true, // WebSocketManagerLiveLayer is automatically included
});

// Usage is the same as above
```

### Async Initialization

For complex scenarios where you need async setup:

```typescript
import { createHonoUploadAdapterAsync } from '@uploadista/adapters-hono';

const uploadAdapter = await createHonoUploadAdapterAsync({
  layer: userLayer,
  withTracing: true,
  enableWebSockets: true,
});

// Same usage as above
```

## Key Benefits

### 1. Automatic WebSocket Management
- WebSocket manager is automatically included in the layer composition
- No need to manually manage `WebSocketManagerLiveLayer`
- WebSocket handlers use proper Effect DI pattern internally

### 2. Clean API
- Single function call creates fully configured adapter
- WebSocket handler is automatically available if enabled
- No complex layer composition required from the user

### 3. Type Safety
- Full Effect type safety maintained
- Proper error handling through Effect system
- Type-safe layer composition

### 4. Flexibility
- Can still use advanced layer patterns if needed
- Async initialization available
- Easy to extend with custom layers

## Migration from Global WebSocket Manager

### Before (Global Pattern)
```typescript
import { getWebSocketManager } from '@uploadista/event-emitter-websocket';

// Global manager - shared state
const webSocketManager = getWebSocketManager();

// Manual handler creation
const websocketHandler = (c) => createWebSocketHandler(c, webSocketManager);
```

### After (Effect DI Pattern)
```typescript
import { createStandardHonoAdapter } from '@uploadista/adapters-hono';

// Everything handled internally with proper DI
const uploadAdapter = createStandardHonoAdapter(userLayer);

// WebSocket handler automatically configured
const websocketHandler = uploadAdapter.websocketHandler;
```

## Internal Architecture

The adapter internally:

1. **Merges your user layer with WebSocketManagerLiveLayer**
2. **Creates an Effect runtime with all dependencies**
3. **Provides WebSocket handlers that use the runtime for DI**
4. **Maintains clean separation between sync adapter creation and Effect execution**

This approach gives you:
- ✅ Smooth, synchronous adapter creation API
- ✅ Full Effect DI benefits internally
- ✅ Proper resource management
- ✅ Type safety throughout
- ✅ Easy testing with mock layers

## Testing

```typescript
import { Layer } from 'effect';
import { createStandardHonoAdapter } from '@uploadista/adapters-hono';

// Create test layers with mocks
const testLayer = Layer.mergeAll(
  mockDataStoreLayer,
  mockKvStoreLayer,
  mockEventEmitterLayer,
  mockGenerateIdLayer
);

// Adapter uses test dependencies automatically
const testAdapter = createStandardHonoAdapter(testLayer, {
  enableWebSockets: false // Disable WebSockets for testing if needed
});
```