# @uploadista/vue

Vue 3 client for Uploadista - file uploads and flow management with Vue Composition API.

## Features

- Vue 3 Composition API composables for file uploads
- Flow-based upload processing
- WebSocket support for real-time progress
- TypeScript support
- Reactive state management
- Drag and drop support
- Multiple concurrent uploads
- Upload metrics and monitoring

## Installation

```bash
pnpm add @uploadista/vue
# or
npm install @uploadista/vue
# or
yarn add @uploadista/vue
```

## Requirements

- Vue 3.3 or higher
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Install the Plugin

```typescript
// main.ts
import { createApp } from 'vue'
import { createUploadistaPlugin } from '@uploadista/vue'
import App from './App.vue'

const app = createApp(App)

app.use(createUploadistaPlugin({
  serverUrl: 'http://localhost:4200', // Your Uploadista server URL
  auth: {
    type: 'saas',
    apiKey: 'your-api-key'
  }
}))

app.mount('#app')
```

### 2. Use Composables in Components

```vue
<script setup lang="ts">
import { useUpload } from '@uploadista/vue'

const { state, upload, abort, reset } = useUpload()

const handleFileChange = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) {
    await upload(file)
  }
}
</script>

<template>
  <div>
    <input type="file" @change="handleFileChange" :disabled="state.status === 'uploading'" />

    <div v-if="state.status === 'uploading'">
      <p>Progress: {{ state.progress.toFixed(0) }}%</p>
      <button @click="abort">Cancel</button>
    </div>

    <div v-if="state.status === 'success'">
      <p>Upload complete!</p>
      <p>File ID: {{ state.result?.fileId }}</p>
    </div>

    <div v-if="state.status === 'error'">
      <p>Error: {{ state.error?.message }}</p>
      <button @click="reset">Try Again</button>
    </div>
  </div>
</template>
```

## API Reference

### Plugin

#### `createUploadistaPlugin(options)`

Creates the Uploadista Vue plugin.

**Options:**
- `serverUrl` - Uploadista server URL
- `auth` - Authentication configuration
  - `type: 'no-auth' | 'saas' | 'direct'`
  - For SaaS: `{ type: 'saas', apiKey: string, projectId?: string }`
  - For direct: `{ type: 'direct', getAuthorizationHeader: () => Promise<string> }`

### Composables

#### `useUploadistaClient()`

Access the Uploadista client instance.

```typescript
const client = useUploadistaClient()
```

#### `useUpload(options?)`

Single file upload with progress tracking.

**Returns:**
- `state` - Reactive upload state (readonly)
  - `status` - Upload status: 'idle' | 'uploading' | 'success' | 'error' | 'aborted'
  - `progress` - Progress percentage (0-100)
  - `bytesUploaded` - Bytes uploaded
  - `totalBytes` - Total file size
  - `result` - Upload result (when successful)
  - `error` - Error object (when failed)
- `upload(file, options?)` - Start upload
- `abort()` - Cancel upload
- `reset()` - Reset to initial state
- `retry()` - Retry failed upload

**Options:**
- `onProgress` - Progress callback
- `onComplete` - Completion callback
- `onError` - Error callback

#### `useMultiUpload(options?)`

Multiple file uploads with aggregate tracking.

**Returns:**
- `uploads` - Array of upload items (readonly)
- `stats` - Aggregate statistics (readonly)
  - `totalFiles`, `completedFiles`, `failedFiles`
  - `totalBytes`, `uploadedBytes`
  - `totalProgress`, `allComplete`, `hasErrors`
- `add(files)` - Add files to upload queue
- `remove(uploadId)` - Remove upload
- `clear()` - Clear all uploads
- `retryFailed()` - Retry all failed uploads

#### `useFlowUpload(options?)`

Upload file through a flow pipeline.

**Returns:**
- `state` - Reactive flow upload state (readonly)
  - Includes all `useUpload` state
  - `jobId` - Flow job ID
  - `flowStatus` - Flow status
  - `flowResult` - Flow result
- `uploadFlow(file, flowOptions)` - Start flow upload
- `abort()` - Cancel flow upload
- `reset()` - Reset state

#### `useMultiFlowUpload(options?)`

Multiple flow uploads with aggregate tracking.

Similar to `useMultiUpload` but for flow uploads.

#### `useDragDrop(options?)`

Drag and drop file handling.

