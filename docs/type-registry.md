# Flow Type Registry

The Flow Type Registry provides a centralized system for registering and validating node types in the Uploadista flow engine. It enables type-safe flow result consumption in dynamic client environments by allowing clients to safely cast flow results based on registered node types.

## Overview

The type registry system consists of three main components:

1. **Type Registry** - Central registry for node type definitions with schemas
2. **Node Type Definitions** - Schema-based type definitions with metadata
3. **Type Guards** - Runtime type checking and narrowing utilities

## Why Use the Type Registry?

### Problems It Solves

1. **Type Safety at Runtime** - Validate flow outputs against schemas
2. **Multi-Output Flows** - Safely distinguish between different output types
3. **Client-Side Type Safety** - TypeScript knows what data types to expect
4. **Versioning** - Track type evolution with semantic versioning
5. **Documentation** - Self-documenting type system with descriptions

### Example Scenario

Without type registry:
```typescript
// ❌ Unsafe - what type is this?
const result = await flowResult.outputs[0].data;
console.log(result.url); // Could fail at runtime
```

With type registry:
```typescript
// ✅ Type-safe - validated at runtime
const result = flowTypeRegistry.validate<UploadFile>(
  'storage-output-v1',
  flowResult.outputs[0].data
);

if (result.success) {
  console.log(result.data.url); // TypeScript knows this is UploadFile
}
```

## Core Concepts

### Node Type Definition

A node type definition includes:

- **id**: Unique identifier with versioning (e.g., `"storage-output-v1"`)
- **category**: Whether it's an `"input"` or `"output"` node
- **schema**: Zod schema for runtime validation
- **version**: Semantic version for tracking evolution
- **description**: Human-readable explanation

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';
import { z } from 'zod';

const thumbnailSchema = z.object({
  url: z.string().url(),
  width: z.number().positive(),
  height: z.number().positive(),
  format: z.enum(['jpeg', 'png', 'webp']),
});

flowTypeRegistry.register({
  id: 'thumbnail-output-v1',
  category: 'output',
  schema: thumbnailSchema,
  version: '1.0.0',
  description: 'Thumbnail generation output with dimensions and format',
});
```

### Type Categories

- **`input`** - Nodes that receive data from external sources
- **`output`** - Nodes that produce final results

### Registry Immutability

Once registered, types cannot be modified or removed. This ensures:
- No runtime surprises from type changes
- Consistent behavior across the application
- Safe caching of type information

## Built-in Types

Uploadista provides two built-in types that are auto-registered:

### `streaming-input-v1`

Input type for nodes that accept chunked file uploads.

```typescript
import { STREAMING_INPUT_TYPE_ID } from '@uploadista/core/flow';

// Used automatically by createInputNode()
const inputNode = yield* createInputNode('input-1');
```

**Schema**: `UploadFile` (from `@uploadista/core/types`)

### `storage-output-v1`

Output type for nodes that save files to storage backends (S3, Azure, GCS, etc.).

```typescript
import { STORAGE_OUTPUT_TYPE_ID } from '@uploadista/core/flow';

// Used automatically by createStorageNode()
const storageNode = yield* createStorageNode('storage-1');
```

**Schema**: `UploadFile` (from `@uploadista/core/types`)

## Registering Custom Types

### Step 1: Define Your Schema

```typescript
import { z } from 'zod';

const descriptionSchema = z.object({
  description: z.string().min(1),
  confidence: z.number().min(0).max(1),
  tags: z.array(z.string()).optional(),
  language: z.string().length(2).optional(),
});

type DescriptionOutput = z.infer<typeof descriptionSchema>;
```

### Step 2: Register the Type

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';

flowTypeRegistry.register({
  id: 'description-output-v1',
  category: 'output',
  schema: descriptionSchema,
  version: '1.0.0',
  description: 'AI-generated image description with confidence score',
});
```

### Step 3: Use in Node Factory

```typescript
import { createFlowNode, NodeType } from '@uploadista/core/flow';

const descriptionNode = yield* createFlowNode({
  id: 'describe-image',
  name: 'Describe Image',
  description: 'Generate AI description of image',
  type: NodeType.output,
  inputSchema: uploadFileSchema,
  outputSchema: descriptionSchema,
  nodeTypeId: 'description-output-v1', // Link to registered type
  run: ({ data }) => {
    return Effect.gen(function* () {
      const description = yield* generateDescription(data);
      return completeNodeExecution(description);
    });
  },
});
```

## Registry API

### `register(definition)`

Register a new node type.

```typescript
flowTypeRegistry.register({
  id: 'webhook-output-v1',
  category: 'output',
  schema: z.object({
    statusCode: z.number(),
    response: z.unknown(),
    timestamp: z.string(),
  }),
  version: '1.0.0',
  description: 'HTTP webhook notification output',
});
```

**Throws**: `VALIDATION_ERROR` if type ID already registered

### `get(id)`

Retrieve a registered type definition.

```typescript
const typeDef = flowTypeRegistry.get('storage-output-v1');
if (typeDef) {
  console.log(typeDef.description); // "Storage output node..."
  console.log(typeDef.version);     // "1.0.0"
}
```

**Returns**: `NodeTypeDefinition | undefined`

### `listByCategory(category)`

List all types in a specific category.

```typescript
const outputTypes = flowTypeRegistry.listByCategory('output');
console.log('Available output types:');
for (const type of outputTypes) {
  console.log(`- ${type.id}: ${type.description}`);
}
```

**Returns**: `NodeTypeDefinition[]`

### `validate<T>(typeId, data)`

Validate data against a registered type's schema.

