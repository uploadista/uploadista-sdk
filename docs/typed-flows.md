# Typed Flows Guide

Learn how to create and consume flows with type-safe results using the Uploadista type registry system.

## What are Typed Flows?

Typed flows are flow pipelines where output nodes produce results with type information attached. This enables:

- **Runtime validation** of flow outputs
- **Type-safe consumption** in TypeScript clients
- **Multi-output flows** with different types
- **Automatic type narrowing** with type guards

## Quick Start

### Server: Create a Typed Flow

```typescript
import { createFlow, createInputNode, createStorageNode } from '@uploadista/core/flow';

// Create nodes with registered types
const flow = createFlow({
  id: 'image-upload',
  nodes: [
    yield* createInputNode('input'),      
    yield* createStorageNode('storage'),  // Uses storage-output-v1
  ],
  edges: [
    { source: 'input', target: 'storage' },
  ],
});
```

### Client: Consume Typed Results

```typescript
import { useFlowUpload } from '@uploadista/react';
import { isStorageOutput } from '@uploadista/core/flow';

function UploadComponent() {
  const { state, upload } = useFlowUpload({
    flowConfig: {
      flowId: 'image-upload',
      storageId: 'my-storage',
    },
    onFlowComplete: (outputs) => {
      // Type-safe access to all outputs
      for (const output of outputs) {
        console.log(`${output.nodeId}: ${output.nodeType}`);

        if (isStorageOutput(output)) {
          // TypeScript knows output.data is UploadFile
          console.log(`Uploaded to: ${output.data.url}`);
        }
      }
    },
  });

  // Access typed outputs from state
  if (state.flowOutputs) {
    const storageOutputs = state.flowOutputs.filter(isStorageOutput);
    // Use storageOutputs...
  }

  return <button onClick={() => upload(file)}>Upload</button>;
}
```

## TypedOutput Structure

Every output from a typed flow node includes:

```typescript
interface TypedOutput<T = unknown> {
  nodeId: string;      // Node instance ID (e.g., "storage-1")
  nodeType?: string;   // Registered type ID (e.g., "storage-output-v1")
  data: T;             // The actual output data
  timestamp: string;   // ISO 8601 timestamp
}
```

### Example

```typescript
{
  nodeId: "storage-1",
  nodeType: "storage-output-v1",
  data: {
    id: "file-123",
    url: "https://cdn.example.com/image.jpg",
    size: 1024000,
    // ... rest of UploadFile
  },
  timestamp: "2024-01-15T10:30:00Z"
}
```

## Creating Typed Flow Nodes

### Using Built-in Types

```typescript
import { createInputNode, createStorageNode } from '@uploadista/core/flow';


const inputNode = yield* createInputNode('upload');

// Storage node - automatically uses "storage-output-v1"
const storageNode = yield* createStorageNode('save');
```

### Creating Custom Typed Nodes

#### 1. Register Your Type

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';
import { z } from 'zod';

const thumbnailSchema = z.object({
  url: z.string().url(),
  width: z.number(),
  height: z.number(),
  format: z.enum(['jpeg', 'png', 'webp']),
});

flowTypeRegistry.register({
  id: 'thumbnail-output-v1',
  category: 'output',
  schema: thumbnailSchema,
  version: '1.0.0',
  description: 'Generated thumbnail with dimensions',
});
```

#### 2. Create Node with Type ID

```typescript
import { createFlowNode, NodeType } from '@uploadista/core/flow';

const thumbnailNode = yield* createFlowNode({
  id: 'thumbnail',
  name: 'Generate Thumbnail',
  description: 'Creates a 200x200 thumbnail',
  type: NodeType.output,
  inputSchema: uploadFileSchema,
  outputSchema: thumbnailSchema,
  nodeTypeId: 'thumbnail-output-v1', // Links to registered type
  run: ({ data }) => {
    return Effect.gen(function* () {
      const thumbnail = yield* generateThumbnail(data, 200, 200);
      return completeNodeExecution(thumbnail);
    });
  },
});
```

#### 3. Use in Flow

```typescript
const flow = createFlow({
  id: 'multi-size-processor',
  nodes: [
    yield* createInputNode('input'),
    yield* thumbnailNode,
    yield* createStorageNode('full-size'),
  ],
  edges: [
    { source: 'input', target: 'thumbnail' },
    { source: 'input', target: 'full-size' },
  ],
});
```

## Multi-Output Flows

Flows can have multiple output nodes producing different types of results.

### Server: Define Multi-Output Flow

```typescript
import { createFlow } from '@uploadista/core/flow';