**Returns:**
- `isDragging` - Drag in progress (readonly)
- `isOver` - Dragging over drop zone (readonly)
- `files` - Dropped files (readonly)
- `onDragEnter` - Handler for drag enter event
- `onDragLeave` - Handler for drag leave event
- `onDragOver` - Handler for drag over event
- `onDrop` - Handler for drop event
- `clearFiles` - Clear dropped files

**Options:**
- `accept` - Accepted file types
- `maxSize` - Maximum file size in bytes
- `multiple` - Allow multiple files (default: true)
- `onFilesDropped` - Callback when files are dropped

#### `useFlow(flowId, options?)`

Execute a flow.

**Returns:**
- `state` - Flow execution state (readonly)
- `execute(input)` - Execute flow
- `cancel()` - Cancel flow execution

#### `useFlowClient()`

Access the flow client.

```typescript
const flowClient = useFlowClient()
```

#### `useFlowWebSocket(jobId)`

Manage flow WebSocket connection.

**Returns:**
- `isConnected` - Connection status (readonly)
- `events` - Flow events stream (readonly)
- `connect()` - Connect to WebSocket
- `disconnect()` - Disconnect WebSocket
- `sendPing()` - Send ping message

#### `useUploadMetrics()`

Access upload performance metrics.

**Returns:**
- `metrics` - Upload metrics (readonly)
  - Network speed, chunk timing, etc.

### Components

#### `<UploadZone>`

File input with drag and drop zone.

**Props:**
- `accept` - Accepted file types
- `multiple` - Allow multiple files
- `disabled` - Disable input

**Events:**
- `@file-select` - Emitted when files are selected

**Slots:**
- `default` - Custom drop zone content

#### `<UploadList>`

Display upload progress for multiple files.

**Props:**
- `uploads` - Array of upload items

**Slots:**
- `item` - Custom upload item template

#### `<FlowUploadZone>`

Upload zone with flow configuration.

**Props:**
- `flowId` - Flow ID
- `accept` - Accepted file types
- `multiple` - Allow multiple files

**Events:**
- `@upload-complete` - Emitted when upload completes

#### `<FlowUploadList>`

Display flow upload progress.

**Props:**
- `uploads` - Array of flow upload items

**Slots:**
- `item` - Custom upload item template

### Utilities

```typescript
import {
  formatFileSize,
  formatProgress,
  isImageFile,
  isVideoFile,
  createFileSizeValidator,
  createFileTypeValidator,
  composeValidators
} from '@uploadista/vue/utils'
```

See [framework-utils documentation](../../client/src/framework-utils.ts) for details.

## Examples

### Example: Multiple File Upload with Progress

```vue
<script setup lang="ts">
import { useMultiUpload } from '@uploadista/vue'

const { uploads, stats, add, clear, retryFailed } = useMultiUpload()

const handleFilesSelected = async (files: File[]) => {
  await add(files)
}
</script>

<template>
  <div>
    <input
      type="file"
      multiple
      @change="handleFilesSelected(($event.target as HTMLInputElement).files || [])"
    />

    <div v-if="stats.totalFiles > 0">
      <p>Progress: {{ stats.totalProgress.toFixed(0) }}%</p>
      <p>
        Uploaded: {{ stats.completedFiles }}/{{ stats.totalFiles }}
        ({{ (stats.uploadedBytes / 1024 / 1024).toFixed(2) }}MB / {{ (stats.totalBytes / 1024 / 1024).toFixed(2) }}MB)
      </p>

      <div v-for="upload of uploads" :key="upload.id" class="upload-item">
        <span>{{ upload.filename }}</span>
        <progress :value="upload.progress" max="100"></progress>
        <span>{{ upload.status }}</span>
      </div>

      <button @click="clear" :disabled="!stats.allComplete">Clear All</button>
      <button v-if="stats.hasErrors" @click="retryFailed">Retry Failed</button>
    </div>
  </div>
</template>
```

### Example: Flow-based Upload with Processing

```vue
<script setup lang="ts">
import { useFlowUpload } from '@uploadista/vue'

const { state, uploadFlow, abort, reset } = useFlowUpload()

const handleFlowUpload = async (file: File) => {
  // Upload file through a flow pipeline (e.g., image resize, optimization)
  await uploadFlow(file, {
    flowId: 'image-processor',
    onProgress: (event) => console.log('Processing:', event)
  })
}
</script>

<template>
  <div>
    <input type="file" @change="(e) => handleFlowUpload((e.target as HTMLInputElement).files?.[0]!)" />

    <div v-if="state.status === 'uploading'">
      <p>Upload Progress: {{ state.progress.toFixed(0) }}%</p>
      <p>Flow Status: {{ state.flowStatus }}</p>
      <button @click="abort">Cancel</button>
    </div>

    <div v-if="state.status === 'success'">
      <p>Processing Complete!</p>
      <p v-if="state.flowResult">Result: {{ JSON.stringify(state.flowResult) }}</p>
      <button @click="reset">Upload Another</button>
    </div>
  </div>
</template>
```

