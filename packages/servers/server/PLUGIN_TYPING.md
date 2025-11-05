# Plugin Typing System

## Overview

The Uploadista server has a sophisticated typing system that allows flows to depend on plugins while maintaining type safety. This document explains how the typing works and how to use it effectively.

## Core Concepts

### Flow Requirements

Flows can have dependencies on services (like `ImagePlugin`) that are provided through Effect's dependency injection system. The `Flow` type has a third generic parameter `TRequirements` that captures these dependencies:

```typescript
type Flow<
  TFlowInputSchema extends z.ZodSchema<any>,
  TFlowOutputSchema extends z.ZodSchema<any>,
  TRequirements  // Services that flow nodes need
>
```

### Plugin Layers

Plugins are Effect layers that provide services to flows. They are typed as:

```typescript
Layer.Layer<TOutput, TError, TRequirements>
```

Where:
- `TOutput`: The service(s) this plugin provides
- `TError`: Errors the plugin can produce (usually `never`)
- `TRequirements`: Services this plugin needs (can be `never` or other services)

## Type Parameters

The `createUploadistaServer` function has these key type parameters:

```typescript
createUploadistaServer<
  TContext,      // Framework-specific context
  TResponse,     // Framework-specific response
  TWebSocket,    // WebSocket handler type
  TFlows,        // Flow function type
  TPlugins       // Plugin layers tuple
>
```

### TFlows

The flows function type that returns Effects producing Flows:

```typescript
TFlows extends (
  flowId: string,
  clientId: string | null,
) => Effect.Effect<
  Flow<z.ZodSchema<unknown>, z.ZodSchema<unknown>, any>,
  UploadistaError,
  any  // Flow requirements - can be ImagePlugin, etc.
>
```

The `any` here allows flows to have any requirements, which will be satisfied by plugins.

### TPlugins

A readonly tuple of plugin layers:

```typescript
TPlugins extends readonly Layer.Layer<any, never, any>[]
```

The type parameters are:
- First `any`: Plugins can provide any services
- `never`: Plugins should not error
- Second `any`: Plugins can have requirements (satisfied by other plugins or at runtime)

## Usage Examples

### Basic Flow Without Plugins

```typescript
const server = await createUploadistaServer({
  flows: (flowId) => Effect.succeed(basicFlow),
  dataStore: { type: "s3", config: { bucket: "uploads" } },
  kvStore: redisKvStore,
  adapter: honoAdapter({ /* ... */ })
});
```

### Flow With Image Plugin

```typescript
import { sharpImagePlugin } from "@uploadista/flow-images-sharp";

// Create a flow that uses ImagePlugin
const imageFlow = Effect.gen(function* () {
  const imageService = yield* ImagePlugin;

  return createFlow({
    id: "resize-flow",
    nodes: [
      yield* createResizeNode("resize", {
        width: 800,
        height: 600,
        fit: "cover"
      })
    ],
    // ... edges, schemas
  });
});

// Create server with plugin
const server = await createUploadistaServer({
  flows: (flowId) => {
    if (flowId === "resize") return imageFlow;
    return Effect.fail(new UploadistaError({
      code: "FLOW_NOT_FOUND"
    }));
  },
  plugins: [sharpImagePlugin],  // Provides ImagePlugin
  dataStore: { type: "s3", config: { bucket: "uploads" } },
  kvStore: redisKvStore,
  adapter: honoAdapter({ /* ... */ })
});
```

### Multiple Plugins

```typescript
const server = await createUploadistaServer({
  flows: getFlowById,
  plugins: [
    sharpImagePlugin,      // Provides ImagePlugin
    virusScanPlugin,       // Provides VirusScanService
    customProcessingPlugin // Provides CustomProcessingService
  ] as const,  // 'as const' preserves tuple type
  dataStore: { type: "s3", config: { bucket: "uploads" } },
  kvStore: redisKvStore,
  adapter: honoAdapter({ /* ... */ })
});
```

## Implementation Details

### Layer Composition

The server merges all layers together:

```typescript
const serverLayer = Layer.mergeAll(
  uploadServerLayer,     // Provides UploadServer
  flowServerLayer,       // Provides FlowServer
  metricsLayer,          // Provides MetricsService
  authCacheLayer,        // Provides AuthCacheService
  ...plugins             // Provides plugin services (ImagePlugin, etc.)
);
```

### Type Assertions

Due to the dynamic nature of plugins, we use type assertions to bridge Effect's strict typing with the plugin system:

```typescript
const serverLayer = serverLayerRaw as unknown as Layer.Layer<any, never, any>;
const managedRuntime = ManagedRuntime.make(serverLayer as any);
```

