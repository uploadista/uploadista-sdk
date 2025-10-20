# @uploadista/react

React hooks and components for the Uploadista unified client. Provides a complete solution for file uploads and flow execution with WebSocket support, progress tracking, and comprehensive state management.

## Installation

```bash
pnpm add @uploadista/react @uploadista/client @uploadista/core
```

## Features

- **Upload Management**: Single and multi-file upload with progress tracking
- **Flow Execution**: Execute processing flows with real-time WebSocket updates
- **Drag & Drop**: Built-in drag-and-drop support with file validation
- **State Management**: Comprehensive state management for uploads and flows
- **Performance Metrics**: Track upload performance, speed, and network conditions
- **TypeScript**: Full TypeScript support with type inference

## Quick Start

### Upload Provider Setup

Wrap your app with the `UploadProvider` to provide upload client configuration:

```tsx
import { UploadProvider } from '@uploadista/react';

function App() {
  return (
    <UploadProvider
      baseUrl="https://api.example.com"
      storageId="my-storage"
      chunkSize={1024 * 1024} // 1MB chunks
      storeFingerprintForResuming={true}
      onEvent={(event) => {
        console.log('Upload event:', event);
      }}
    >
      <YourApp />
    </UploadProvider>
  );
}
```

### Single File Upload

```tsx
import { useUploadContext, useUpload } from '@uploadista/react';

function SingleFileUploader() {
  const uploadClient = useUploadContext();
  const upload = useUpload(uploadClient, {
    onSuccess: (result) => console.log('Upload complete:', result),
    onError: (error) => console.error('Upload failed:', error),
    onProgress: (progress) => console.log('Progress:', progress + '%'),
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload.upload(file);
  };

  return (
    <div>
      <input type="file" onChange={handleFileSelect} />
      {upload.isUploading && <div>Progress: {upload.state.progress}%</div>}
      {upload.state.error && <div>Error: {upload.state.error.message}</div>}
      {upload.canRetry && <button onClick={upload.retry}>Retry</button>}
      <button onClick={upload.abort} disabled={!upload.isUploading}>Abort</button>
    </div>
  );
}
```

### Multi-File Upload

```tsx
import { useUploadContext, useMultiUpload } from '@uploadista/react';

function MultiFileUploader() {
  const uploadClient = useUploadContext();
  const multiUpload = useMultiUpload(uploadClient, {
    maxConcurrent: 3,
    onComplete: (results) => {
      console.log(`${results.successful.length}/${results.total} successful`);
    },
  });

  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      multiUpload.addFiles(Array.from(e.target.files));
      multiUpload.startAll();
    }
  };

  return (
    <div>
      <input type="file" multiple onChange={handleFilesSelect} />
      <div>Progress: {multiUpload.state.progress}%</div>
      <div>
        {multiUpload.state.uploading} uploading,
        {multiUpload.state.successful} successful,
        {multiUpload.state.failed} failed
      </div>

      {multiUpload.items.map((item) => (
        <div key={item.id}>
          {item.file.name}: {item.state.status} ({item.state.progress}%)
        </div>
      ))}
    </div>
  );
}
```

### Drag & Drop Upload

```tsx
import { useUploadContext, useDragDrop, useMultiUpload } from '@uploadista/react';

function DragDropUploader() {
  const uploadClient = useUploadContext();
  const multiUpload = useMultiUpload(uploadClient);

  const dragDrop = useDragDrop({
    accept: ['image/*', '.pdf'],
    maxFiles: 5,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    onFilesReceived: (files) => {
      multiUpload.addFiles(files);
      multiUpload.startAll();
    },
    onValidationError: (errors) => {
      console.error('Validation errors:', errors);
    },
  });

  return (
    <div
      {...dragDrop.dragHandlers}
      style={{
        border: dragDrop.state.isDragging ? '2px dashed #007bff' : '2px dashed #ccc',
        padding: '2rem',
        textAlign: 'center',
      }}
      onClick={dragDrop.openFilePicker}
    >
      {dragDrop.state.isDragging ? (
        <p>Drop files here...</p>
      ) : (
        <p>Drag files here or click to select</p>
      )}

      {dragDrop.state.errors.length > 0 && (
        <div>
          {dragDrop.state.errors.map((error, i) => (
            <p key={i} style={{ color: 'red' }}>{error}</p>
          ))}
        </div>
      )}

      <input {...dragDrop.inputProps} />
    </div>
  );
}
```

