# Migration Guide: Flexible Flow Execution

This guide covers the changes introduced by the flexible flow execution feature and how to migrate existing code.

## Overview

The flexible flow execution feature enables flows to accept multiple input types beyond file uploads:
- **File/Blob**: Traditional chunked file upload (unchanged)
- **URL strings**: Direct file fetch from external URLs (new)
- **Structured data**: Custom input nodes for non-file data (future)

## Breaking Changes

### None for Existing Users

✅ **Good news**: If you're using `useFlowUpload` or `uploadWithFlow` with File/Blob inputs, your code continues to work without changes.

The changes are **additive** and **backward compatible**:
- `useFlowUpload` hook unchanged
- File upload behavior unchanged
- Existing flow configurations work as-is

### For Advanced Users

If you were directly using internal APIs or custom FlowManager instantiation, note these changes:

1. **FlowManager generic type**: The `TInput` parameter is now more flexible
2. **Input type registry**: New `streaming-input-v1` type registered for input nodes
3. **New APIs**: `useFlowExecution` hook and `client.findInputNode()` helper

## New Features

### 1. URL-Based Flow Execution

**Before** (not possible):
```tsx
// ❌ No way to process images from URLs
const flowUpload = useFlowUpload({ flowConfig: {...} });
// flowUpload.upload() only accepts File/Blob
```

**After** (new capability):
```tsx
// ✅ Process images from URLs using useFlowExecution
const execution = useFlowExecution<string>({
  flowConfig: { flowId: "optimize", storageId: "s3" },
  inputBuilder: async (url) => {
    const { inputNodes } = await client.findInputNode("optimize");
    return {
      [inputNodes[0].id]: {
        operation: "url",
        url,
        metadata: { source: "external" }
      }
    };
  },
  onSuccess: (outputs) => console.log("Done:", outputs)
});

// Execute with URL
await execution.execute("https://example.com/image.jpg");
```

### 2. Generic Input Builder Pattern

**Before** (hardcoded for files):
```tsx
// Only File/Blob inputs supported
const flowUpload = useFlowUpload({ flowConfig: {...} });
await flowUpload.upload(myFile);
```

**After** (flexible input builder):
```tsx
// Support any input type with inputBuilder
const execution = useFlowExecution<CustomInputType>({
  flowConfig: { flowId: "my-flow", storageId: "storage" },
  inputBuilder: async (input) => {
    // Transform input to flow inputs format
    // Auto-discover input nodes
    // Perform validation
    // Return FlowInputs mapping
    return { "node-id": inputData };
  }
});
```

### 3. Auto Input Node Discovery

**Before** (manual node ID lookup):
```tsx
// Had to manually inspect flow to find input node ID
const flow = await client.getFlow("my-flow");
const inputNode = flow.flow.nodes.find(n => n.type === "input");
const inputNodeId = inputNode?.id;
```

**After** (automatic discovery):
```tsx
// Helper method discovers input nodes automatically
const { inputNodes, single } = await client.findInputNode("my-flow");

if (single) {
  // Flow has exactly one input node
  const inputNodeId = inputNodes[0].id;
} else {
  // Multi-input flow, need explicit mapping
  console.log("Input nodes:", inputNodes);
}
```

## Migration Patterns

### Pattern 1: Keep Using `useFlowUpload` (No Migration Needed)

If you're happy with file-only uploads, **no changes required**:

```tsx
// This continues to work exactly as before
const flowUpload = useFlowUpload({
  flowConfig: {
    flowId: "image-optimization",
    storageId: "s3-production"
  },
  onSuccess: (outputs) => console.log("Done:", outputs),
  onError: (error) => console.error("Failed:", error)
});

// Upload files as usual
await flowUpload.upload(myFile);
```

### Pattern 2: Add URL Support to Existing Flows

Enhance your existing flow to support both files and URLs:

```tsx
// Keep the file upload hook
const fileUpload = useFlowUpload({ flowConfig: {...} });

// Add a URL execution hook
const urlExecution = useFlowExecution<string>({
  flowConfig: { ...sameFlowConfig },
  inputBuilder: async (url) => {
    const { inputNodes } = await client.findInputNode(flowConfig.flowId);
    return {
      [inputNodes[0].id]: {
        operation: "url",
        url,
        storageId: flowConfig.storageId,
        metadata: { source: "url" }
      }
    };
  },
  onSuccess: fileUpload.options.onSuccess  // Reuse handlers
});

// Use conditionally
if (mode === "file") {
  await fileUpload.upload(file);
} else {
  await urlExecution.execute(url);
}
```

### Pattern 3: Unified Input Handling

Create a single hook that handles multiple input types:

```tsx
const processor = useFlowExecution<File | string>({
  flowConfig: { flowId: "process", storageId: "s3" },
  inputBuilder: async (input) => {
    const { inputNodes } = await client.findInputNode("process");
    const nodeId = inputNodes[0].id;

    if (typeof input === "string") {
      // URL input
      return {
        [nodeId]: {
          operation: "url",
          url: input,
          storageId: "s3",
          metadata: { source: "url" }
        }
      };
    }

    // File input
    return {
      [nodeId]: {
        operation: "init",
        storageId: "s3",
        metadata: {
          originalName: input.name,
          mimeType: input.type,
          size: input.size
        }
      }
    };
  }
});

// Works with both
await processor.execute(myFile);
await processor.execute("https://example.com/file.jpg");
```

