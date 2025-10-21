# Client Integration Guide

Complete setup guide for integrating Uploadista uploads on frontend.

## Overview

This guide covers integrating Uploadista across different client platforms:
- **React** (Web) - Most popular
- **Vue** (Web) - Vue 3 Composition API
- **React Native** / **Expo** (Mobile)
- **Browser** (Vanilla JavaScript)

**Setup Time**: 5-10 minutes per platform

## React (Web)

### Basic Setup

```bash
npm install @uploadista/react @uploadista/client-browser
```

### Simple Upload Component

```tsx
import { useUpload } from "@uploadista/react";

export function UploadForm() {
  const { upload, progress, error, isLoading } = useUpload({
    serverUrl: "https://api.example.com",
    onComplete: (result) => console.log("Upload done:", result),
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      {isLoading && <progress value={progress} max={100} />}
      {error && <p style={{ color: "red" }}>{error.message}</p>}
    </div>
  );
}
```

### Advanced: Multiple Files with Progress

```tsx
import { useMultiUpload } from "@uploadista/react";

export function MultiUploadForm() {
  const {
    uploads,
    addFiles,
    cancel,
    completed,
  } = useMultiUpload({
    serverUrl: "https://api.example.com",
    onComplete: (results) => {
      console.log("All done:", results);
    },
  });

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => addFiles(Array.from(e.target.files || []))}
      />

      {uploads.map((upload) => (
        <div key={upload.id}>
          <p>{upload.file.name}</p>
          <progress value={upload.progress} max={100} />
          <button onClick={() => cancel(upload.id)}>Cancel</button>
        </div>
      ))}

      <p>{completed} of {uploads.length} complete</p>
    </div>
  );
}
```

### With Authentication (JWT)

```tsx
import { useUpload } from "@uploadista/react";

export function AuthenticatedUpload() {
  const [token, setToken] = React.useState<string>();

  const { upload } = useUpload({
    serverUrl: "https://api.example.com",
    headers: {
      Authorization: token ? `Bearer ${token}` : undefined,
    },
    onComplete: (result) => {
      console.log("Upload complete:", result);
    },
  });

  // Get token from auth service
  React.useEffect(() => {
    getAuthToken().then(setToken);
  }, []);

  return (
    <div>
      {/* Upload UI */}
    </div>
  );
}
```

### Drag & Drop Upload

```tsx
import { useDropZone, useUpload } from "@uploadista/react";

export function DragDropUpload() {
  const { upload, progress } = useUpload({
    serverUrl: "https://api.example.com",
  });

  const { isDragActive, getRootProps, getInputProps } = useDropZone({
    onDrop: (files) => {
      files.forEach(upload);
    },
  });

  return (
    <div
      {...getRootProps()}
      style={{
        border: isDragActive ? "2px solid blue" : "2px dashed gray",
        padding: "20px",
        textAlign: "center",
      }}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Drop files here...</p>
      ) : (
        <p>Drag files or click to select</p>
      )}
    </div>
  );
}
```

### Upload with Processing (Flows)

```tsx
import { useFlowUpload } from "@uploadista/react";

export function ProcessingUpload() {
  const {
    upload,
    results,
    error,
    isProcessing,
  } = useFlowUpload({
    serverUrl: "https://api.example.com",
    flowId: "resize-and-compress", // Server-defined flow
    onProcessingComplete: (result) => {
      // result includes processed variants
      console.log("Variants:", result.variants);
    },
  });

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      {isProcessing && <p>Processing...</p>}
      {results && (
        <div>
          <img src={results.thumbnail} alt="Thumbnail" width={200} />
          <img src={results.medium} alt="Medium" width={600} />
          <img src={results.full} alt="Full" width={1200} />
        </div>
      )}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
```

### Real-Time Progress with WebSocket

```tsx
import { useUploadStream } from "@uploadista/react";

export function StreamingUpload() {
  const { upload, events$ } = useUploadStream({
    serverUrl: "https://api.example.com",
    streamUrl: "wss://api.example.com/api/stream",
  });

  React.useEffect(() => {
    const sub = events$.subscribe((event) => {
      console.log("Event:", event.type, event.data);
    });
    return () => sub.unsubscribe();
  }, [events$]);

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
    </div>
  );
}
```

### Configuration Options

```tsx
interface UploadOptions {
  // Server configuration
  serverUrl: string; // API endpoint
  streamUrl?: string; // WebSocket for real-time
  timeout?: number; // Default: 30000ms

  // Chunks
  chunkSize?: number; // Default: 5MB
  concurrentChunks?: number; // Default: 3

  // Headers & Auth
  headers?: Record<string, string>;
  credentials?: "include" | "omit" | "same-origin";

  // Callbacks
  onProgress?: (progress: number) => void;
  onComplete?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
  onCancel?: () => void;
}
```