const flow = createFlow({
  id: 'image-processor',
  nodes: [
    yield* createInputNode('input'),
    yield* createStorageNode('original'),
    yield* thumbnailNode,
    yield* webpNode,
  ],
  edges: [
    { source: 'input', target: 'original' },
    { source: 'input', target: 'thumbnail' },
    { source: 'input', target: 'webp' },
  ],
});
```

### Client: Access All Outputs

```typescript
onFlowComplete: (outputs) => {
  console.log(`Flow produced ${outputs.length} outputs`);

  // Process each output by type
  for (const output of outputs) {
    switch (output.nodeType) {
      case 'storage-output-v1':
        console.log('Original:', output.data.url);
        break;
      case 'thumbnail-output-v1':
        console.log('Thumbnail:', output.data.url);
        break;
      case 'webp-output-v1':
        console.log('WebP:', output.data.url);
        break;
    }
  }
}
```

### Client: Filter by Type

```typescript
import { filterOutputsByType, createTypeGuard } from '@uploadista/core/flow';

const isThumbnail = createTypeGuard<ThumbnailOutput>('thumbnail-output-v1');

onFlowComplete: (outputs) => {
  // Get only thumbnail outputs
  const thumbnails = filterOutputsByType(outputs, isThumbnail);

  for (const thumb of thumbnails) {
    // TypeScript knows thumb.data is ThumbnailOutput
    displayThumbnail(thumb.data.url, thumb.data.width, thumb.data.height);
  }
}
```

## Type Guards and Automatic Narrowing

The typed flow system provides **two ways** to safely narrow types:

### 1. Automatic Narrowing (Built-in Types) ✨ **Recommended**

Built-in types use discriminated unions for **automatic TypeScript narrowing** - no type guards needed!

```typescript
// ✅ Automatic narrowing for built-in types (80% of use cases)
for (const output of outputs) {
  switch (output.nodeType) {
    case 'storage-output-v1':
      // TypeScript automatically knows output.data is UploadFile!
      console.log(output.data.url);
      console.log(output.data.size);
      console.log(output.data.mimeType);
      break;

 
  }
}
```

**Built-in types with automatic narrowing:**
- `storage-output-v1` - Storage node outputs (UploadFile)

This provides the **best developer experience** for common cases with zero boilerplate.

### 2. Type Guards (Custom Types)

Custom types require type guards for type narrowing

```typescript
import { createTypeGuard } from '@uploadista/core/flow';

type ThumbnailOutput = {
  url: string;
  width: number;
  height: number;
  format: 'jpeg' | 'png' | 'webp';
};

const isThumbnail = createTypeGuard<ThumbnailOutput>('thumbnail-output-v1');

// Use in flow result processing
if (isThumbnail(output)) {
  // output.data is now ThumbnailOutput
  console.log(`${output.data.width}x${output.data.height}`);
}
```

### Helper Functions

#### `filterOutputsByType<T>()`

Filter outputs array by type.

```typescript
import { filterOutputsByType, isStorageOutput } from '@uploadista/core/flow';

const storageOutputs = filterOutputsByType(
  state.flowOutputs,
  isStorageOutput
);
// storageOutputs is TypedOutput<UploadFile>[]
```

#### `getSingleOutputByType<T>()`

Get exactly one output of a type (throws if 0 or multiple).

```typescript
import { getSingleOutputByType, isStorageOutput } from '@uploadista/core/flow';

try {
  const storage = getSingleOutputByType(state.flowOutputs, isStorageOutput);
  // storage is TypedOutput<UploadFile>
  console.log(storage.data.url);
} catch (error) {
  if (error.code === 'OUTPUT_NOT_FOUND') {
    console.error('No storage output found');
  } else if (error.code === 'MULTIPLE_OUTPUTS_FOUND') {
    console.error('Multiple storage outputs, expected one');
  }
}
```

#### `getFirstOutputByType<T>()`

Get first output of a type (returns undefined if none).

```typescript
import { getFirstOutputByType, isStorageOutput } from '@uploadista/core/flow';

const storage = getFirstOutputByType(state.flowOutputs, isStorageOutput);

if (storage) {
  console.log('Found storage output:', storage.data.url);
} else {
  console.log('No storage output');
}
```

#### `getOutputByNodeId()`

Get output by specific node ID.

```typescript
import { getOutputByNodeId } from '@uploadista/core/flow';