These assertions are necessary because:
1. Plugin requirements are determined at runtime based on which plugins are provided
2. TypeScript cannot statically verify all possible plugin combinations
3. The Effect runtime handles requirement resolution dynamically

### Request Context Layer

For each request, plugin services are merged with request-specific context:

```typescript
const requestContextLayer = Layer.mergeAll(
  authContextLayer,       // Auth for this request
  authCacheLayer,         // Shared auth cache
  effectiveMetricsLayer,  // Metrics service
  ...plugins,             // All plugin services
  ...waitUntilLayers      // Cloudflare waitUntil if available
);

// Flow execution with all dependencies
const response = yield* handleUploadistaRequest(uploadistaRequest)
  .pipe(Effect.provide(requestContextLayer));
```

This ensures that:
- Flow nodes have access to all plugin services (ImagePlugin, etc.)
- Each request has isolated auth context
- Metrics and caching are shared across requests

## Best Practices

### 1. Use `as const` for Plugin Arrays

```typescript
const plugins = [
  imagePlugin,
  scanPlugin
] as const;
```

This preserves the tuple type and enables better type inference.

### 2. Type Flow Requirements Explicitly

When creating flows, explicitly type the requirements:

```typescript
const myFlow: Effect.Effect<
  Flow<InputSchema, OutputSchema, ImagePlugin>,
  UploadistaError,
  never
> = Effect.gen(function* () {
  const imageService = yield* ImagePlugin;
  // ...
});
```

### 3. Document Plugin Dependencies

Always document which plugins a flow requires:

```typescript
/**
 * Image processing flow
 *
 * @requires ImagePlugin - For resize and optimize operations
 * @requires MetricsService - For performance tracking
 */
export const imageProcessingFlow = /* ... */;
```

### 4. Provide Plugin Implementations

When creating a server, ensure all required plugins are provided:

```typescript
// ❌ Bad: Flow requires ImagePlugin but none provided
createUploadistaServer({
  flows: flowThatNeedsImagePlugin,
  plugins: []  // Missing ImagePlugin!
});

// ✅ Good: All requirements satisfied
createUploadistaServer({
  flows: flowThatNeedsImagePlugin,
  plugins: [sharpImagePlugin]  // Provides ImagePlugin
});
```

## Advanced: Custom Plugins

### Creating a Plugin

```typescript
import { Context, Layer, Effect } from "effect";

// 1. Define the service interface
export interface CustomService {
  process: (data: Uint8Array) => Effect.Effect<Uint8Array, Error>;
}

// 2. Create the service tag
export class CustomService extends Context.Tag("CustomService")<
  CustomService,
  CustomService
>() {}

// 3. Create the implementation layer
export const customServiceLive = Layer.succeed(
  CustomService,
  {
    process: (data) => Effect.sync(() => {
      // Your processing logic
      return data;
    })
  }
);
```

### Using Custom Plugin in Flow

```typescript
const flowWithCustomPlugin = Effect.gen(function* () {
  const customService = yield* CustomService;

  return createFlow({
    nodes: [
      yield* createTransformNode({
        id: "custom",
        name: "Custom Processing",
        transform: (input) => customService.process(input)
      })
    ],
    // ...
  });
});
```

### Adding to Server

```typescript
const server = await createUploadistaServer({
  flows: () => flowWithCustomPlugin,
  plugins: [customServiceLive],
  // ...
});
```

## Troubleshooting

### Flow Requirements Not Satisfied

**Error**: "Service not found" at runtime

**Solution**: Ensure the plugin providing the required service is in the `plugins` array

```typescript
// Add the missing plugin
plugins: [sharpImagePlugin]  // Provides ImagePlugin
```

### Type Errors with Plugins

**Error**: Type mismatch when passing plugins

**Solution**: Use `as const` and ensure plugin types match `Layer.Layer<any, never, any>`

```typescript
const plugins = [myPlugin] as const;
```

### Runtime Layer Composition Errors

**Error**: Layer requirements not satisfied

**Solution**: Check that plugin dependencies form a valid dependency graph (no circular dependencies)

```typescript
// ❌ Bad: Circular dependency
const pluginA = Layer.effect(ServiceA,
  Effect.gen(function* () {
    yield* ServiceB;  // Depends on B
    return { /* ... */ };
  })
);

const pluginB = Layer.effect(ServiceB,
  Effect.gen(function* () {
    yield* ServiceA;  // Depends on A - circular!
    return { /* ... */ };
  })
);

// ✅ Good: Linear dependency
const pluginA = Layer.succeed(ServiceA, { /* ... */ });
const pluginB = Layer.effect(ServiceB,
  Effect.gen(function* () {
    yield* ServiceA;  // Only B depends on A
    return { /* ... */ };
  })
);
```
