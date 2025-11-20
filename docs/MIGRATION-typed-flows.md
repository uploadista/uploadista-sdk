# Migration Guide: Typed Flows

This guide helps you migrate existing Uploadista flows to use the new type registry system introduced in v1.0.

## What Changed?

### Summary of Changes

1. **FlowJob.result** - Now `TypedOutput[]` instead of `unknown`
2. **FlowJobTask.result** - Now `TypedOutput` instead of `unknown`
3. **FlowEventFlowEnd** - Added `outputs: TypedOutput[]` field
4. **FlowUploadState** - Added `flowOutputs: TypedOutput[]` field
5. **FlowUploadCallbacks** - `onFlowComplete` now receives `TypedOutput[]`

### Backward Compatibility

✅ **All existing flows continue to work without changes**

- Nodes without `nodeTypeId` produce untyped results (`nodeType` will be `undefined`)
- Legacy `result` fields are maintained for compatibility
- Client callbacks work with both typed and untyped flows

## Migration Path

You can migrate gradually:

1. ✅ **Phase 1**: No changes needed - everything works as before
2. ✅ **Phase 2**: Start using `onFlowComplete` for new features
3. ✅ **Phase 3**: Adopt type guards for safer code
4. ✅ **Phase 4**: Register custom types for new nodes
5. ✅ **Phase 5**: Fully migrate to typed system

## Server-Side Migration

### Before: Untyped Flow

```typescript
import { createFlow, createInputNode, createStorageNode } from '@uploadista/core/flow';

const flow = createFlow({
  id: 'image-upload',
  nodes: [
    yield* createInputNode('input'),
    yield* createStorageNode('storage'),
  ],
  edges: [
    { source: 'input', target: 'storage' },
  ],
});
```

### After: Typed Flow (Optional)

No changes required! The built-in nodes automatically use registered types:

```typescript
import { createFlow, createInputNode, createStorageNode } from '@uploadista/core/flow';

// Same code - nodes now automatically include type information
const flow = createFlow({
  id: 'image-upload',
  nodes: [
    yield* createInputNode('input'),      
    yield* createStorageNode('storage'),  // Auto-uses: storage-output-v1
  ],
  edges: [
    { source: 'input', target: 'storage' },
  ],
});
```

### Custom Nodes: Before

```typescript
const customNode = yield* createFlowNode({
  id: 'custom',
  type: NodeType.output,
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  run: ({ data }) => {
    // ...
  },
});
```

### Custom Nodes: After (Typed)

```typescript
import { flowTypeRegistry } from '@uploadista/core/flow';

// 1. Register your type (do this once at app startup)
flowTypeRegistry.register({
  id: 'custom-output-v1',
  category: 'output',
  schema: myOutputSchema,
  version: '1.0.0',
  description: 'Custom processing output',
});

// 2. Reference type in node creation
const customNode = yield* createFlowNode({
  id: 'custom',
  type: NodeType.output,
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  nodeTypeId: 'custom-output-v1', // NEW: Link to registered type
  run: ({ data }) => {
    // No changes needed in implementation
  },
});
```

## Client-Side Migration

### Before: Legacy Result Access

```typescript
import { useFlowUpload } from '@uploadista/react';

function UploadComponent() {
  const { state, upload } = useFlowUpload({
    flowConfig: {
      flowId: 'image-upload',
      storageId: 'uploads',
    },
    onSuccess: (result) => {
      // result is the first output's data
      console.log('Uploaded:', result.url);
    },
  });

  return <button onClick={() => upload(file)}>Upload</button>;
}
```

### After: Type-Safe Access (Recommended)