const thumbnailOutput = getOutputByNodeId(state.flowOutputs, 'thumbnail-node');
if (thumbnailOutput) {
  console.log('Thumbnail:', thumbnailOutput.data);
}
```

#### `hasOutputOfType<T>()`

Check if any output matches a type.

```typescript
import { hasOutputOfType, isStorageOutput } from '@uploadista/core/flow';

if (hasOutputOfType(state.flowOutputs, isStorageOutput)) {
  console.log('Flow produced at least one storage output');
}
```

## Client Integration

### React Hook

```typescript
import { useFlowUpload } from '@uploadista/react';
import { isStorageOutput } from '@uploadista/core/flow';
import type { UploadFile } from '@uploadista/core/types';

function ImageUploader() {
  const { state, upload } = useFlowUpload<UploadFile>({
    flowConfig: {
      flowId: 'image-pipeline',
      storageId: 'images',
    },
    onFlowComplete: (outputs) => {
      // Access all typed outputs
      console.log('Flow complete with outputs:', outputs);
    },
    onSuccess: (result) => {
      // Single output (first or specified by outputNodeId)
      console.log('Main result:', result.url);
    },
  });

  // Access flowOutputs from state
  const storageOutputs = state.flowOutputs?.filter(isStorageOutput) || [];

  return (
    <div>
      <button onClick={() => upload(file)}>Upload</button>
      {storageOutputs.map((output, i) => (
        <img key={i} src={output.data.url} alt={`Output ${i}`} />
      ))}
    </div>
  );
}
```

### Filtering by Output Node

When flows have multiple outputs, specify which one to use for `onSuccess`:

```typescript
const { state, upload } = useFlowUpload({
  flowConfig: {
    flowId: 'multi-format-processor',
    storageId: 'images',
    outputNodeId: 'webp-output', // Use WebP version for onSuccess
  },
  onSuccess: (webpResult) => {
    // webpResult is from 'webp-output' node
    console.log('WebP version:', webpResult.url);
  },
  onFlowComplete: (outputs) => {
    // Still get all outputs here
    console.log(`All ${outputs.length} outputs:`, outputs);
  },
});
```

### Vue Composable

```typescript
import { useFlowUpload } from '@uploadista/vue';
import { isStorageOutput } from '@uploadista/core/flow';

export default {
  setup() {
    const { state, upload } = useFlowUpload({
      flowConfig: {
        flowId: 'image-upload',
        storageId: 'uploads',
      },
      onFlowComplete: (outputs) => {
        const storageOutputs = outputs.filter(isStorageOutput);
        console.log('Storage outputs:', storageOutputs);
      },
    });

    return { state, upload };
  },
};
```

### React Native

```typescript
import { useFlowUpload } from '@uploadista/react-native-core';
import { filterOutputsByType, isStorageOutput } from '@uploadista/core/flow';

function UploadScreen() {
  const { state, upload } = useFlowUpload({
    flowConfig: {
      flowId: 'mobile-upload',
      storageId: 'photos',
    },
    onFlowComplete: (outputs) => {
      const files = filterOutputsByType(outputs, isStorageOutput);
      // Update UI with uploaded files
      setUploadedFiles(files.map(o => o.data));
    },
  });

  // Rest of component...
}
```

## Advanced Patterns

### Conditional Type Processing

```typescript
onFlowComplete: (outputs) => {
  for (const output of outputs) {
    // Process based on type
    if (output.nodeType === 'thumbnail-output-v1') {
      saveThumbnail(output.data);
    } else if (output.nodeType === 'storage-output-v1') {
      saveOriginal(output.data);
    } else if (output.nodeType) {
      // Has type but unknown
      console.warn('Unknown output type:', output.nodeType);
    } else {
      // No type information (legacy node)
      console.log('Untyped output from:', output.nodeId);
    }
  }
}
```

### Type-Safe Result Mapping

```typescript
import { TypedOutput } from '@uploadista/core/flow';

type ImageVariant = {
  nodeId: string;
  url: string;
  width: number;
  height: number;
};

function extractImageVariants(outputs: TypedOutput[]): ImageVariant[] {
  return outputs
    .filter(o => o.nodeType?.includes('image'))
    .map(output => ({
      nodeId: output.nodeId,
      url: (output.data as any).url,
      width: (output.data as any).width,
      height: (output.data as any).height,
    }));
}
```

### Progressive Enhancement

Support both typed and untyped flows:

```typescript
onFlowComplete: (outputs) => {
  // Try to use type information if available
  const typedOutputs = outputs.filter(o => o.nodeType);
  const untypedOutputs = outputs.filter(o => !o.nodeType);

  if (typedOutputs.length > 0) {
    // Use type guards for safety
    processTypedOutputs(typedOutputs);
  }

  if (untypedOutputs.length > 0) {
    // Fallback for legacy nodes
    processUntypedOutputs(untypedOutputs);
  }
}
```

## Validation Best Practices

### 1. Validate Early

```typescript
// ✅ Good: Validate in node creation
const node = yield* createFlowNode({
  nodeTypeId: 'my-output-v1', // Validates immediately
  // ...
});