## Vue 3

### Basic Setup

```bash
npm install @uploadista/vue @uploadista/client-browser
```

### Simple Upload

```vue
<template>
  <div>
    <input
      type="file"
      @change="selectFile"
    />
    <progress v-if="isLoading" :value="progress" max="100" />
    <p v-if="error" style="color: red">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useUpload } from "@uploadista/vue";

const { upload, progress, error, isLoading } =
  useUpload({
    serverUrl: "https://api.example.com",
    onComplete: (result) => {
      console.log("Done:", result);
    },
  });

const selectFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) upload(file);
};
</script>
```

### Multiple Files with Composable

```vue
<template>
  <div>
    <input
      type="file"
      multiple
      @change="addFiles"
    />

    <div v-for="item in uploads" :key="item.id">
      <p>{{ item.file.name }}</p>
      <progress :value="item.progress" max="100" />
      <button @click="cancel(item.id)">Cancel</button>
    </div>

    <p>{{ completed }} of {{ uploads.length }} complete</p>
  </div>
</template>

<script setup lang="ts">
import { useMultiUpload } from "@uploadista/vue";

const { uploads, addFiles, cancel, completed } =
  useMultiUpload({
    serverUrl: "https://api.example.com",
    onComplete: (results) => {
      console.log("All done:", results);
    },
  });

const addFiles = (files: FileList) => {
  addFiles(Array.from(files));
};
</script>
```

### Drag & Drop Zone

```vue
<template>
  <div
    v-bind="getRootProps()"
    :style="{
      border: isDragActive ? '2px solid blue' : '2px dashed gray',
      padding: '20px',
    }"
  >
    <input v-bind="getInputProps()" />
    <p v-if="isDragActive">Drop files here...</p>
    <p v-else>Drag files or click to select</p>
  </div>
</template>

<script setup lang="ts">
import { useDropZone, useUpload } from "@uploadista/vue";

const { upload } = useUpload({
  serverUrl: "https://api.example.com",
});

const { isDragActive, getRootProps, getInputProps } =
  useDropZone({
    onDrop: (files) => {
      files.forEach(upload);
    },
  });
</script>
```

### Flow Upload with Processing

```vue
<template>
  <div>
    <input
      type="file"
      accept="image/*"
      @change="selectFile"
    />
    <p v-if="isProcessing">Processing...</p>
    <div v-if="results">
      <img :src="results.thumbnail" width="200" />
      <img :src="results.medium" width="600" />
      <img :src="results.full" width="1200" />
    </div>
    <p v-if="error" style="color: red">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import { useFlowUpload } from "@uploadista/vue";

const { upload, results, error, isProcessing } =
  useFlowUpload({
    serverUrl: "https://api.example.com",
    flowId: "resize-and-compress",
    onProcessingComplete: (result) => {
      console.log("Variants:", result.variants);
    },
  });

const selectFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) upload(file);
};
</script>
```

## React Native / Expo

### Expo Setup

```bash
# Create Expo app
npx create-expo-app upload-example

# Install Uploadista
npm install @uploadista/expo @uploadista/client-core

# Install media picker
npx expo install expo-image-picker
```

### Camera Upload

```tsx
import { useUpload } from "@uploadista/expo";
import * as ImagePicker from "expo-image-picker";

export function CameraUpload() {
  const { upload, progress, isLoading } = useUpload({
    serverUrl: "https://api.example.com",
  });

  const takePicture = async () => {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (!result.canceled) {
      const file = result.assets[0];
      upload({
        uri: file.uri,
        name: file.filename || `photo-${Date.now()}.jpg`,
        type: file.type,
      });
    }
  };

  return (
    <View>
      <Button title="Take Photo" onPress={takePicture} />
      {isLoading && <Text>Progress: {progress}%</Text>}
    </View>
  );
}
```

### Photo Library Upload

```tsx
import { useMultiUpload } from "@uploadista/expo";
import * as ImagePicker from "expo-image-picker";

export function GalleryUpload() {
  const { uploads, addFiles, cancel } = useMultiUpload({
    serverUrl: "https://api.example.com",
  });

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultiple: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
    });

    if (!result.canceled) {
      const files = result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.filename || `image-${Date.now()}.jpg`,
        type: asset.type || "image/jpeg",
      }));
      addFiles(files);
    }
  };

  return (
    <View>
      <Button title="Pick Images" onPress={pickImages} />
      {uploads.map((item) => (
        <View key={item.id}>
          <Text>{item.file.name}</Text>
          <Progress.Bar
            progress={item.progress / 100}
            width={200}
          />
          <Button title="Cancel" onPress={() => cancel(item.id)} />
        </View>
      ))}
    </View>
  );
}
```

