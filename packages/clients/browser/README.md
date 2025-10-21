# @uploadista/client-browser

Browser-optimized upload client for Uploadista with native Web APIs.

## Overview

`@uploadista/client-browser` is the browser-specific implementation of the Uploadista upload client. It provides a complete file upload solution optimized for modern web browsers, leveraging native browser APIs for optimal performance and compatibility.

This package extends `@uploadista/client-core` with browser-specific implementations:
- **Fetch API** for HTTP requests with connection pooling
- **File API** for reading File and Blob objects
- **Web Crypto API** for checksums and fingerprints
- **WebSocket API** for real-time progress updates
- **LocalStorage API** for upload state persistence

The client supports resumable uploads, parallel chunk uploads, progress tracking, and automatic retry with exponential backoff. It's designed to handle files of any size by reading and uploading them in configurable chunks, keeping memory usage low even for multi-gigabyte files.

## Installation

```bash
npm install @uploadista/client-browser
# or
pnpm add @uploadista/client-browser
# or
yarn add @uploadista/client-browser
```

## Quick Start

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

// Create the client
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

// Get file from input
const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
const file = fileInput.files[0];

// Upload with progress tracking
const upload = await client.upload(file, {
  onProgress: (event) => {
    console.log(`Progress: ${event.progress}%`);
    console.log(`Speed: ${event.bytesPerSecond / 1024} KB/s`);
  }
});

console.log('Upload complete:', upload.id);
console.log('File URL:', upload.url);
```

## Features

- **Browser-Native APIs** - Uses Fetch, File API, WebSocket, and Web Crypto for optimal performance
- **Resumable Uploads** - Automatically resume interrupted uploads using fingerprinting
- **Chunked Uploads** - Upload files in configurable chunks to handle large files efficiently
- **Connection Pooling** - Optimized HTTP/2 connection reuse with keep-alive
- **Progress Tracking** - Real-time progress updates with upload speed and ETA
- **WebSocket Support** - Real-time events for upload and flow processing updates
- **Automatic Retry** - Configurable retry logic with exponential backoff
- **LocalStorage Persistence** - Save upload state for resumption across page reloads
- **TypeScript Support** - Full type safety with TypeScript definitions
- **Framework Utilities** - Helper types and utilities for React, Vue, and other frameworks

## API Reference

### createUploadistaClient()

Creates a browser-optimized Uploadista client with automatic service configuration.

```typescript
function createUploadistaClient(
  options: UploadistaClientOptions
): UploadistaClient<File | Blob>
```

**Options:**

- `endpoint` (string, required) - Upload endpoint URL
- `chunkSize` (number) - Chunk size in bytes (default: 5MB)
- `retryDelays` (number[]) - Retry delays in milliseconds (default: [0, 1000, 3000, 5000])
- `connectionPooling` (ConnectionPoolConfig) - HTTP connection pooling configuration
- `storeFingerprintForResuming` (boolean) - Enable resumable uploads (default: true)
- `allowedMetaFields` (string[]) - Allowed metadata field names

**Returns:** UploadistaClient configured for browser use

**Example:**

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  chunkSize: 10 * 1024 * 1024, // 10MB chunks
  retryDelays: [1000, 3000, 5000, 10000],
  connectionPooling: {
    maxConnectionsPerHost: 6,
    enableHttp2: true,
    keepAliveTimeout: 60000
  },
  storeFingerprintForResuming: true,
  allowedMetaFields: ['userId', 'projectId', 'tags']
});
```

### createHttpClient()

Creates a Fetch-based HTTP client with connection pooling and metrics tracking.

```typescript
function createHttpClient(
  config?: ConnectionPoolConfig
): HttpClient
```

**Config Options:**

- `maxConnectionsPerHost` (number) - Maximum concurrent connections per host (default: 6)
- `connectionTimeout` (number) - Connection timeout in milliseconds (default: 30000)
- `keepAliveTimeout` (number) - Keep-alive timeout in milliseconds (default: 60000)
- `enableHttp2` (boolean) - Enable HTTP/2 multiplexing (default: true)
- `retryOnConnectionError` (boolean) - Retry on connection errors (default: true)

**Returns:** HttpClient with connection pooling and health monitoring

**Example:**

```typescript
import { createHttpClient } from '@uploadista/client-browser';

const httpClient = createHttpClient({
  maxConnectionsPerHost: 10,
  connectionTimeout: 60000,
  keepAliveTimeout: 120000,
  enableHttp2: true
});

// Make requests
const response = await httpClient.request('https://api.example.com/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ key: 'value' })
});

// Check connection health
const metrics = httpClient.getDetailedMetrics();
console.log('Connection health:', metrics.health.status);
console.log('Reuse rate:', Math.round(metrics.reuseRate * 100) + '%');
```