```typescript
import { useFlowUpload } from '@uploadista/react';
import { isStorageOutput } from '@uploadista/core/flow';

function UploadComponent() {
  const { state, upload } = useFlowUpload({
    flowConfig: {
      flowId: 'image-upload',
      storageId: 'uploads',
    },
    onSuccess: (result) => {
      // Still works! Backward compatible
      console.log('Uploaded:', result.url);
    },
    onFlowComplete: (outputs) => {
      // NEW: Access all typed outputs
      for (const output of outputs) {
        if (isStorageOutput(output)) {
          console.log('Storage:', output.data.url);
        }
      }
    },
  });

  // NEW: Access flowOutputs from state
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

## Breaking Changes

### ⚠️ Direct FlowJob.result Access

If you were directly accessing `FlowJob.result`:

#### Before

```typescript
const job = yield* flowServer.getJobStatus(jobId);
if (job.status === 'completed') {
  const result = job.result; // unknown
  // Manual type casting
  const file = result as UploadFile;
}
```

#### After

```typescript
const job = yield* flowServer.getJobStatus(jobId);
if (job.status === 'completed' && job.result) {
  // result is now TypedOutput[]
  const outputs = job.result;

  // Use type guards for safety
  const storageOutput = outputs.find(o => o.nodeType === 'storage-output-v1');
  if (storageOutput) {
    const file = storageOutput.data as UploadFile;
  }
}
```

### ⚠️ Custom FlowEnd Event Handlers

If you have custom handlers for FlowEnd events:

#### Before

```typescript
switch (event.eventType) {
  case EventType.FlowEnd:
    const result = event.result; // unknown
    processResult(result);
    break;
}
```

#### After

```typescript
switch (event.eventType) {
  case EventType.FlowEnd:
    // Use new outputs field
    const outputs = event.outputs || [];
    outputs.forEach(output => {
      console.log(`${output.nodeId}: ${output.nodeType}`);
      processOutput(output);
    });

    // Legacy result field still available for compatibility
    const legacyResult = event.result;
    break;
}
```

## Migration Strategies

### Strategy 1: No Changes (Fully Compatible)

Continue using existing code - everything works as before.

**Pros:**
- Zero migration effort
- No risk of breaking changes

**Cons:**
- Miss out on type safety benefits
- Less safe multi-output flows

### Strategy 2: Adopt onFlowComplete (Recommended)

Add `onFlowComplete` callback while keeping `onSuccess`:

```typescript
const { upload } = useFlowUpload({
  flowConfig: { /* ... */ },
  onSuccess: (result) => {
    // Keep existing behavior
    console.log('Primary result:', result);
  },
  onFlowComplete: (outputs) => {
    // NEW: Add type-safe processing
    processAllOutputs(outputs);
  },
});
```

**Pros:**
- Gradual adoption
- Backward compatible
- Access to all outputs

**Cons:**
- Slightly more code

### Strategy 3: Full Type Guards (Best)

Use type guards throughout:

```typescript
import { isStorageOutput, filterOutputsByType } from '@uploadista/core/flow';

const { state } = useFlowUpload({
  flowConfig: { /* ... */ },
  onFlowComplete: (outputs) => {
    const storage = filterOutputsByType(outputs, isStorageOutput);
    // Fully type-safe
    storage.forEach(s => console.log(s.data.url));
  },
});
```

**Pros:**
- Full type safety
- Best practice
- Future-proof

**Cons:**
- Requires learning type guards
- More upfront work

### Strategy 4: Custom Types (Advanced)

Register custom types for domain-specific nodes:

```typescript
// App initialization
import { flowTypeRegistry } from '@uploadista/core/flow';

export function initializeTypes() {
  flowTypeRegistry.register({
    id: 'thumbnail-output-v1',
    category: 'output',
    schema: thumbnailSchema,
    version: '1.0.0',
    description: 'Thumbnail generation',
  });

  // ... register other custom types
}

// In app startup
initializeTypes();
```

**Pros:**
- Domain-specific type safety
- Better documentation
- Enables advanced features

**Cons:**
- Most setup work
- Requires schema definitions

## Common Migration Issues

### Issue 1: TypeScript Errors on FlowJob.result

**Error:**
```
Type 'unknown' is not assignable to type 'UploadFile'
```

**Solution:**
Use type guards or update to TypedOutput[]:

```typescript
// Before
const file = job.result as UploadFile;

// After - Option 1: Type guard
import { getSingleOutputByType, isStorageOutput } from '@uploadista/core/flow';
const output = getSingleOutputByType(job.result, isStorageOutput);
const file = output.data; // Typed as UploadFile

// After - Option 2: Manual check
if (job.result && job.result.length > 0) {
  const file = job.result[0].data as UploadFile;
}
```

### Issue 2: Missing flowOutputs in State

**Error:**
```
Property 'flowOutputs' does not exist on type 'FlowUploadState'
```

**Solution:**
Update `@uploadista/client-core` dependency:

```bash
pnpm update @uploadista/client-core
```

### Issue 3: onFlowComplete Not Called

**Symptom:**
Callback not firing even though flow completes.

**Solution:**
Check that flow has output nodes:

```typescript
// ❌ No output nodes
const flow = createFlow({
  nodes: [
    yield* createInputNode('input'),
    // Missing output node!
  ],
});