### Upload Large Files in Chunks

```tsx
import { useUpload } from "@uploadista/expo";

export function LargeFileUpload() {
  const { upload, progress } = useUpload({
    serverUrl: "https://api.example.com",
    chunkSize: 10 * 1024 * 1024, // 10MB chunks for large files
    concurrentChunks: 2, // Limit concurrent chunks on mobile
  });

  // Upload video for example
  const pickVideo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    });

    if (!result.canceled) {
      upload({
        uri: result.assets[0].uri,
        name: `video-${Date.now()}.mp4`,
        type: "video/mp4",
      });
    }
  };

  return (
    <View>
      <Button title="Pick Video" onPress={pickVideo} />
      <Text>Progress: {progress}%</Text>
    </View>
  );
}
```

## Browser (Vanilla JavaScript)

### Basic Setup

```bash
npm install @uploadista/client-browser
```

### Simple Upload

```typescript
import { createUploadClient } from "@uploadista/client-browser";

const client = createUploadClient({
  serverUrl: "https://api.example.com",
});

const fileInput = document.getElementById(
  "file-input"
) as HTMLInputElement;
const progressBar = document.getElementById("progress") as HTMLProgressElement;

fileInput.addEventListener("change", async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  try {
    const result = await client.upload(file, {
      onProgress: (progress) => {
        progressBar.value = progress;
      },
    });

    console.log("Upload complete:", result);
  } catch (error) {
    console.error("Upload failed:", error);
  }
});
```

### Multiple Files with Progress

```typescript
import {
  createUploadClient,
  type UploadProgress,
} from "@uploadista/client-browser";

const client = createUploadClient({
  serverUrl: "https://api.example.com",
});

const container = document.getElementById("uploads");

async function uploadFiles(files: FileList) {
  for (const file of files) {
    const upload = createUploadUI(file);
    container?.appendChild(upload.element);

    try {
      await client.upload(file, {
        onProgress: (progress) => {
          upload.updateProgress(progress);
        },
      });
      upload.markComplete();
    } catch (error) {
      upload.markError(error as Error);
    }
  }
}

function createUploadUI(file: File) {
  const element = document.createElement("div");
  const progress = document.createElement("progress");
  const name = document.createElement("p");

  name.textContent = file.name;
  progress.max = 100;

  element.appendChild(name);
  element.appendChild(progress);

  return {
    element,
    updateProgress: (value: number) => {
      progress.value = value;
    },
    markComplete: () => {
      element.style.opacity = "0.5";
    },
    markError: (error: Error) => {
      name.textContent = `${file.name} - Error: ${error.message}`;
      name.style.color = "red";
    },
  };
}

// Use it
document
  .getElementById("file-input")
  ?.addEventListener("change", (e) => {
    uploadFiles((e.target as HTMLInputElement).files!);
  });
```

### With Authentication

```typescript
import { createUploadClient } from "@uploadista/client-browser";

let token: string;

// Get token from your auth service
async function login() {
  const response = await fetch("https://api.example.com/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  token = data.token;
}

const client = createUploadClient({
  serverUrl: "https://api.example.com",
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Use client to upload
```

## Configuration by Platform

### React & Vue

```typescript
interface ClientConfig {
  // Server
  serverUrl: string;
  streamUrl?: string;
  timeout?: number;

  // Chunks
  chunkSize?: number; // Default: 5MB
  concurrentChunks?: number; // Default: 3

  // Auth
  headers?: Record<string, string>;
  credentials?: "include" | "omit" | "same-origin";

  // Callbacks
  onProgress?: (percent: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
}
```

### React Native / Expo

```typescript
interface ExpoUploadOptions {
  // Same as above, plus:
  maxFileSize?: number; // Bytes
  allowedMimeTypes?: string[];
  chunkSize?: number; // Smaller for mobile: 1-5MB
  concurrentChunks?: number; // Fewer for mobile: 1-2
}
```

### Browser

```typescript
interface BrowserUploadOptions {
  // Fetch-based implementation
  method?: "POST" | "PUT";
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  signal?: AbortSignal; // For cancellation
}
```

## Error Handling

### React Example

```tsx
import { useUpload, UploadError } from "@uploadista/react";

export function UploadWithErrorHandling() {
  const { upload, error, retry } = useUpload({
    serverUrl: "https://api.example.com",
    onError: (err) => {
      if (err instanceof UploadError) {
        switch (err.code) {
          case "NETWORK_ERROR":
            console.log("No internet connection");
            break;
          case "SERVER_ERROR":
            console.log("Server error:", err.statusCode);
            break;
          case "TIMEOUT":
            console.log("Upload timed out");
            break;
          case "INVALID_FILE":
            console.log("File validation failed");
            break;
          case "CANCELLED":
            console.log("Upload cancelled");
            break;
        }
      }
    },
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      {error && (
        <div>
          <p>Error: {error.message}</p>
          <button onClick={retry}>Retry</button>
        </div>
      )}
    </div>
  );
}
```

