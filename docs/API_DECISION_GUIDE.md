# API Decision Guide

This guide helps you choose the right API when working with Uploadista SDK's type system, flows, and server configurations.

## Quick Reference

```
┌─────────────────────────────────────────────────────────────┐
│                    DECISION TREE                            │
└─────────────────────────────────────────────────────────────┘

Creating a Flow?
├─ Need type-safe inputs/outputs? → Use createFlow()
└─ Flexible schema? → Use createFlowWithSchema()

Creating a Server?
└─ → Use createUploadistaServer()
    ├─ Want compile-time validation? → Use ValidatePlugins type utility
    └─ Runtime validation only? → Just pass plugins array

Need Type Utilities?
├─ Extract from Flow → ExtractFlowPluginRequirements
├─ Extract from Layers → ExtractLayerServices
├─ Extract from Effect → ExtractEffectRequirements
├─ Validate plugins → ValidatePlugins
└─ Infer from function → InferFlowRequirements
```

## Flow Creation APIs

### `createFlow()` - Type-Safe Flow

**When to use**:
- ✅ You want TypeScript to infer input/output types from nodes
- ✅ You want compile-time type checking for node connections
- ✅ You're defining flows with a known set of nodes
- ✅ You want IDE autocomplete for inputs/outputs

**When NOT to use**:
- ❌ You need to build flows dynamically at runtime
- ❌ Node types aren't known at compile time
- ❌ You need maximum flexibility

**Type signature**:
```typescript
function createFlow<TNodes extends NodeDefinitionsRecord>(
  config: TypedFlowConfig<TNodes>
): Effect.Effect<
  TypedFlow<TNodes, ...>,
  Error,
  FlowRequirements<TNodes>
>
```

**Example**:
```typescript
import { createFlow } from '@uploadista/core';
import { fileInputNode, imageResizeNode, s3OutputNode } from './nodes';

const myFlow = createFlow({
  flowId: 'image-processing',
  name: 'Image Processing Flow',
  nodes: {
    input: fileInputNode,      // TypeScript knows this is an input node
    resize: imageResizeNode,    // Requires ImagePlugin
    output: s3OutputNode,       // TypeScript knows this is an output node
  },
  edges: [
    { source: 'input', target: 'resize' },    // Type-checked connections
    { source: 'resize', target: 'output' },
  ],
});

// TypeScript infers:
// - Input types from fileInputNode.inputSchema
// - Output types from s3OutputNode.outputSchema
// - Requirements: ImagePlugin (from imageResizeNode)

// Usage with full type safety:
const result = yield* myFlow.run({
  inputs: {
    input: { file: uploadedFile }  // Autocomplete for 'input' key!
  },
  storageId: 'user-123',
  jobId: 'job-456'
});

// Result has typed outputs:
result.outputs.output // Autocomplete for 'output' key!
```

**Benefits**:
- 🎯 **Type inference**: Input/output types inferred from nodes
- 🔒 **Type safety**: Connections validated at compile time
- 🚀 **IDE support**: Full autocomplete for inputs/outputs
- 📝 **Self-documenting**: Types serve as documentation

### `createFlowWithSchema()` - Flexible Flow

**When to use**:
- ✅ Building flows dynamically at runtime
- ✅ Need maximum flexibility
- ✅ Nodes come from various sources
- ✅ Schema is defined separately from nodes

**When NOT to use**:
- ❌ You want TypeScript to infer types from nodes
- ❌ You want compile-time validation of connections

**Type signature**:
```typescript
function createFlowWithSchema<
  TInputSchema extends z.ZodSchema,
  TOutputSchema extends z.ZodSchema
>(
  config: FlowConfig<TInputSchema, TOutputSchema>
): Effect.Effect<
  Flow<TInputSchema, TOutputSchema, any>,
  Error,
  any
>
```

**Example**:
```typescript
import { createFlowWithSchema } from '@uploadista/core';
import { z } from 'zod';

const myFlow = createFlowWithSchema({
  flowId: 'dynamic-flow',
  name: 'Dynamic Processing Flow',
  nodes: [
    fileInputNode,
    imageResizeNode,
    s3OutputNode,
  ],
  edges: [
    { source: fileInputNode.id, target: imageResizeNode.id },
    { source: imageResizeNode.id, target: s3OutputNode.id },
  ],
  inputSchema: z.object({
    file: z.instanceof(File),
  }),
  outputSchema: z.object({
    url: z.string(),
  }),
});

// Schema defined explicitly, not inferred
```