// ❌ Bad: Hope it works at runtime
const node = yield* createFlowNode({
  // No type ID, no validation
});
```

### 2. Handle Validation Errors

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';

const result = flowTypeRegistry.validate('storage-output-v1', data);

if (!result.success) {
  console.error('Validation failed:', result.error.body);
  console.error('Details:', result.error.details);
  // Handle error appropriately
  return;
}

// Safe to use result.data
processFile(result.data);
```

### 3. Use TypeScript Generics

```typescript
import type { TypedOutput } from '@uploadista/core/flow';

// ✅ Good: Type-safe function
function processStorageOutput(output: TypedOutput<UploadFile>) {
  console.log(output.data.url); // TypeScript knows this exists
}

// ❌ Bad: Loses type safety
function processOutput(output: TypedOutput) {
  console.log((output.data as any).url); // Type cast needed
}
```

## Debugging Tips

### Check Available Types

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';

// List all registered types
console.log('Registered types:', flowTypeRegistry.size());

// List output types
const outputs = flowTypeRegistry.listByCategory('output');
console.log('Output types:', outputs.map(t => t.id));
```

### Inspect Flow Results

```typescript
onFlowComplete: (outputs) => {
  console.log('Flow outputs:', JSON.stringify(outputs, null, 2));

  // Check for type information
  outputs.forEach(output => {
    console.log(`${output.nodeId}:`, {
      hasType: !!output.nodeType,
      type: output.nodeType || 'untyped',
      dataKeys: Object.keys(output.data),
    });
  });
}
```

### Validate Against Schema

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';

// Manually validate to debug schema issues
const result = flowTypeRegistry.validate('my-type-v1', data);

if (!result.success) {
  console.error('Schema validation failed:');
  console.error('Error:', result.error);
  console.error('Data:', data);
}
```

## Recommended Approach: Hybrid Pattern

For maximum developer experience, use **automatic narrowing for built-in types** and **type guards for custom types**:

```typescript
onFlowComplete: (outputs) => {
  for (const output of outputs) {
    // ✅ Step 1: Automatic narrowing for built-in types
    switch (output.nodeType) {
      case 'storage-output-v1':
        // No type guard needed!
        console.log('Storage:', output.data.url);
        saveToDatabase(output.data);
        break;

      case 'streaming-input-v1':
        // No type guard needed!
        console.log('Input:', output.data.name);
        break;

      default:
        // ✅ Step 2: Type guards for custom types
        if (isThumbnailOutput(output)) {
          console.log('Thumbnail:', `${output.data.width}x${output.data.height}`);
        } else if (isDescriptionOutput(output)) {
          console.log('Description:', output.data.description);
        } else if (output.nodeType) {
          console.warn('Unknown type:', output.nodeType);
        }
    }
  }
}
```

**Benefits:**
- Zero boilerplate for built-in types (80% of cases)
- Type-safe custom types when needed
- Clear separation between automatic and manual narrowing
- Best performance (switch is optimized by JS engines)

## Common Patterns

### Gallery with Multiple Sizes

```typescript
const { state } = useFlowUpload({
  flowConfig: {
    flowId: 'image-gallery',
    storageId: 'photos',
  },
  onFlowComplete: (outputs) => {
    const gallery = {
      original: getFirstOutputByType(outputs, isOriginalImage),
      thumbnail: getFirstOutputByType(outputs, isThumbnail),
      webp: getFirstOutputByType(outputs, isWebP),
    };

    updateGallery(gallery);
  },
});
```

### Progress Tracking by Type

```typescript
const [progress, setProgress] = useState({
  thumbnail: false,
  fullSize: false,
  webp: false,
});

onFlowComplete: (outputs) => {
  setProgress({
    thumbnail: hasOutputOfType(outputs, isThumbnail),
    fullSize: hasOutputOfType(outputs, isStorageOutput),
    webp: hasOutputOfType(outputs, isWebP),
  });
}
```

## See Also

- [Type Registry Guide](./type-registry.md) - Registering and managing types
- [Client SDK Documentation](./client-sdk.md) - Client integration details
- [Flow Engine Guide](./flow-engine.md) - Creating and running flows