### createBrowserFileReaderService()

Creates a file reader service for opening and reading File/Blob objects in chunks.

```typescript
function createBrowserFileReaderService(): FileReaderService<BrowserUploadInput>
```

**Returns:** FileReaderService configured for browser File/Blob objects

**Example:**

```typescript
import { createBrowserFileReaderService } from '@uploadista/client-browser';

const fileReader = createBrowserFileReaderService();

// Open a file from input
const input = document.querySelector<HTMLInputElement>('input[type="file"]');
const file = input.files[0];
const source = await fileReader.openFile(file, 5 * 1024 * 1024); // 5MB chunks

console.log('File name:', source.name);
console.log('File size:', source.size);
console.log('File type:', source.type);

// Read first chunk
const chunk = await source.slice(0, 5 * 1024 * 1024);
console.log('Read', chunk.size, 'bytes');

// Close when done
source.close();
```

### BrowserUploadInput

Type representing browser file inputs that can be uploaded.

```typescript
type BrowserUploadInput = File | Blob
```

**File** - From file input elements, drag-and-drop, or File constructor
**Blob** - From programmatic creation or API responses

**Example:**

```typescript
// From file input
const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
const file: BrowserUploadInput = fileInput.files[0];

// From drag and drop
element.addEventListener('drop', (e) => {
  e.preventDefault();
  const file: BrowserUploadInput = e.dataTransfer.files[0];
  client.upload(file);
});

// From Blob
const blob: BrowserUploadInput = new Blob(
  ['Hello, world!'],
  { type: 'text/plain' }
);
client.upload(blob);

// From canvas
const canvas = document.querySelector('canvas');
canvas.toBlob((blob) => {
  if (blob) {
    client.upload(blob);
  }
});
```

## Configuration

### Connection Pooling

Optimize HTTP connection reuse for better upload performance:

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  connectionPooling: {
    maxConnectionsPerHost: 6,      // Browser default for HTTP/1.1
    connectionTimeout: 30000,       // 30 seconds
    keepAliveTimeout: 60000,        // 1 minute
    enableHttp2: true,              // Enable HTTP/2 multiplexing
    retryOnConnectionError: true    // Retry on connection failures
  }
});
```

### Chunk Size

Balance memory usage and upload efficiency:

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  chunkSize: 5 * 1024 * 1024 // 5MB chunks (default)

  // For slow connections
  // chunkSize: 1 * 1024 * 1024 // 1MB chunks

  // For fast connections
  // chunkSize: 10 * 1024 * 1024 // 10MB chunks
});
```

### Resumable Uploads

Enable automatic upload resumption after interruptions:

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  storeFingerprintForResuming: true, // Enable resumable uploads

  // Upload will be fingerprinted and stored in localStorage
  // If interrupted, it will automatically resume from the last chunk
});
```

### Retry Configuration

Configure automatic retry with exponential backoff:

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  retryDelays: [0, 1000, 3000, 5000], // Retry after 0s, 1s, 3s, 5s

  // First attempt: immediate
  // Second attempt: 1 second delay
  // Third attempt: 3 second delay
  // Fourth attempt: 5 second delay
  // After 4 retries, upload fails
});
```

## Examples

### Example 1: Basic File Upload

Simple file upload from a file input element:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const upload = await client.upload(file);
    console.log('Upload successful!');
    console.log('File ID:', upload.id);
    console.log('File URL:', upload.url);
  } catch (error) {
    console.error('Upload failed:', error);
  }
});
```

### Example 2: Upload with Progress Tracking

Track upload progress with real-time updates:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

const progressBar = document.querySelector<HTMLProgressElement>('.progress-bar');
const speedDisplay = document.querySelector<HTMLSpanElement>('.speed');
const etaDisplay = document.querySelector<HTMLSpanElement>('.eta');

const upload = await client.upload(file, {
  onProgress: (event) => {
    // Update progress bar
    progressBar.value = event.progress;

    // Display upload speed
    const speedMBps = (event.bytesPerSecond / 1024 / 1024).toFixed(2);
    speedDisplay.textContent = `${speedMBps} MB/s`;

    // Calculate and display ETA
    const remainingBytes = event.totalBytes - event.bytesUploaded;
    const etaSeconds = Math.round(remainingBytes / event.bytesPerSecond);
    etaDisplay.textContent = `${etaSeconds}s remaining`;
  }
});
```

### Example 3: Upload with WebSocket for Real-Time Updates

Use WebSocket for real-time upload events and flow processing updates:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

// Upload file and get WebSocket connection
const upload = await client.upload(file);