### Example: Drag and Drop Upload

```vue
<script setup lang="ts">
import { useUpload, useDragDrop } from '@uploadista/vue'

const { state, upload } = useUpload()
const { isDragging, isOver, onDragEnter, onDragLeave, onDragOver, onDrop } = useDragDrop({
  accept: ['image/*', 'application/pdf'],
  maxSize: 10 * 1024 * 1024, // 10MB
  onFilesDropped: async (files) => {
    if (files.length > 0) {
      await upload(files[0])
    }
  }
})
</script>

<template>
  <div
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover="onDragOver"
    @drop="onDrop"
    :class="{ dragging: isDragging, over: isOver }"
    class="drop-zone"
  >
    <p v-if="!isDragging">Drag files here or click to select</p>
    <p v-else>Drop files to upload</p>

    <input type="file" hidden accept="image/*,application/pdf" />

    <div v-if="state.status === 'uploading'">
      <progress :value="state.progress" max="100"></progress>
    </div>
  </div>
</template>

<style scoped>
.drop-zone {
  border: 2px dashed #ccc;
  padding: 2rem;
  border-radius: 8px;
  text-align: center;
  cursor: pointer;
}

.drop-zone.dragging {
  background-color: #f0f0f0;
}

.drop-zone.over {
  border-color: #007bff;
  background-color: #e7f3ff;
}
</style>
```

### Example: Using `UploadZone` Component

```vue
<script setup lang="ts">
import { UploadZone, UploadList } from '@uploadista/vue'
import { useMultiUpload } from '@uploadista/vue'

const { uploads, add } = useMultiUpload()

const handleFileSelect = async (files: File[]) => {
  await add(files)
}
</script>

<template>
  <div>
    <UploadZone
      multiple
      accept="image/*"
      @file-select="handleFileSelect"
    >
      <div class="custom-drop-zone">
        <p>Drop images here or click to browse</p>
      </div>
    </UploadZone>

    <UploadList :uploads="uploads">
      <template #item="{ upload }">
        <div class="upload-item">
          <span>{{ upload.filename }}</span>
          <progress :value="upload.progress" max="100"></progress>
          <span class="status">{{ upload.status }}</span>
        </div>
      </template>
    </UploadList>
  </div>
</template>

<style scoped>
.custom-drop-zone {
  padding: 2rem;
  border: 2px dashed #ccc;
  border-radius: 8px;
  text-align: center;
}

.upload-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

.status {
  margin-left: auto;
  font-size: 0.875rem;
  color: #666;
}
</style>
```

See the [Vue example application](../../../../examples/vue-client/) for comprehensive usage examples:

- Basic single upload
- Multiple file uploads
- Flow-based processing
- Drag and drop
- Custom styling
- Error handling
- Retry logic

## TypeScript Support

This package includes full TypeScript types. No additional `@types` package is needed.

```typescript
import type {
  UploadState,
  FlowUploadState,
  UseUploadOptions,
  UseFlowUploadOptions
} from '@uploadista/vue'
```

## SSR Considerations

The Vue client works with Nuxt.js and other SSR frameworks. The client is initialized on the client side only:

```typescript
// plugins/uploadista.client.ts (Nuxt)
export default defineNuxtPlugin((nuxtApp) => {
  const uploadista = createUploadistaPlugin({
    serverUrl: useRuntimeConfig().public.uploadistaUrl,
    auth: { type: 'no-auth' }
  })

  nuxtApp.vueApp.use(uploadista)
})
```

## Migration from React

If you're familiar with the React client, here's a quick mapping:

| React | Vue |
|-------|-----|
| `useState` | `ref` / `reactive` |
| `useEffect` | `watch` / `watchEffect` / `onMounted` / `onUnmounted` |
| `useCallback` | Not needed (functions are stable in Vue composables) |
| `useMemo` | `computed` |
| `useContext` | `provide` / `inject` |
| `<UploadistaProvider>` | `app.use(createUploadistaPlugin())` |

All hooks have equivalent composables with the same names (e.g., `useUpload`, `useMultiUpload`).

## Contributing

See the main [Uploadista documentation](../../../../README.md) for contribution guidelines.

## License

MIT