**Benefits**:
- 🔧 **Flexible**: Works with any node configuration
- 🏗️ **Dynamic**: Build flows at runtime
- 📦 **Simple**: No complex type inference
- 🎛️ **Control**: Explicit schema definition

**Trade-offs**:
- ⚠️ No type inference from nodes
- ⚠️ Less compile-time safety
- ⚠️ Manual schema definition required

## Server Creation API

### `createUploadistaServer()` - Single Unified API

**When to use**: Always! This is the only server API you need.

**Type signature**:
```typescript
function createUploadistaServer<
  TContext,
  TResponse,
  TWebSocketHandler,
  TFlowFn extends FlowFunction,
  TPlugins extends readonly PluginLayer[]
>(
  config: UploadistaServerConfig<...>
): Promise<UploadistaServer<...>>
```

### Approach 1: Runtime Validation Only (Recommended for Most Cases)

**When to use**:
- ✅ You trust the runtime validation
- ✅ You want fast development iteration
- ✅ Error messages at server startup are acceptable
- ✅ You're prototyping or testing

**Example**:
```typescript
import { createUploadistaServer } from '@uploadista/server';
import { sharpImagePlugin } from '@uploadista/flow-images-sharp';
import { zipPlugin } from '@uploadista/flow-utility-zipjs';

const server = await createUploadistaServer({
  flows: getFlowById,
  plugins: [sharpImagePlugin, zipPlugin],  // Runtime validation ensures these match
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  adapter: honoAdapter({ /* ... */ }),
});

// If plugins don't match flow requirements, you get a clear error:
// ❌ UploadistaError: MISSING_PLUGIN_DEPENDENCIES
//    Required: ImagePlugin, ZipPlugin
//    Provided: ImagePlugin
//    Missing:  ZipPlugin
```

**Benefits**:
- ✅ Simple and straightforward
- ✅ Excellent runtime error messages
- ✅ No additional type complexity
- ✅ Works for all plugin combinations

### Approach 2: Compile-Time Validation (Optional)

**When to use**:
- ✅ You want IDE feedback before running
- ✅ You're working on a large team
- ✅ You want to catch errors during development
- ✅ Your flows have stable, known requirements

**Example**:
```typescript
import { createUploadistaServer } from '@uploadista/server';
import {
  ValidatePlugins,
  ExtractFlowPluginRequirements,
} from '@uploadista/server/core/plugin-types';
import { sharpImagePlugin } from '@uploadista/flow-images-sharp';
import { zipPlugin } from '@uploadista/flow-utility-zipjs';

// Extract requirements from your flows
type FlowRequirements = ExtractFlowPluginRequirements<typeof getFlowById>;

// Define your plugins
const plugins = [sharpImagePlugin, zipPlugin] as const;

// Optional: Validate at compile time
type Validation = ValidatePlugins<typeof plugins, FlowRequirements>;
// If plugins are missing, TypeScript shows error object in IDE:
// {
//   __error: "Missing required plugins";
//   __required: ImagePlugin | ZipPlugin;
//   __provided: ImagePlugin;
//   __missing: ZipPlugin;
// }

// Create server (runtime validation still runs)
const server = await createUploadistaServer({
  flows: getFlowById,
  plugins,
  dataStore: s3DataStore,
  kvStore: redisKvStore,
  adapter: honoAdapter({ /* ... */ }),
});
```

**Benefits**:
- ✅ IDE shows errors during development
- ✅ Catch issues before running server
- ✅ Team members see type errors in pull requests
- ✅ Self-documenting plugin requirements

**Trade-offs**:
- ⚠️ More verbose code
- ⚠️ Requires understanding type utilities
- ⚠️ Still need runtime validation (dynamic flows)

### Why One Server API?