## API Reference

### New Exports

#### `@uploadista/core/flow`
- `STREAMING_INPUT_TYPE_ID`: Type constant for streaming input nodes
- `validateFlowInput()`: Helper to validate input data against registered types
- `isInitOperation()`, `isUrlOperation()`, `isFinalizeOperation()`: Type guards for input operations

#### `@uploadista/client-core`
- `FlowInputs`: Type for flow input mapping (`Record<string, unknown>`)
- `InputNodeDiscovery`: Return type for input node discovery
- `client.findInputNode(flowId)`: Helper to discover input nodes in a flow

#### `@uploadista/client-react`
- `useFlowExecution<TTrigger>`: Generic hook for flexible flow execution
- `InputBuilder<TTrigger>`: Type for input transformation functions
- `UseFlowExecutionOptions<TTrigger, TOutput>`: Options interface
- `UseFlowExecutionReturn<TTrigger>`: Return type interface

### Updated Documentation

#### `FlowManager<TInput>`
Now documented to support generic input types beyond File/Blob:

```typescript
// File input (traditional)
const fileManager = new FlowManager<File>(...);

// URL input (new)
const urlManager = new FlowManager<string>(...);

// Custom structured data (future)
const dataManager = new FlowManager<MyDataType>(...);
```

## TypeScript Changes

### More Flexible Generics

If you have TypeScript code that explicitly types FlowManager:

**Before**:
```typescript
const manager: FlowManager<File> = ...;
```

**After** (still works, but can be more flexible):
```typescript
// Still valid
const manager: FlowManager<File> = ...;

// Now also valid
const urlManager: FlowManager<string> = ...;
const dataManager: FlowManager<CustomType> = ...;
```

### Input Type Validation

Use the new type guards for safer input handling:

```typescript
import { isInitOperation, isUrlOperation } from "@uploadista/core/flow";

function handleInput(input: InputData) {
  if (isInitOperation(input)) {
    // TypeScript knows input has: operation, storageId, metadata
    console.log("Initializing upload to:", input.storageId);
  } else if (isUrlOperation(input)) {
    // TypeScript knows input has: operation, url
    console.log("Fetching from:", input.url);
  }
}
```

## Testing

### Testing URL Flows

```typescript
import { renderHook, act } from "@testing-library/react";
import { useFlowExecution } from "@uploadista/client-react";

test("processes image from URL", async () => {
  const { result } = renderHook(() =>
    useFlowExecution<string>({
      flowConfig: { flowId: "test-flow", storageId: "test" },
      inputBuilder: async (url) => ({
        "input-node": {
          operation: "url",
          url,
          storageId: "test"
        }
      })
    })
  );

  await act(async () => {
    await result.current.execute("https://example.com/image.jpg");
  });

  expect(result.current.state.status).toBe("success");
});
```

## Future Enhancements

This foundation enables future features:

1. **Multi-input flows**: Flows with multiple input nodes receiving different data types
2. **Structured data inputs**: Non-file input nodes for text, JSON, etc.
3. **Hybrid flows**: Combining file uploads, URL fetches, and structured data
4. **Streaming data inputs**: Real-time data processing flows

## Troubleshooting

### "Flow does not have a streaming input node"

**Cause**: Your flow doesn't have an input node of type `"input"`.

**Solution**: Ensure your flow configuration includes at least one input node:

```typescript
const flow = {
  nodes: [
    { id: "input-1", type: "input", data: { name: "File Input" } },
    // ... other nodes
  ],
  edges: [/* ... */]
};
```

### "Expected single input node"

**Cause**: Your flow has multiple input nodes, but code assumes single input.

**Solution**: Check if flow is single-input before auto-mapping:

```typescript
const { inputNodes, single } = await client.findInputNode(flowId);

if (!single) {
  throw new Error(`Flow has ${inputNodes.length} input nodes, expected 1`);
}
```

### "Operation not supported: url"

**Cause**: The server or input node doesn't support URL operations yet.

**Solution**: Verify your input node implementation supports the `url` operation. The built-in streaming input node supports `init`, `finalize`, and `url` operations.

## Getting Help

- **Examples**: See `examples/flexible-flow-execution/` for working code
- **API Docs**: Check JSDoc comments in source files
- **Issues**: Report bugs at [github.com/uploadista/uploadista-sdk/issues](https://github.com/uploadista/uploadista-sdk/issues)
- **Discord**: Join our community for questions and support

## Summary

**For most users**: No migration needed. Your existing code continues to work.

**For power users**: New flexible patterns available via `useFlowExecution` and `client.findInputNode()`.

**Key benefit**: Enable URL-based flows and prepare for future input types without breaking existing functionality.
