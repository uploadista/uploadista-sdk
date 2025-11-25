# Flow Type Registries

The Flow Type Registries provide a centralized system for registering and validating node types in the Uploadista flow engine. It enables type-safe flow result consumption in dynamic client environments by allowing clients to safely cast flow results based on registered node types.

## Overview

The type registry system consists of four main components:

1. **Input Type Registry** - Registry for input node type definitions (external interface)
2. **Output Type Registry** - Registry for output node type definitions (data flow types)
3. **Node Type Definitions** - Schema-based type definitions with metadata
4. **Type Guards** - Runtime type checking and narrowing utilities

### Two Registries Architecture

Uploadista uses separate registries for input and output types:

- **`inputTypeRegistry`** - Defines how external clients interact with input nodes (e.g., `streaming-input-v1` for chunked uploads)
- **`outputTypeRegistry`** - Defines the data shapes that nodes produce and that flow through the system (e.g., `storage-output-v1` for file data)

This separation is important because input nodes have both:
- An **input type** describing their external interface
- An **output type** describing what data they produce

## Why Use the Type Registries?

### Problems They Solve

1. **Type Safety at Runtime** - Validate flow outputs against schemas
2. **Multi-Output Flows** - Safely distinguish between different output types
3. **Client-Side Type Safety** - TypeScript knows what data types to expect
4. **Versioning** - Track type evolution with semantic versioning
5. **Documentation** - Self-documenting type system with descriptions

### Example Scenario

Without type registry:
```typescript
// Unsafe - what type is this?
const result = await flowResult.outputs[0].data;
console.log(result.url); // Could fail at runtime
```

With type registry:
```typescript
// Type-safe - validated at runtime
const result = outputTypeRegistry.validate<UploadFile>(
  'storage-output-v1',
  flowResult.outputs[0].data
);

if (result.success) {
  console.log(result.data.url); // TypeScript knows this is UploadFile
}
```

## Core Concepts

### Output Type Definition

An output type definition includes:

- **id**: Unique identifier with versioning (e.g., `"storage-output-v1"`)
- **schema**: Zod schema for runtime validation
- **version**: Semantic version for tracking evolution
- **description**: Human-readable explanation

```typescript
import { outputTypeRegistry } from '@uploadista/core/flow';
import { z } from 'zod';

const thumbnailSchema = z.object({
  url: z.string().url(),
  width: z.number().positive(),
  height: z.number().positive(),
  format: z.enum(['jpeg', 'png', 'webp']),
});

outputTypeRegistry.register({
  id: 'thumbnail-output-v1',
  schema: thumbnailSchema,
  version: '1.0.0',
  description: 'Thumbnail generation output with dimensions and format',
});
```

### Input Type Definition

Input types define how external clients interact with input nodes:

```typescript
import { inputTypeRegistry } from '@uploadista/core/flow';
import { z } from 'zod';

const webhookInputSchema = z.object({
  payload: z.unknown(),
  headers: z.record(z.string()),
  signature: z.string().optional(),
});

inputTypeRegistry.register({
  id: 'webhook-input-v1',
  schema: webhookInputSchema,
  version: '1.0.0',
  description: 'Webhook-triggered file input',
});
```

### Registry Immutability

Once registered, types cannot be modified or removed. This ensures:
- No runtime surprises from type changes
- Consistent behavior across the application
- Safe caching of type information

## Built-in Types

Uploadista provides built-in types that are auto-registered:

### Input Types

#### `streaming-input-v1`

Input type for streaming file uploads with init/finalize operations.

```typescript
import { STREAMING_INPUT_TYPE_ID } from '@uploadista/core/flow';

// Used automatically by createInputNode()
const inputNode = createInputNode('input-1');
// inputNode has inputTypeId: STREAMING_INPUT_TYPE_ID
```

### Output Types

#### `storage-output-v1`

Output type for nodes that save files to storage backends (S3, Azure, GCS, etc.).

```typescript
import { STORAGE_OUTPUT_TYPE_ID } from '@uploadista/core/flow';

// Used automatically by createStorageNode()
const storageNode = yield* createStorageNode('storage-1');
// storageNode has outputTypeId: STORAGE_OUTPUT_TYPE_ID
```

**Schema**: `UploadFile` (from `@uploadista/core/types`)

#### `ocr-output-v1`

Output type for OCR processing results.

#### `image-description-output-v1`

Output type for AI-generated image descriptions.

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
import { outputTypeRegistry } from '@uploadista/core/flow';