**Design Philosophy**:
- Effect-TS handles dynamic dependency injection
- Type casting is intentional and safe (Effect's design)
- Runtime validation provides excellent errors
- Multiple server tiers create unnecessary complexity
- Optional compile-time validation via type utilities

**The type casting in server code is NOT a bug**:
```typescript
const serverLayer = Layer.mergeAll(
  uploadServerLayer,
  flowServerLayer,
  ...plugins,
) as Layer.Layer<any, never, never>;
```

**Why it's safe**:
1. Plugin requirements are dynamic (different per flow)
2. TypeScript can't statically verify all combinations
3. Effect resolves requirements at runtime
4. Runtime validation catches missing plugins
5. This is Effect's idiomatic pattern

## Type Utility APIs

### Extraction Utilities

#### `ExtractFlowPluginRequirements<T>` - Extract from Flow Function

**When to use**:
- ✅ You have a flow function and need its requirements
- ✅ You want to validate plugins match flow needs

**Example**:
```typescript
import { ExtractFlowPluginRequirements } from '@uploadista/server/core/plugin-types';

const myFlow = (flowId: string, clientId: string | null) =>
  Effect.succeed(createFlow({ /* ... requires ImagePlugin */ }));

type Requirements = ExtractFlowPluginRequirements<typeof myFlow>;
// Requirements = ImagePlugin
```

#### `ExtractLayerServices<T>` - Extract from Layer Tuple

**When to use**:
- ✅ You have a tuple of layers and need to know what they provide
- ✅ You're building generic plugin validation

**Example**:
```typescript
import { ExtractLayerServices } from '@uploadista/core/flow/types';

const plugins = [sharpImagePlugin, zipPlugin] as const;

type ProvidedServices = ExtractLayerServices<typeof plugins>;
// ProvidedServices = ImagePlugin | ZipPlugin
```

#### `ExtractEffectRequirements<T>` - Extract from Effect

**When to use**:
- ✅ You have an Effect and need to know its dependencies
- ✅ You're building custom type utilities

**Example**:
```typescript
import { ExtractEffectRequirements } from '@uploadista/core/flow/types';

type MyEffect = Effect.Effect<string, Error, Database | Logger>;

type Requirements = ExtractEffectRequirements<MyEffect>;
// Requirements = Database | Logger
```

### Validation Utilities

#### `ValidatePlugins<TPlugins, TRequirements>` - Compile-Time Validation

**When to use**:
- ✅ You want IDE feedback on plugin configuration
- ✅ You're setting up server with known requirements
- ✅ You want to document what plugins are needed

**Example**:
```typescript
import { ValidatePlugins } from '@uploadista/server/core/plugin-types';

// ✅ Valid configuration
type Valid = ValidatePlugins<
  [ImagePluginLayer, ZipPluginLayer],
  ImagePlugin | ZipPlugin
>;
// Result: true

// ❌ Invalid configuration
type Invalid = ValidatePlugins<
  [ImagePluginLayer],
  ImagePlugin | ZipPlugin
>;
// Result: {
//   __error: "Missing required plugins";
//   __required: ImagePlugin | ZipPlugin;
//   __provided: ImagePlugin;
//   __missing: ZipPlugin;
// }
```

### Inference Utilities

#### `InferFlowRequirements<T>` - Infer from Type-Safe Function

**When to use**:
- ✅ You have a `TypeSafeFlowFunction` and need its requirements
- ✅ You're building generic type utilities

**Example**:
```typescript
import { InferFlowRequirements, TypeSafeFlowFunction } from '@uploadista/server/core/plugin-types';

const myFlow: TypeSafeFlowFunction<ImagePlugin | ZipPlugin> = (flowId, clientId) => {
  // ...
};

type Requirements = InferFlowRequirements<typeof myFlow>;
// Requirements = ImagePlugin | ZipPlugin
```

## Common Patterns

### Pattern 1: Server with Compile-Time Validation

```typescript
import { createUploadistaServer, ValidatePlugins, ExtractFlowPluginRequirements } from '@uploadista/server';

// 1. Define your flows
const getFlowById = (flowId: string, clientId: string | null) => {
  // Returns flows that require ImagePlugin | ZipPlugin
};

// 2. Extract requirements
type Requirements = ExtractFlowPluginRequirements<typeof getFlowById>;

// 3. Define plugins
const plugins = [sharpImagePlugin, zipPlugin] as const;

// 4. Validate (optional, for IDE feedback)
type Validation = ValidatePlugins<typeof plugins, Requirements>;

// 5. Create server
const server = await createUploadistaServer({
  flows: getFlowById,
  plugins,
  // ...
});
```

### Pattern 2: Type-Safe Flow with Inferred Types

```typescript
import { createFlow } from '@uploadista/core';

// 1. Define nodes with proper types
const nodes = {
  input: fileInputNode,      // inputSchema: z.object({ file: z.instanceof(File) })
  resize: imageResizeNode,   // requires ImagePlugin
  output: s3OutputNode,      // outputSchema: z.object({ url: z.string() })
};

// 2. Create flow
const flow = createFlow({
  flowId: 'my-flow',
  name: 'My Flow',
  nodes,
  edges: [/* ... */],
});

// 3. TypeScript infers:
// - FlowInputMap<typeof nodes> = { input: { file: File } }
// - FlowOutputMap<typeof nodes> = { output: { url: string } }
// - FlowRequirements<typeof nodes> = ImagePlugin | UploadServer
// - FlowPluginRequirements<typeof nodes> = ImagePlugin
```

### Pattern 3: Generic Plugin Validator

```typescript
import {
  ExtractFlowPluginRequirements,
  ExtractLayerServices,
  ValidatePlugins,
} from '@uploadista/server';

function createValidatedServer<
  TFlowFn extends FlowFunction,
  TPlugins extends readonly PluginLayer[]
>(
  flows: TFlowFn,
  plugins: TPlugins,
  // Use ValidatePlugins to ensure plugins match requirements
  _validation: ValidatePlugins<
    TPlugins,
    ExtractFlowPluginRequirements<TFlowFn>
  > extends true
    ? true
    : never
) {
  return createUploadistaServer({
    flows,
    plugins,
    // ...
  });
}

// ✅ Compiles
createValidatedServer(
  myFlowFunction,
  [imagePlugin, zipPlugin],
  true  // validation passes
);

// ❌ Type error
createValidatedServer(
  myFlowFunction,
  [imagePlugin],  // missing zipPlugin
  true  // validation fails, type error
);
```

## Decision Matrix

| Scenario | Recommended API | Type Utilities Needed? |
|----------|----------------|------------------------|
| Creating type-safe flow | `createFlow()` | No |
| Creating flexible flow | `createFlowWithSchema()` | No |
| Server for development | `createUploadistaServer()` | No |
| Server for production | `createUploadistaServer()` | Optional: `ValidatePlugins` |
| Extract flow requirements | N/A | Yes: `ExtractFlowPluginRequirements` |
| Extract plugin services | N/A | Yes: `ExtractLayerServices` |
| Validate plugin config | N/A | Yes: `ValidatePlugins` |
| Build custom validators | N/A | Yes: Multiple utilities |

## Performance Considerations

### Compile Time

- ✅ **Fast**: Runtime-only validation
- ⚠️ **Slower**: Compile-time validation with complex type utilities
- ⚠️ **Slowest**: Deep type inference with many nodes/plugins

**Tip**: Use compile-time validation selectively in critical paths.

### Runtime

- All approaches have similar runtime performance
- Runtime validation adds ~1-5ms at server startup
- No performance difference during request handling

## Migration from Deprecated APIs

### From `LayerSuccessUnion` to `ExtractLayerServices`

```typescript
// ❌ Old (deprecated)
import { LayerSuccessUnion } from '@uploadista/server/plugins-typing';
type Services = LayerSuccessUnion<[ImagePluginLayer, ZipPluginLayer]>;

// ✅ New
import { ExtractLayerServices } from '@uploadista/core/flow/types';
type Services = ExtractLayerServices<[ImagePluginLayer, ZipPluginLayer]>;
```

### From `FlowRequirementsOf` to `ExtractFlowPluginRequirements`

```typescript
// ❌ Old (deprecated)
import { FlowRequirementsOf } from '@uploadista/server/plugins-typing';
type Requirements = FlowRequirementsOf<typeof myFlow>;

// ✅ New
import { ExtractFlowPluginRequirements } from '@uploadista/server/core/plugin-types';
type Requirements = ExtractFlowPluginRequirements<typeof myFlow>;
```

### From `PluginAssertion` to `ValidatePlugins`

```typescript
// ❌ Old (deprecated)
import { PluginAssertion } from '@uploadista/server/plugins-typing';
type Validation = PluginAssertion<typeof myFlow, typeof plugins>;

// ✅ New
import { ValidatePlugins, ExtractFlowPluginRequirements } from '@uploadista/server/core/plugin-types';
type Requirements = ExtractFlowPluginRequirements<typeof myFlow>;
type Validation = ValidatePlugins<typeof plugins, Requirements>;
```

## Summary

### For Most Users

- **Flows**: Use `createFlow()` for type safety
- **Server**: Use `createUploadistaServer()` with runtime validation only
- **Type utilities**: Don't worry about them unless you need compile-time validation

### For Advanced Users

- **Type utilities**: Use `ExtractFlowPluginRequirements` and `ValidatePlugins` for compile-time safety
- **Custom validators**: Build with extraction and validation utilities
- **Generic functions**: Leverage type utilities for reusable patterns

### Key Takeaway

> Start simple with runtime validation. Add compile-time validation when you need IDE feedback or team-wide safety. The type system is there to help, not to get in your way.

## Further Reading

- [Type Naming Conventions](./TYPE_NAMING_CONVENTIONS.md)
- [Effect-TS Context Management](https://effect.website/docs/guides/context-management)
- [Uploadista Core Documentation](../packages/core/README.md)
- [Uploadista Server Documentation](../packages/servers/server/README.md)