// Connect to WebSocket for real-time events
const ws = new WebSocket(`wss://api.uploadista.com/ws/${upload.id}`);

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);

  switch (message.type) {
    case 'upload_progress':
      console.log('Progress:', message.payload.progress + '%');
      break;

    case 'upload_complete':
      console.log('Upload complete:', message.payload);
      break;

    case 'flow_start':
      console.log('Flow processing started');
      break;

    case 'flow_progress':
      console.log('Flow progress:', message.payload.nodeId);
      break;

    case 'flow_complete':
      console.log('Flow complete:', message.payload.result);
      break;

    case 'error':
      console.error('Error:', message.message);
      break;
  }
});

ws.addEventListener('open', () => {
  console.log('WebSocket connected');
});

ws.addEventListener('error', (error) => {
  console.error('WebSocket error:', error);
});

ws.addEventListener('close', () => {
  console.log('WebSocket disconnected');
});
```

### Example 4: Multi-File Upload

Upload multiple files with progress tracking for each file:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
fileInput.multiple = true;

fileInput.addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);

  const uploadPromises = files.map(file =>
    client.upload(file, {
      onProgress: (event) => {
        console.log(`${file.name}: ${event.progress}%`);
      }
    })
  );

  try {
    const results = await Promise.all(uploadPromises);
    console.log('All uploads complete:', results);
  } catch (error) {
    console.error('One or more uploads failed:', error);
  }
});
```

### Example 5: Drag and Drop Upload

Handle drag-and-drop file uploads:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

const dropZone = document.querySelector<HTMLDivElement>('.drop-zone');

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const files = Array.from(e.dataTransfer.files);

  for (const file of files) {
    try {
      const upload = await client.upload(file, {
        onProgress: (event) => {
          console.log(`${file.name}: ${event.progress}%`);
        }
      });
      console.log(`${file.name} uploaded:`, upload.id);
    } catch (error) {
      console.error(`${file.name} failed:`, error);
    }
  }
});
```

### Example 6: Upload with Metadata

Include custom metadata with your uploads:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  allowedMetaFields: ['userId', 'projectId', 'tags', 'description']
});

const upload = await client.upload(file, {
  metadata: {
    userId: 'user-123',
    projectId: 'project-456',
    tags: 'profile-photo, avatar',
    description: 'User profile photo'
  }
});

console.log('Upload with metadata:', upload);
```

### Example 7: Resumable Upload with Fingerprinting

Automatically resume interrupted uploads:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  storeFingerprintForResuming: true // Enable resumable uploads
});

// First upload attempt
const upload = await client.upload(file, {
  onProgress: (event) => {
    console.log('Progress:', event.progress + '%');

    // Simulate interruption at 50%
    if (event.progress >= 50) {
      window.location.reload(); // Page reload
    }
  }
});

// After page reload, same file will automatically resume from 50%
// The client fingerprints the file and stores progress in localStorage
```

### Example 8: Connection Health Monitoring

Monitor HTTP connection health and performance:

```typescript
import { createHttpClient } from '@uploadista/client-browser';

const httpClient = createHttpClient({
  maxConnectionsPerHost: 6,
  keepAliveTimeout: 60000,
  enableHttp2: true
});

// Monitor connection health periodically
setInterval(() => {
  const metrics = httpClient.getDetailedMetrics();

  console.log('Connection Health:', metrics.health.status);
  console.log('Health Score:', metrics.health.score);
  console.log('Connection Reuse Rate:', Math.round(metrics.reuseRate * 100) + '%');
  console.log('Average Connection Time:', Math.round(metrics.averageConnectionTime) + 'ms');
  console.log('Requests/sec:', metrics.requestsPerSecond.toFixed(2));
  console.log('Error Rate:', (metrics.errorRate * 100).toFixed(1) + '%');

  if (metrics.health.status === 'degraded' || metrics.health.status === 'poor') {
    console.warn('Connection Issues:', metrics.health.issues);
    console.log('Recommendations:', metrics.health.recommendations);
  }
}, 30000); // Check every 30 seconds
```

### Example 9: Flow Execution with File Upload

Upload a file and execute a processing flow:

```typescript
import { createUploadistaClient } from '@uploadista/client-browser';

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload'
});

// Upload image file
const imageFile = document.querySelector<HTMLInputElement>('input[type="file"]').files[0];
const upload = await client.upload(imageFile);

// Execute image processing flow
const flowResult = await client.executeFlow({
  flowId: 'image-resize-optimize',
  inputs: {
    'input-1': upload.id // Reference uploaded file
  },
  storageId: 'storage-1'
});