## Monitoring Upload Progress

### WebSocket Real-Time Updates

```typescript
export function setupUploadStream(userId: string) {
  const ws = new WebSocket(
    "wss://api.example.com/api/stream"
  );

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);

    switch (message.type) {
      case "upload.progress":
        console.log(
          `Upload ${message.uploadId}: ${message.progress}%`
        );
        break;
      case "upload.complete":
        console.log(`Upload complete:`, message.result);
        break;
      case "upload.error":
        console.error(`Upload failed:`, message.error);
        break;
    }
  };

  return ws;
}
```

### Polling Fallback

```typescript
async function monitorUploadPolling(uploadId: string) {
  const poll = setInterval(async () => {
    const response = await fetch(
      `https://api.example.com/uploads/${uploadId}`
    );
    const upload = await response.json();

    console.log(`Progress: ${upload.progress}%`);

    if (upload.status === "completed" || upload.status === "error") {
      clearInterval(poll);
    }
  }, 1000); // Poll every second
}
```

## Performance Tips

### Image Uploads

```typescript
// Compress before upload
async function uploadOptimizedImage(file: File) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const img = new Image();
  img.onload = () => {
    // Resize to max 2000px
    const maxSize = 2000;
    const scale =
      Math.min(maxSize / img.width, maxSize / img.height, 1);
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        client.upload(new File([blob!], file.name));
      },
      "image/jpeg",
      0.85 // 85% quality
    );
  };

  img.src = URL.createObjectURL(file);
}
```

### Batch Uploads

```typescript
// Upload multiple files efficiently
async function uploadBatch(files: File[], batchSize = 3) {
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    await Promise.all(
      batch.map((file) =>
        client.upload(file)
      )
    );
  }
}
```

### Network-Aware Chunks

```typescript
// Adjust chunk size based on connection speed
async function detectConnectionSpeed(): Promise<number> {
  const start = performance.now();
  const response = await fetch(
    "https://api.example.com/health"
  );
  const elapsed = performance.now() - start;

  // Rough estimate of connection speed
  // Adjust chunk size accordingly
  if (elapsed > 500) return 1 * 1024 * 1024; // 1MB for slow
  if (elapsed > 200) return 5 * 1024 * 1024; // 5MB
  return 10 * 1024 * 1024; // 10MB for fast
}

const chunkSize = await detectConnectionSpeed();
const client = createUploadClient({
  serverUrl: "https://api.example.com",
  chunkSize,
});
```

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Fetch API | ✓ | ✓ | 10.1+ | ✓ |
| File API | ✓ | ✓ | 6+ | ✓ |
| Blob | ✓ | ✓ | 5+ | ✓ |
| FormData | ✓ | ✓ | 4+ | ✓ |
| WebSocket | ✓ | 11+ | 6+ | ✓ |
| Promise | ✓ | 29+ | 8+ | ✓ |

**Mobile Browser Support**:
- iOS Safari 10+
- Chrome Android 40+
- Firefox Android 68+

## Testing Uploads Locally

### Development Server

```bash
# Start test server
npm run dev

# In another terminal, test with:
curl -F "file=@test.jpg" http://localhost:3000/api/upload
```

### Mock Server for Development

```typescript
// Mock upload endpoint for testing
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";

const handlers = [
  http.post(
    "https://api.example.com/api/upload",
    async ({ request }) => {
      const formData = await request.formData();
      const file = formData.get("file");

      // Simulate upload delay
      await new Promise((r) => setTimeout(r, 2000));

      return HttpResponse.json({
        id: "upload-123",
        filename: (file as File).name,
        size: (file as File).size,
        url: "https://example.com/files/upload-123",
      });
    }
  ),
];

const server = setupServer(...handlers);
```

## Next Steps

1. **Server Setup**: See [SERVER_SETUP.md](./SERVER_SETUP.md) for backend configuration
2. **Flow Processing**: See [FLOW_NODES.md](./packages/flow/FLOW_NODES.md) for pipeline examples
3. **Advanced Features**:
   - Implement chunked uploads for large files
   - Add progress tracking with WebSockets
   - Configure flow processing on server
   - Set up monitoring and analytics

## Related Documentation

- [@uploadista/react](./packages/clients/react/README.md)
- [@uploadista/vue](./packages/clients/vue/README.md)
- [@uploadista/expo](./packages/clients/expo/README.md)
- [@uploadista/client-browser](./packages/clients/browser/README.md)
- [CLIENT_INTEGRATION.md](./CLIENT_INTEGRATION.md) (this file)
