# Type-Safe Plugin System Examples

This document demonstrates how to use the improved type-safe plugin system for the Uploadista server.

## Table of Contents

- [Basic Concepts](#basic-concepts)
- [Simple Flow (No Plugins)](#simple-flow-no-plugins)
- [Flow with Single Plugin](#flow-with-single-plugin)
- [Flow with Multiple Plugins](#flow-with-multiple-plugins)
- [Compile-Time Validation](#compile-time-validation)
- [Mixed Flows (Some with Plugins, Some without)](#mixed-flows-some-with-plugins-some-without)
- [Migration from Untyped to Typed](#migration-from-untyped-to-typed)

## Basic Concepts

### Plugin Types

Each plugin has three related types:

1. **Service Tag** - The Context.Tag class (e.g., `ImagePlugin`)
2. **Service Shape** - The interface defining methods (e.g., `ImagePluginShape`)
3. **Layer Type** - The Effect Layer type (e.g., `ImagePluginLayer`)

```typescript
// Defined in @uploadista/core/flow
export class ImagePlugin extends Context.Tag("ImagePlugin")<
  ImagePlugin,
  ImagePluginShape
>() {}

export type ImagePluginLayer = Layer.Layer<ImagePlugin, never, never>;
```

### Type-Safe Flow Function

Use `TypeSafeFlowFunction<TRequirements>` to declare plugin dependencies:

```typescript
import type { TypeSafeFlowFunction } from "@uploadista/server";
import { ImagePlugin } from "@uploadista/core/flow";

// Flow that requires ImagePlugin
const myFlow: TypeSafeFlowFunction<ImagePlugin> = (flowId, clientId) =>
  Effect.gen(function* () {
    const imageService = yield* ImagePlugin;
    // ...
  });
```

## Simple Flow (No Plugins)

For flows that don't need any plugins:

```typescript
import { createTypeSafeServer, defineSimpleFlow } from "@uploadista/server";
import { createFlow, createInputNode } from "@uploadista/core/flow";
import { z } from "zod";

// Define a simple flow with no plugin dependencies
const simpleUploadFlow = defineSimpleFlow((flowId, clientId) =>
  Effect.gen(function* () {
    const inputNode = yield* createInputNode("input");

    return createFlow({
      id: "simple-upload",
      name: "Simple Upload",
      nodes: [inputNode],
      edges: [],
      inputSchema: z.object({
        input: z.object({
          file: z.instanceof(File),
        }),
      }),
      outputSchema: z.object({
        fileUrl: z.string(),
      }),
    });
  }),
);

// Create server with no plugins
const server = await createTypeSafeServer({
  plugins: [] as const, // No plugins needed
  flows: simpleUploadFlow,
  adapter: honoAdapter({ /* ... */ }),
  dataStore: { type: "s3", config: { bucket: "uploads" } },
  kvStore: redisKvStore,
});
```

## Flow with Single Plugin

### Example: Image Processing Flow

```typescript
import { createTypeSafeServer, defineFlow } from "@uploadista/server";
import { ImagePlugin, createFlow, createInputNode } from "@uploadista/core/flow";
import { createResizeNode } from "@uploadista/flow-images-nodes";
import { sharpImagePlugin } from "@uploadista/flow-images-sharp";
import { z } from "zod";

// Define flow that requires ImagePlugin
const imageResizeFlow = defineFlow<ImagePlugin>((flowId, clientId) =>
  Effect.gen(function* () {
    const inputNode = yield* createInputNode("input");
    const resizeNode = yield* createResizeNode("resize", {
      width: 800,
      height: 600,
      fit: "cover",
    });

    return createFlow({
      id: "image-resize",
      name: "Image Resize",
      nodes: [inputNode, resizeNode],
      edges: [
        { source: "input", target: "resize" },
      ],
      inputSchema: z.object({
        input: z.object({
          file: z.instanceof(File),
        }),
      }),
      outputSchema: z.object({
        resizedUrl: z.string(),
      }),
    });
  }),
);

// Create server with ImagePlugin
const server = await createTypeSafeServer({
  plugins: [sharpImagePlugin] as const, // ✅ Provides ImagePlugin
  flows: imageResizeFlow,
  adapter: honoAdapter({ /* ... */ }),
  dataStore: { type: "s3", config: { bucket: "uploads" } },
  kvStore: redisKvStore,
});
```

## Flow with Multiple Plugins

### Example: Image Processing + ZIP Archive

```typescript
import {
  createTypeSafeServer,
  defineFlow,
  type TypeSafeFlowFunction,
} from "@uploadista/server";
import {
  ImagePlugin,
  ZipPlugin,
  createFlow,
  createInputNode,
} from "@uploadista/core/flow";
import { createResizeNode, createOptimizeNode } from "@uploadista/flow-images-nodes";
import { createZipNode } from "@uploadista/flow-zip-nodes";
import { sharpImagePlugin } from "@uploadista/flow-images-sharp";
import { jsZipPlugin } from "@uploadista/flow-zip-jszip";
import { z } from "zod";

// Flow requires both ImagePlugin AND ZipPlugin
const imageArchiveFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = (
  flowId,
  clientId,
) =>
  Effect.gen(function* () {
    // Both plugins are available
    const imageService = yield* ImagePlugin;
    const zipService = yield* ZipPlugin;

    const inputNode = yield* createInputNode("input");
    const resizeNode = yield* createResizeNode("resize", {
      width: 1920,
      height: 1080,
      fit: "cover",
    });
    const optimizeNode = yield* createOptimizeNode("optimize", {
      quality: 85,
      format: "webp",
    });
    const zipNode = yield* createZipNode("zip", {
      zipName: "images.zip",
      includeMetadata: true,
    });

    return createFlow({
      id: "image-archive",
      name: "Image Processing and Archive",
      nodes: [inputNode, resizeNode, optimizeNode, zipNode],
      edges: [
        { source: "input", target: "resize" },
        { source: "resize", target: "optimize" },
        { source: "optimize", target: "zip" },
      ],
      inputSchema: z.object({
        input: z.object({
          files: z.array(z.instanceof(File)),
        }),
      }),
      outputSchema: z.object({
        archiveUrl: z.string(),
      }),
    });
  });

// Create server with both plugins
const server = await createTypeSafeServer({
  plugins: [
    sharpImagePlugin,  // Provides ImagePlugin
    jsZipPlugin,       // Provides ZipPlugin
  ] as const, // ✅ Both requirements satisfied
  flows: imageArchiveFlow,
  adapter: honoAdapter({ /* ... */ }),
  dataStore: { type: "s3", config: { bucket: "uploads" } },
  kvStore: redisKvStore,
});
```

## Compile-Time Validation

### ✅ Valid Configuration

```typescript
import { ImagePlugin } from "@uploadista/core/flow";
import { sharpImagePlugin } from "@uploadista/flow-images-sharp";

// TypeScript validates this successfully
const server = await createTypeSafeServer({
  plugins: [sharpImagePlugin] as const,
  flows: defineFlow<ImagePlugin>((flowId, clientId) =>
    Effect.gen(function* () {
      const imageService = yield* ImagePlugin; // ✅ Available
      return createFlow({ /* ... */ });
    }),
  ),
  // ... rest of config
});
```

### ❌ Invalid Configuration (Compile Error)

```typescript
import { ImagePlugin } from "@uploadista/core/flow";

// TypeScript ERROR: ImagePlugin required but not provided
const server = await createTypeSafeServer({
  plugins: [] as const, // ❌ No plugins!
  flows: defineFlow<ImagePlugin>((flowId, clientId) =>
    Effect.gen(function* () {
      const imageService = yield* ImagePlugin; // ❌ Not available
      return createFlow({ /* ... */ });
    }),
  ),
  // ... rest of config
});
// Error: Type 'ImagePlugin' does not satisfy constraint 'never'
```

### Error Messages

When plugins are missing, TypeScript shows helpful error:

```typescript
type Error = {
  __error: "Missing required plugins";
  __required: ImagePlugin | ZipPlugin;  // What's needed
  __provided: never;                     // What's provided
  __missing: ImagePlugin | ZipPlugin;   // What's missing
};
```

## Mixed Flows (Some with Plugins, Some without)

### Router Pattern

```typescript
import {
  ImagePlugin,
  ZipPlugin,
  CredentialProvider,
} from "@uploadista/core/flow";
import {
  defineFlow,
  defineSimpleFlow,
  createTypeSafeServer,
} from "@uploadista/server";

// Different flows with different requirements
const simpleFlow = defineSimpleFlow((flowId, clientId) => /* ... */);
const imageFlow = defineFlow<ImagePlugin>((flowId, clientId) => /* ... */);
const aiFlow = defineFlow<ImagePlugin | CredentialProvider>(
  (flowId, clientId) => /* ... */,
);
const archiveFlow = defineFlow<ImagePlugin | ZipPlugin>(
  (flowId, clientId) => /* ... */,
);

// Router function that combines all flows
// Requirements = union of all individual requirements
const flowRouter: TypeSafeFlowFunction<
  ImagePlugin | ZipPlugin | CredentialProvider
> = (flowId, clientId) =>
  Effect.gen(function* () {
    switch (flowId) {
      case "simple":
        return yield* simpleFlow(flowId, clientId);
      case "image":
        return yield* imageFlow(flowId, clientId);
      case "ai":
        return yield* aiFlow(flowId, clientId);
      case "archive":
        return yield* archiveFlow(flowId, clientId);
      default:
        return yield* Effect.fail(
          new UploadistaError({
            code: "FLOW_NOT_FOUND",
            message: `Flow ${flowId} not found`,
          }),
        );
    }
  });

// Server must provide ALL plugins used by ANY flow
const server = await createTypeSafeServer({
  plugins: [
    sharpImagePlugin,        // For image flows
    jsZipPlugin,             // For archive flow
    credentialProviderLive,  // For AI flow
  ] as const,
  flows: flowRouter,
  // ... rest of config
});
```

## Migration from Untyped to Typed

### Before (Untyped)

```typescript
import { createUploadistaServer } from "@uploadista/server";

const server = await createUploadistaServer({
  plugins: [sharpImagePlugin],  // No type safety
  flows: (flowId, clientId) =>
    Effect.gen(function* () {
      // Could forget to provide plugin - runtime error!
      const imageService = yield* ImagePlugin;
      return createFlow({ /* ... */ });
    }),
  // ...
});
```

### After (Type-Safe)

```typescript
import { createTypeSafeServer, defineFlow } from "@uploadista/server";
import { ImagePlugin } from "@uploadista/core/flow";

const imageFlow = defineFlow<ImagePlugin>((flowId, clientId) =>
  Effect.gen(function* () {
    // Type-checked at compile time!
    const imageService = yield* ImagePlugin;
    return createFlow({ /* ... */ });
  }),
);

const server = await createTypeSafeServer({
  plugins: [sharpImagePlugin] as const,  // ✅ Type-safe
  flows: imageFlow,
  // ...
});
```

### Step-by-Step Migration

1. **Add explicit type to flow function**:
   ```typescript
   - const myFlow = (flowId, clientId) => ...
   + const myFlow: TypeSafeFlowFunction<ImagePlugin> = (flowId, clientId) => ...
   ```

2. **Use `as const` for plugins array**:
   ```typescript
   - plugins: [sharpImagePlugin]
   + plugins: [sharpImagePlugin] as const
   ```

3. **Replace `createUploadistaServer` with `createTypeSafeServer`**:
   ```typescript
   - import { createUploadistaServer } from "@uploadista/server";
   + import { createTypeSafeServer } from "@uploadista/server";

   - const server = await createUploadistaServer({
   + const server = await createTypeSafeServer({
   ```

4. **Fix any type errors** (missing plugins, wrong types, etc.)

## Benefits

### Type Safety

- ✅ **Compile-time validation** - Errors caught before runtime
- ✅ **Autocomplete** - IDE suggests available plugin services
- ✅ **Refactoring safety** - Type errors when removing required plugins
- ✅ **Documentation** - Types serve as inline documentation

### Before vs After

| Aspect | Before (Untyped) | After (Type-Safe) |
|--------|------------------|-------------------|
| Plugin validation | Runtime | Compile-time |
| IDE autocomplete | Limited | Full support |
| Error messages | Generic | Specific (shows missing plugins) |
| Refactoring | Risky | Safe |
| Documentation | External | In types |

## Best Practices

1. **Always use `as const`** for plugin arrays to preserve tuple types
2. **Use `defineFlow<T>`** helper for explicit type declarations
3. **Declare requirements at flow level**, not server level
4. **Group flows by plugin requirements** for better organization
5. **Start simple** - Begin with untyped, migrate to typed gradually

## Troubleshooting

### Problem: "Type 'X' does not satisfy constraint 'never'"

**Cause**: Flow requires plugin X, but it's not provided.

**Solution**: Add the missing plugin to the `plugins` array:
```typescript
plugins: [missingPlugin, ...otherPlugins] as const
```

### Problem: "Type instantiation is excessively deep"

**Cause**: Too many plugins or complex plugin combinations.

**Solution**: Use the untyped `createUploadistaServer` for very complex cases, or split into multiple servers.

### Problem: Lost autocomplete for plugin services

**Cause**: Missing `as const` on plugins array.

**Solution**: Always add `as const`:
```typescript
plugins: [plugin1, plugin2] as const
```

### Problem: Type errors in working code

**Cause**: Plugin tuple not properly inferred.

**Solution**: Explicitly annotate the type:
```typescript
import type { ImagePluginLayer, ZipPluginLayer } from "@uploadista/core/flow";

const plugins: readonly [ImagePluginLayer, ZipPluginLayer] = [
  sharpImagePlugin,
  jsZipPlugin,
] as const;
```
