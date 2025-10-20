# Flow Upload - React Hooks & Components

The Flow Upload feature allows you to upload files through Uploadista flows, enabling post-processing like image optimization, video transcoding, and automatic storage.

## Overview

Flow uploads combine the robustness of direct upload with the flexibility of flow-based processing:

1. **Init**: Client starts flow → streaming-input-node creates upload → flow pauses
2. **Upload**: Client uploads chunks **directly** to upload API (efficient, full-featured)
3. **Finalize**: Client notifies flow → flow resumes → processes file through remaining nodes

## Hooks

### `useFlowUpload`

Basic hook for uploading a single file through a flow.

```tsx
import { useUploadClient, useFlowUpload } from "@uploadista/react";

function MyUploadComponent() {
  const client = useUploadClient({
    baseUrl: "http://localhost:4200",
    storageId: "my-storage",
    chunkSize: 5 * 1024 * 1024,
  });

  const flowUpload = useFlowUpload(client, {
    flowConfig: {
      flowId: "image-optimization-flow",
      storageId: "my-storage",
    },
    onSuccess: (result) => {
      console.log("Upload complete:", result);
    },
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) flowUpload.upload(file);
        }}
      />
      {flowUpload.isUploading && (
        <progress value={flowUpload.state.progress} max={100} />
      )}
    </div>
  );
}
```

### `useMultiFlowUpload`

Hook for uploading multiple files through a flow with concurrent upload control.

```tsx
import { useUploadClient, useMultiFlowUpload } from "@uploadista/react";

function BatchUploadComponent() {
  const client = useUploadClient({
    baseUrl: "http://localhost:4200",
    storageId: "my-storage",
    chunkSize: 5 * 1024 * 1024,
  });

  const multiUpload = useMultiFlowUpload(client, {
    flowConfig: {
      flowId: "batch-image-optimization",
      storageId: "my-storage",
    },
    maxConcurrent: 3,
    onComplete: (items) => {
      console.log("All uploads complete:", items);
    },
  });

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            multiUpload.addFiles(e.target.files);
            multiUpload.startUpload();
          }
        }}
      />
      {multiUpload.state.items.map((item) => (
        <div key={item.id}>
          {item.file.name} - {item.progress}%
        </div>
      ))}
    </div>
  );
}
```

## Components

### `FlowUploadZone`

Render-props component for creating custom drag-and-drop upload zones.

```tsx
import { FlowUploadZone } from "@uploadista/react";

function CustomUploadZone() {
  return (
    <FlowUploadZone
      client={client}
      flowConfig={{
        flowId: "my-flow",
        storageId: "my-storage",
      }}
      accept="image/*"
    >
      {({ isDragging, isUploading, state, getRootProps, getInputProps }) => (
        <div {...getRootProps()}>
          <input {...getInputProps()} />
          {isDragging && <p>Drop files here...</p>}
          {isUploading && <progress value={state.progress} max={100} />}
        </div>
      )}
    </FlowUploadZone>
  );
}
```

### `SimpleFlowUploadZone`

Pre-styled upload zone component for quick implementation.

```tsx
import { SimpleFlowUploadZone } from "@uploadista/react";

function QuickUploadZone() {
  return (
    <SimpleFlowUploadZone
      client={client}
      flowConfig={{
        flowId: "my-flow",
        storageId: "my-storage",
      }}
      accept="image/*"
      dragText="Drop your images here"
      idleText="Drag & drop images or click to browse"
      options={{
        onSuccess: (result) => console.log("Uploaded:", result),
      }}
    />
  );
}
```

### `FlowUploadList`

Render-props component for managing multiple file uploads.

```tsx
import { FlowUploadList } from "@uploadista/react";

function CustomUploadList() {
  return (
    <FlowUploadList
      client={client}
      flowConfig={{
        flowId: "batch-flow",
        storageId: "my-storage",
      }}
      options={{ maxConcurrent: 3 }}
    >
      {({ items, addFiles, startUpload, abortUpload, retryUpload }) => (
        <div>
          <input
            type="file"
            multiple
            onChange={(e) => {
              if (e.target.files) {
                addFiles(e.target.files);
                startUpload();
              }
            }}
          />
          {items.map((item) => (
            <div key={item.id}>
              {item.file.name}
              <progress value={item.progress} max={100} />
              {item.status === "error" && (
                <button onClick={() => retryUpload(item.id)}>Retry</button>
              )}
            </div>
          ))}
        </div>
      )}
    </FlowUploadList>
  );
}
```

### `SimpleFlowUploadList`

Pre-styled upload list component with built-in file input.

```tsx
import { SimpleFlowUploadList } from "@uploadista/react";

function QuickUploadList() {
  return (
    <SimpleFlowUploadList
      client={client}
      flowConfig={{
        flowId: "batch-flow",
        storageId: "my-storage",
      }}
      options={{
        maxConcurrent: 3,
        onComplete: (items) => alert(`${items.length} files uploaded!`),
      }}
      accept="image/*"
    />
  );
}
```

## Server-Side Flow Setup

Your server needs to define flows with a streaming-input-node:

```typescript
// Server-side flow definition
import { createFlow } from "@uploadista/core/flow";
import { createInputNode } from "@uploadista/core/flow/nodes/input-node";
import { createImageOptimizeNode } from "@uploadista/core/flow/image-nodes/image-optimize-node";
import { createOutputNode } from "@uploadista/core/flow/output-nodes/output-node";

const imageOptimizationFlow = createFlow({
  flowId: "image-optimization-flow",
  name: "Image Upload & Optimization",
  nodes: [
    createInputNode("upload-node"),
    createImageOptimizeNode("optimize-node", {
      quality: 80,
      format: "webp",
    }),
    createOutputNode("save-node", {
      storageId: "my-storage",
    }),
  ],
  edges: [
    { source: "upload-node", target: "optimize-node" },
    { source: "optimize-node", target: "save-node" },
  ],
});
```

## Benefits

✅ **Efficient**: Chunks upload directly via upload API (not wrapped in flow messages)
✅ **Full-featured**: Supports all upload features (smart chunking, retry, metrics, parallel)
✅ **Flow-integrated**: Flow orchestrates and can post-process files
✅ **Clean separation**: Upload logic in upload layer, flow handles orchestration
✅ **React-friendly**: Hooks and components follow React best practices

## Migration from Regular Upload

If you're currently using `useUpload` and want to add flow-based processing:

**Before (direct upload):**
```tsx
const upload = useUpload(client, {
  onSuccess: (result) => {
    // Manual post-processing needed
    fetch('/api/optimize', { body: result.id });
  },
});
```

**After (flow upload):**
```tsx
const flowUpload = useFlowUpload(client, {
  flowConfig: {
    flowId: "auto-optimize-flow", // Flow handles optimization automatically
    storageId: "my-storage",
  },
  onSuccess: (result) => {
    // File is already optimized by the flow!
  },
});
```

## TypeScript Support

All hooks and components are fully typed:

```typescript
import type {
  FlowUploadState,
  FlowUploadItem,
  UseFlowUploadOptions,
  FlowUploadZoneRenderProps,
} from "@uploadista/react";
```