### Upload Zone (Combined Drag & Drop + Upload)

```tsx
import { SimpleUploadZone } from '@uploadista/react';

function SimpleUploader() {
  return (
    <SimpleUploadZone
      multiple={true}
      accept={['image/*']}
      maxFileSize={5 * 1024 * 1024}
      onUploadStart={(files) => console.log('Starting uploads:', files.length)}
      onValidationError={(errors) => console.error('Validation errors:', errors)}
      multiUploadOptions={{
        maxConcurrent: 3,
        onComplete: (results) => console.log('All uploads complete:', results),
      }}
    />
  );
}
```

### Flow Execution

```tsx
import { useFlowClient, useFlow } from '@uploadista/react';

function FlowExecutor() {
  const flowClient = useFlowClient({
    baseUrl: 'https://api.example.com',
    storageId: 'my-storage',
    chunkSize: 1024 * 1024,
    storeFingerprintForResuming: true,
    onEvent: (event) => console.log('Flow event:', event),
  });

  const flow = useFlow(flowClient, {
    flowId: 'image-processing',
    storageId: 'my-storage',
    autoConnectWebSocket: true,
    onSuccess: (result) => console.log('Flow completed:', result),
    onError: (error) => console.error('Flow failed:', error),
  });

  const handleExecute = () => {
    flow.executeFlow({
      image: 'photo.jpg',
      quality: 80,
    });
  };

  return (
    <div>
      <button onClick={handleExecute} disabled={flow.state.status === 'running'}>
        Execute Flow
      </button>

      {flow.state.status === 'running' && <div>Processing...</div>}
      {flow.state.status === 'success' && <div>Success!</div>}
      {flow.state.error && <div>Error: {flow.state.error.message}</div>}
    </div>
  );
}
```

### Upload Metrics

```tsx
import { useUploadMetrics } from '@uploadista/react';

function UploadMetricsDisplay() {
  const metrics = useUploadMetrics({
    speedCalculationInterval: 1000,
    onMetricsUpdate: (metrics) => {
      console.log(`Speed: ${metrics.currentSpeed / 1024} KB/s`);
    },
  });

  // Track file uploads
  React.useEffect(() => {
    // When starting an upload
    metrics.startFileUpload('file-1', 'photo.jpg', 1024 * 1024);

    // When progress updates
    metrics.updateFileProgress('file-1', 512 * 1024);

    // When upload completes
    metrics.completeFileUpload('file-1');
  }, []);

  return (
    <div>
      <div>Overall Progress: {metrics.metrics.progress}%</div>
      <div>Speed: {(metrics.metrics.currentSpeed / 1024).toFixed(1)} KB/s</div>
      <div>Files: {metrics.metrics.completedFiles}/{metrics.metrics.totalFiles}</div>

      {metrics.fileMetrics.map((file) => (
        <div key={file.id}>
          {file.filename}: {file.progress}%
        </div>
      ))}
    </div>
  );
}
```

## API Reference

### Hooks

#### Upload Hooks
- `useUploadClient(options)` - Create a unified upload/flow client
- `useUpload(client, options)` - Manage single file upload
- `useMultiUpload(client, options)` - Manage multiple file uploads
- `useUploadMetrics(options)` - Track upload performance metrics

#### Flow Hooks
- `useUploadFlow(client, options)` - Execute and manage flows

#### UI Hooks
- `useDragDrop(options)` - Drag and drop functionality
- `useUploadContext()` - Access upload client from context

### Components

#### Providers
- `<UploadProvider>` - Context provider for upload client

#### Upload Components
- `<UploadZone>` - Headless upload zone with render props
- `<SimpleUploadZone>` - Pre-styled upload zone
- `<UploadList>` - Headless upload list with render props
- `<SimpleUploadListItem>` - Pre-styled upload list item

### Utilities

- `formatFileSize(bytes)` - Format bytes to human-readable size
- `formatSpeed(bytesPerSecond)` - Format speed to human-readable format
- `formatDuration(milliseconds)` - Format duration to human-readable format
- `validateFileType(file, accept)` - Validate file against accepted types
- `isImageFile(file)` - Check if file is an image
- `isVideoFile(file)` - Check if file is a video
- `isAudioFile(file)` - Check if file is audio
- `isDocumentFile(file)` - Check if file is a document
- `createFilePreview(file)` - Create preview URL for file
- `revokeFilePreview(url)` - Clean up preview URL

## License

MIT