```typescript
const result = flowTypeRegistry.validate<UploadFile>(
  'storage-output-v1',
  unknownData
);

if (result.success) {
  // result.data is typed as UploadFile
  console.log(`File stored at: ${result.data.url}`);
} else {
  console.error(`Validation failed: ${result.error.body}`);
}
```

**Returns**: `ValidationResult<T>` with either data or error

### `has(id)`

Check if a type is registered.

```typescript
if (flowTypeRegistry.has('custom-output-v1')) {
  console.log('Custom output type available');
}
```

**Returns**: `boolean`

### `size()`

Get the total number of registered types.

```typescript
console.log(`Registry contains ${flowTypeRegistry.size()} types`);
```

**Returns**: `number`

## Type Versioning

Use semantic versioning for type IDs:

```typescript
// Version 1.0.0 - Initial release
flowTypeRegistry.register({
  id: 'thumbnail-output-v1',
  version: '1.0.0',
  // ...
});

// Version 2.0.0 - Breaking change (new required field)
flowTypeRegistry.register({
  id: 'thumbnail-output-v2',
  version: '2.0.0',
  schema: z.object({
    // ... existing fields
    blurhash: z.string(), // New required field
  }),
  // ...
});
```

### Versioning Guidelines

- **Major version** (v1 → v2): Breaking changes (schema incompatible)
- **Minor version** (v1.0 → v1.1): Additive changes (optional fields)
- **Patch version** (v1.0.0 → v1.0.1): Documentation/metadata only

⚠️ **Note**: The type ID should only change on major versions. Minor/patch changes keep the same ID.

## Best Practices

### 1. Register Types at App Initialization

```typescript
// src/types/registry.ts
import { flowTypeRegistry } from '@uploadista/core/flow';

export function registerCustomTypes() {
  flowTypeRegistry.register({
    id: 'thumbnail-output-v1',
    // ...
  });

  flowTypeRegistry.register({
    id: 'description-output-v1',
    // ...
  });
}

// src/index.ts
import { registerCustomTypes } from './types/registry';

registerCustomTypes();
// ... rest of app initialization
```

### 2. Export Type ID Constants

```typescript
// src/types/constants.ts
export const THUMBNAIL_OUTPUT_TYPE_ID = 'thumbnail-output-v1';
export const DESCRIPTION_OUTPUT_TYPE_ID = 'description-output-v1';

// Usage
import { THUMBNAIL_OUTPUT_TYPE_ID } from './types/constants';

const node = yield* createFlowNode({
  // ...
  nodeTypeId: THUMBNAIL_OUTPUT_TYPE_ID,
});
```

### 3. Use Descriptive IDs

```typescript
// ✅ Good: Descriptive and versioned
'storage-output-v1'
'thumbnail-generation-output-v1'
'webhook-notification-output-v1'

// ❌ Bad: Vague or unversioned
'output1'
'storage'
'node-type-a'
```

### 4. Document Schema Changes

```typescript
flowTypeRegistry.register({
  id: 'metadata-output-v2',
  version: '2.0.0',
  description: 'File metadata extraction output (v2: added blurhash support)',
  schema: metadataSchemaV2,
  // ...
});
```

### 5. Validate Early

```typescript
// Validate at node creation, not at runtime
const node = yield* createFlowNode({
  nodeTypeId: 'custom-output-v1', // Validates type exists
  // ...
});

// This will throw immediately if type doesn't exist
```

## Error Handling

### `INVALID_NODE_TYPE`

Thrown when referencing an unregistered type.

```typescript
try {
  const node = yield* createFlowNode({
    nodeTypeId: 'nonexistent-type',
    // ...
  });
} catch (error) {
  if (error.code === 'INVALID_NODE_TYPE') {
    console.error('Type not registered:', error.details.typeId);
  }
}
```

### `TYPE_CATEGORY_MISMATCH`

Thrown when type category doesn't match node type.

```typescript
// Register as output
flowTypeRegistry.register({
  id: 'my-type-v1',
  category: 'output',
  // ...
});

// Try to use with input node - will throw
const node = yield* createFlowNode({
  type: NodeType.input, // ❌ Mismatch!
  nodeTypeId: 'my-type-v1',
  // ...
});
```

### `VALIDATION_ERROR` (Duplicate Registration)

Thrown when attempting to re-register a type.

```typescript
flowTypeRegistry.register({ id: 'my-type-v1', /* ... */ });
flowTypeRegistry.register({ id: 'my-type-v1', /* ... */ }); // ❌ Throws!
```

## Advanced Usage

### Custom Validation Logic

While the registry handles schema validation, you can add additional checks:

```typescript
const result = flowTypeRegistry.validate<ThumbnailOutput>(
  'thumbnail-output-v1',
  data
);

if (result.success) {
  // Additional business logic validation
  if (result.data.width < 100) {
    throw new Error('Thumbnail too small');
  }

  // Use the validated data
  processThumbnail(result.data);
}
```

### Runtime Type Discovery

```typescript
function listAvailableOutputs() {
  const outputs = flowTypeRegistry.listByCategory('output');

  return outputs.map(type => ({
    id: type.id,
    name: type.description,
    version: type.version,
  }));
}

// Use in UI to show available output types
const availableTypes = listAvailableOutputs();
```

### Type Guards with Registry

```typescript
import { createTypeGuard } from '@uploadista/core/flow';

const isThumbnail = createTypeGuard<ThumbnailOutput>('thumbnail-output-v1');

// Use in flow result processing
if (isThumbnail(output)) {
  // TypeScript knows output.data is ThumbnailOutput
  console.log(`${output.data.width}x${output.data.height}`);
}
```

## See Also

- [Typed Flows Guide](./typed-flows.md) - Using typed results in flows
- [Type Guards](./type-guards.md) - Runtime type checking utilities
- [Client SDK Integration](./client-sdk.md) - Consuming typed results in clients