console.log('Flow execution complete:', flowResult);
console.log('Processed images:', flowResult.outputs);
```

## Browser Compatibility

`@uploadista/client-browser` is compatible with modern browsers that support:

- **Fetch API** - Chrome 42+, Firefox 39+, Safari 10.1+, Edge 14+
- **File API** - Chrome 13+, Firefox 3.6+, Safari 6+, Edge 12+
- **Web Crypto API** - Chrome 37+, Firefox 34+, Safari 11+, Edge 79+
- **WebSocket** - Chrome 16+, Firefox 11+, Safari 7+, Edge 12+
- **LocalStorage** - Chrome 4+, Firefox 3.5+, Safari 4+, Edge 12+

### Minimum Browser Versions

- Chrome/Edge: 79+
- Firefox: 67+
- Safari: 11+
- Opera: 66+

### Features by Browser

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Chunked Upload | 42+ | 39+ | 10.1+ | 14+ |
| Resumable Upload | 37+ | 34+ | 11+ | 79+ |
| WebSocket Events | 16+ | 11+ | 7+ | 12+ |
| HTTP/2 Multiplexing | 49+ | 52+ | 10.1+ | 79+ |
| Connection Pooling | 42+ | 39+ | 10.1+ | 14+ |

### Polyfills

For older browser support, consider using polyfills:

- `whatwg-fetch` - Fetch API polyfill
- `abortcontroller-polyfill` - AbortController polyfill
- `webcrypto-shim` - Web Crypto API polyfill

```bash
npm install whatwg-fetch abortcontroller-polyfill webcrypto-shim
```

```typescript
import 'whatwg-fetch';
import 'abortcontroller-polyfill/dist/polyfill-patch-fetch';
import 'webcrypto-shim';

import { createUploadistaClient } from '@uploadista/client-browser';
```

## Related Packages

### Core Packages
- [@uploadista/core](../../../core/README.md) - Core flow engine and upload system
- [@uploadista/client-core](../core/README.md) - Platform-agnostic client logic

### Other Client Packages
- [@uploadista/react](../react/README.md) - React hooks and components for Uploadista

### Server Packages
- [@uploadista/server](../../server/README.md) - Server-side upload handling

## Troubleshooting

### Issue: Upload fails with CORS error

**Solution:** Ensure your server is configured to accept requests from your domain:

```javascript
// Server-side (example)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://your-domain.com');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
```

### Issue: Upload fails on mobile Safari

**Solution:** Mobile Safari has stricter memory limits. Use smaller chunk sizes:

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  chunkSize: 1 * 1024 * 1024 // 1MB chunks for mobile
});
```

### Issue: Resumable uploads not working

**Solution:** Verify that:
1. `storeFingerprintForResuming` is enabled
2. LocalStorage is not disabled or full
3. The file hasn't been modified (fingerprint would change)
4. The server supports resumable uploads

```typescript
// Check if localStorage is available
if (typeof localStorage !== 'undefined') {
  const client = createUploadistaClient({
    endpoint: 'https://api.uploadista.com/upload',
    storeFingerprintForResuming: true
  });
}
```

### Issue: Slow upload speeds

**Solution:**
1. Check connection health metrics
2. Increase chunk size for fast connections
3. Enable HTTP/2 multiplexing
4. Warm up connections before uploading

```typescript
const httpClient = createHttpClient({
  maxConnectionsPerHost: 10,
  enableHttp2: true,
  keepAliveTimeout: 120000
});

// Warm up connections
await httpClient.warmupConnections(['https://api.uploadista.com']);

const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  chunkSize: 10 * 1024 * 1024, // 10MB chunks for fast connections
  connectionPooling: {
    maxConnectionsPerHost: 10,
    enableHttp2: true
  }
});
```

### Issue: Memory usage too high

**Solution:** Reduce chunk size to decrease memory usage:

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  chunkSize: 1 * 1024 * 1024 // 1MB chunks
});
```

### Issue: WebSocket connection fails

**Solution:**
1. Verify WebSocket URL is correct (wss:// for HTTPS)
2. Check firewall/proxy settings
3. Ensure server supports WebSocket upgrades
4. Implement reconnection logic

```typescript
let ws: WebSocket;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

function connectWebSocket(uploadId: string) {
  ws = new WebSocket(`wss://api.uploadista.com/ws/${uploadId}`);

  ws.addEventListener('open', () => {
    console.log('Connected');
    reconnectAttempts = 0;
  });

  ws.addEventListener('close', () => {
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      setTimeout(() => connectWebSocket(uploadId), delay);
    }
  });
}
```

### Issue: File upload fails with large files

**Solution:**
1. Use chunked uploads (enabled by default)
2. Increase chunk size for better performance
3. Enable resumable uploads for reliability

```typescript
const client = createUploadistaClient({
  endpoint: 'https://api.uploadista.com/upload',
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  storeFingerprintForResuming: true, // Enable resumable uploads
  retryDelays: [1000, 3000, 5000, 10000] // Retry on failure
});
```

## License

MIT