// ✅ Has output node
const flow = createFlow({
  nodes: [
    yield* createInputNode('input'),
    yield* createStorageNode('storage'), // Output node
  ],
  edges: [
    { source: 'input', target: 'storage' },
  ],
});
```

### Issue 4: Type Guard Returns False

**Symptom:**
`isStorageOutput(output)` returns false unexpectedly.

**Solution:**
Check node has nodeTypeId:

```typescript
// Check if node has type information
console.log('Node type:', output.nodeType); // Should be "storage-output-v1"

// If undefined, node wasn't created with nodeTypeId
// Built-in nodes (createStorageNode) automatically include type
```

## Testing Your Migration

### 1. Verify Backward Compatibility

```typescript
// Test existing flow still works
const result = await client.uploadWithFlow(file, {
  flowConfig: {
    flowId: 'existing-flow',
    storageId: 'storage',
  },
});

console.log('Still works:', result);
```

### 2. Test Type Guards

```typescript
import { isStorageOutput } from '@uploadista/core/flow';

// Upload and check outputs
const { state } = useFlowUpload({
  flowConfig: { /* ... */ },
  onFlowComplete: (outputs) => {
    console.log('Outputs received:', outputs.length);

    outputs.forEach(output => {
      console.log({
        nodeId: output.nodeId,
        hasType: !!output.nodeType,
        typeId: output.nodeType,
        isStorage: isStorageOutput(output),
      });
    });
  },
});
```

### 3. Check TypeScript Types

```typescript
import type { TypedOutput } from '@uploadista/core/flow';
import type { UploadFile } from '@uploadista/core/types';

// Should compile without errors
function processOutput(output: TypedOutput<UploadFile>) {
  console.log(output.data.url);
  console.log(output.data.size);
}
```

## Rollback Plan

If you encounter issues, you can safely roll back:

### 1. Remove Type IDs

```typescript
// Remove nodeTypeId from custom nodes
const node = yield* createFlowNode({
  // ... other config
  // nodeTypeId: 'custom-type', // Remove this line
});
```

### 2. Use Legacy Callbacks Only

```typescript
// Remove onFlowComplete
const { upload } = useFlowUpload({
  flowConfig: { /* ... */ },
  onSuccess: (result) => {
    // Keep using legacy callback
  },
  // onFlowComplete: (outputs) => { /* Remove */ },
});
```

### 3. Cast Results

```typescript
// Use type assertions if needed
const file = output.data as UploadFile;
```

## Getting Help

If you encounter migration issues:

1. **Check Documentation**
   - [Type Registry Guide](./type-registry.md)
   - [Typed Flows Guide](./typed-flows.md)

2. **Enable Debug Logging**
   ```typescript
   console.log('Flow outputs:', JSON.stringify(outputs, null, 2));
   ```

3. **Report Issues**
   - GitHub Issues: https://github.com/uploadista/uploadista-sdk/issues
   - Include TypeScript version and package versions

## FAQ

### Q: Do I need to update all my flows at once?

**A:** No! Migrate gradually. Existing flows work without changes.

### Q: Will untyped flows break?

**A:** No. Untyped flows continue to work. They just won't have `nodeType` information.

### Q: Can I mix typed and untyped nodes?

**A:** Yes! Flows can have both typed and untyped nodes.

### Q: What if I don't use TypeScript?

**A:** Type system still provides runtime validation. TypeScript types are optional.

### Q: Do I need to register built-in types?

**A:** No. `streaming-input-v1` and `storage-output-v1` are auto-registered.

### Q: How do I version my custom types?

**A:** Use semantic versioning in the type ID (e.g., `custom-v1`, `custom-v2`).

## Next Steps

After migration:

1. ✅ Review [Type Registry Guide](./type-registry.md)
2. ✅ Explore [Typed Flows Guide](./typed-flows.md)
3. ✅ Add type guards to your code
4. ✅ Register custom types for domain nodes
5. ✅ Update documentation for your team

---

**Need help?** Check our [documentation](./README.md) or [open an issue](https://github.com/uploadista/uploadista-sdk/issues).