outputTypeRegistry.register({
  id: 'description-output-v1',
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
  outputTypeId: 'description-output-v1', // Link to registered output type
  run: ({ data }) => {
    return Effect.gen(function* () {
      const description = yield* generateDescription(data);
      return completeNodeExecution(description);
    });
  },
});
```

## Registry API

Both `inputTypeRegistry` and `outputTypeRegistry` share the same API:

### `register(definition)`

Register a new node type.

```typescript
outputTypeRegistry.register({
  id: 'webhook-output-v1',
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
const typeDef = outputTypeRegistry.get('storage-output-v1');
if (typeDef) {
  console.log(typeDef.description); // "Storage output node..."
  console.log(typeDef.version);     // "1.0.0"
}
```

**Returns**: `OutputTypeDefinition | undefined` (or `InputTypeDefinition`)

### `list()`

List all registered types.

```typescript
const outputTypes = outputTypeRegistry.list();
console.log('Available output types:');
for (const type of outputTypes) {
  console.log(`- ${type.id}: ${type.description}`);
}
```

**Returns**: `OutputTypeDefinition[]` (or `InputTypeDefinition[]`)

### `validate<T>(typeId, data)`

Validate data against a registered type's schema.

```typescript
const result = outputTypeRegistry.validate<UploadFile>(
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

**Returns**: `OutputValidationResult<T>` (or `InputValidationResult<T>`)

### `has(id)`

Check if a type is registered.

```typescript
if (outputTypeRegistry.has('custom-output-v1')) {
  console.log('Custom output type available');
}
```

**Returns**: `boolean`

### `size()`

Get the total number of registered types.

```typescript
console.log(`Registry contains ${outputTypeRegistry.size()} output types`);
console.log(`Registry contains ${inputTypeRegistry.size()} input types`);
```

**Returns**: `number`

## Type Versioning

Use semantic versioning for type IDs:

```typescript
// Version 1.0.0 - Initial release
outputTypeRegistry.register({
  id: 'thumbnail-output-v1',
  version: '1.0.0',
  // ...
});

// Version 2.0.0 - Breaking change (new required field)
outputTypeRegistry.register({
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

- **Major version** (v1 -> v2): Breaking changes (schema incompatible)
- **Minor version** (v1.0 -> v1.1): Additive changes (optional fields)
- **Patch version** (v1.0.0 -> v1.0.1): Documentation/metadata only

Note: The type ID should only change on major versions. Minor/patch changes keep the same ID.

## Best Practices

### 1. Register Types at App Initialization

```typescript
// src/types/registry.ts
import { outputTypeRegistry } from '@uploadista/core/flow';

export function registerCustomTypes() {
  outputTypeRegistry.register({
    id: 'thumbnail-output-v1',
    // ...
  });

  outputTypeRegistry.register({
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
  outputTypeId: THUMBNAIL_OUTPUT_TYPE_ID,
});
```

### 3. Use Descriptive IDs

```typescript
// Good: Descriptive and versioned
'storage-output-v1'
'thumbnail-generation-output-v1'
'webhook-notification-output-v1'

// Bad: Vague or unversioned
'output1'
'storage'
'node-type-a'
```

### 4. Document Schema Changes

```typescript
outputTypeRegistry.register({
  id: 'metadata-output-v2',
  version: '2.0.0',
  description: 'File metadata extraction output (v2: added blurhash support)',
  schema: metadataSchemaV2,
});
```

### 5. Validate Early

```typescript
// Validate at node creation, not at runtime
const node = yield* createFlowNode({
  outputTypeId: 'custom-output-v1', // Validates type exists
  // ...
});

// This will throw immediately if type doesn't exist
```

## Error Handling

### `INVALID_OUTPUT_TYPE`

Thrown when referencing an unregistered output type.

```typescript
try {
  const node = yield* createFlowNode({
    outputTypeId: 'nonexistent-type',
    // ...
  });
} catch (error) {
  if (error.code === 'INVALID_OUTPUT_TYPE') {
    console.error('Output type not registered:', error.details.typeId);
  }
}
```

### `INVALID_INPUT_TYPE`

Thrown when referencing an unregistered input type.

```typescript
try {
  const node = yield* createFlowNode({
    inputTypeId: 'nonexistent-input-type',
    // ...
  });
} catch (error) {
  if (error.code === 'INVALID_INPUT_TYPE') {
    console.error('Input type not registered:', error.details.typeId);
  }
}
```

### `VALIDATION_ERROR` (Duplicate Registration)

Thrown when attempting to re-register a type.

```typescript
outputTypeRegistry.register({ id: 'my-type-v1', /* ... */ });
outputTypeRegistry.register({ id: 'my-type-v1', /* ... */ }); // Throws!
```

## Advanced Usage

### Custom Validation Logic

While the registry handles schema validation, you can add additional checks:

```typescript
const result = outputTypeRegistry.validate<ThumbnailOutput>(
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
  const outputs = outputTypeRegistry.list();

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
