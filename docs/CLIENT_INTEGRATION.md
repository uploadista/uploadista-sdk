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

> **Important**: All React hooks (`useUpload`, `useMultiUpload`, `useFlowUpload`, etc.) must be used within an `UploadistaProvider`. Set up the provider first before using any hooks.

### Basic Setup

```bash
npm install @uploadista/react @uploadista/client-browser
```

### Provider Setup (Required)

**All Uploadista hooks require the `UploadistaProvider` to be setup at the root of your application.** This provider creates a shared upload client instance and manages WebSocket connections for real-time updates.

```tsx
import { UploadistaProvider } from "@uploadista/react";

function App() {
  return (
    <UploadistaProvider
      baseUrl="https://api.example.com"
      storageId="default"
      chunkSize={5 * 1024 * 1024} // 5MB chunks
      storeFingerprintForResuming={true} // Enable resumable uploads
      onEvent={(event) => {
        // Global event handler for all uploads
        console.log("Upload event:", event);
      }}
    >
      <YourApp />
    </UploadistaProvider>
  );
}
```

#### Provider Configuration Options

```tsx
interface UploadistaProviderProps {
  children: React.ReactNode;

  // Required
  baseUrl: string; // API base URL (e.g., "https://api.example.com")

  // Optional configuration
  storageId?: string; // Default storage ID (default: "local")
  uploadistaBasePath?: string; // API path prefix (default: "uploadista")
  chunkSize?: number; // Chunk size in bytes (default: 5MB)
  parallelUploads?: number; // Max parallel uploads (default: 1)
  parallelChunkSize?: number; // Size for parallel chunk uploads
  storeFingerprintForResuming?: boolean; // Enable resumable uploads (default: true)

  // Advanced options
  retryDelays?: number[]; // Retry delays in ms (default: [1000, 3000, 5000])
  uploadStrategy?: "sequential" | "parallel" | "adaptive"; // Upload strategy
  smartChunking?: boolean; // Dynamic chunk size adjustment
  networkMonitoring?: boolean; // Network condition monitoring
  uploadMetrics?: boolean; // Performance metrics collection
  connectionPooling?: boolean; // HTTP connection pooling

  // Authentication
  auth?: {
    headers?: Record<string, string>; // Custom headers (e.g., Authorization)
  };

  // Events
  onEvent?: (event: UploadistaEvent) => void; // Global event handler
}
```

#### Example with Authentication

```tsx
import { UploadistaProvider } from "@uploadista/react";

function App() {
  const [authToken, setAuthToken] = useState<string>();

  useEffect(() => {
    // Get auth token from your auth provider
    getAuthToken().then(setAuthToken);
  }, []);

  return (
    <UploadistaProvider
      baseUrl="https://api.example.com"
      storageId="s3-bucket"
      auth={{
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : undefined,
        },
      }}
    >
      <YourApp />
    </UploadistaProvider>
  );
}
```

### Simple Upload Component

```tsx
import { useUpload } from "@uploadista/react";

export function UploadForm() {
  const upload = useUpload({
    onSuccess: (result) => console.log("Upload done:", result),
    onError: (error) => console.error("Upload failed:", error),
    onProgress: (progress) => console.log("Progress:", progress + "%"),
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.upload(file);
        }}
        disabled={upload.isUploading}
      />
      {upload.isUploading && <progress value={upload.state.progress} max={100} />}
      {upload.state.error && <p style={{ color: "red" }}>{upload.state.error.message}</p>}
      {upload.canRetry && <button onClick={upload.retry}>Retry</button>}
    </div>
  );
}
```

### Advanced: Multiple Files with Progress

```tsx
import { useMultiUpload } from "@uploadista/react";

export function MultiUploadForm() {
  const multiUpload = useMultiUpload({
    maxConcurrent: 3,
    onUploadSuccess: (item, result) => {
      console.log(`${item.file.name} uploaded successfully`);
    },
    onComplete: (results) => {
      console.log("All done:", results);
    },
  });

  return (
    <div>
      <input
        type="file"
        multiple
        onChange={(e) => {
          if (e.target.files) {
            multiUpload.addFiles(Array.from(e.target.files));
            multiUpload.startAll();
          }
        }}
      />

      <div>Progress: {multiUpload.state.progress}%</div>
      <div>
        {multiUpload.state.uploading} uploading,
        {multiUpload.state.successful} successful,
        {multiUpload.state.failed} failed
      </div>

      <button onClick={multiUpload.abortAll} disabled={!multiUpload.state.isUploading}>
        Abort All
      </button>
      <button onClick={multiUpload.retryFailed} disabled={multiUpload.state.failed === 0}>
        Retry Failed
      </button>

      {multiUpload.items.map((item) => (
        <div key={item.id}>
          <p>{item.file instanceof File ? item.file.name : 'File'}</p>
          <progress value={item.state.progress} max={100} />
          <span>{item.state.status}</span>
          {item.state.status === 'uploading' && (
            <button onClick={() => multiUpload.abortUpload(item.id)}>Cancel</button>
          )}
        </div>
      ))}
    </div>
  );
}
```

### With Metadata

You can attach custom metadata to individual uploads:

```tsx
import { useUpload } from "@uploadista/react";

export function UploadWithMetadata() {
  const upload = useUpload({
    metadata: {
      userId: "user-123",
      uploadedBy: "john@example.com",
      category: "profile-images",
    },
    onSuccess: (result) => {
      console.log("Upload complete with metadata:", result);
    },
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.upload(file);
        }}
      />
    </div>
  );
}
```

> **Note**: For authentication headers (like JWT tokens), configure them at the provider level using the `auth.headers` option. See the Provider Setup section above.

### Drag & Drop Upload

```tsx
import { useDragDrop, useMultiUpload } from "@uploadista/react";

export function DragDropUpload() {
  const multiUpload = useMultiUpload({
    maxConcurrent: 3,
    onComplete: (results) => {
      console.log("All uploads complete:", results);
    },
  });

  const dragDrop = useDragDrop({
    accept: ["image/*", "video/*", ".pdf"],
    maxFiles: 10,
    maxFileSize: 50 * 1024 * 1024, // 50MB
    onFilesReceived: (files) => {
      multiUpload.addFiles(files);
      multiUpload.startAll();
    },
    onValidationError: (errors) => {
      console.error("Validation errors:", errors);
    },
  });

  return (
    <div>
      <div
        {...dragDrop.dragHandlers}
        onClick={dragDrop.openFilePicker}
        style={{
          border: dragDrop.state.isDragging ? "2px solid blue" : "2px dashed gray",
          padding: "20px",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <input {...dragDrop.inputProps} />
        {dragDrop.state.isDragging ? (
          <p>Drop files here...</p>
        ) : (
          <p>Drag files or click to select</p>
        )}

        {dragDrop.state.errors.length > 0 && (
          <div style={{ color: "red" }}>
            {dragDrop.state.errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
          </div>
        )}
      </div>

      {multiUpload.items.map((item) => (
        <div key={item.id}>
          <span>{item.file instanceof File ? item.file.name : 'File'}</span>
          <progress value={item.state.progress} max={100} />
        </div>
      ))}
    </div>
  );
}
```

### Upload with Processing (Flows)

```tsx
import { useFlowUpload } from "@uploadista/react";

export function ProcessingUpload() {
  const flowUpload = useFlowUpload({
    flowConfig: {
      flowId: "optimize-flow",
      storageId: "local",
      // Optional: specify which output node's result to use
      outputNodeId: "optimized-output",
    },
    onSuccess: (result) => {
      // result is from the specified output node (or first output if not specified)
      console.log("Processed file:", result);
    },
    onFlowComplete: (outputs) => {
      // outputs contains all output nodes' results
      console.log("All outputs:", outputs);
      // e.g., { thumbnail: {...}, optimized: {...}, original: {...} }
    },
    onError: (error) => {
      console.error("Flow upload failed:", error);
    },
  });

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) flowUpload.upload(file);
        }}
        disabled={flowUpload.isUploading}
      />

      {flowUpload.isUploadingFile && (
        <div>Uploading... {flowUpload.state.progress}%</div>
      )}

      {flowUpload.isProcessing && (
        <div>
          Processing...
          {flowUpload.state.currentNodeName && (
            <span> (Current: {flowUpload.state.currentNodeName})</span>
          )}
        </div>
      )}

      {flowUpload.state.jobId && <div>Job ID: {flowUpload.state.jobId}</div>}

      {flowUpload.state.status === "success" && flowUpload.state.result && (
        <div>
          <p>Upload complete!</p>
          <img src={flowUpload.state.result.url} alt="Processed" />
        </div>
      )}

      {flowUpload.state.error && (
        <p style={{ color: "red" }}>{flowUpload.state.error.message}</p>
      )}

      {flowUpload.isUploading && (
        <button onClick={flowUpload.abort}>Cancel</button>
      )}
    </div>
  );
}
```

### Configuration Options

> **Note**: Most configuration is done at the provider level with `UploadistaProvider`. Individual upload hooks accept only options specific to that upload.

```tsx
// useUpload options
interface UseUploadOptions {
  metadata?: Record<string, string>;
  uploadLengthDeferred?: boolean;
  uploadSize?: number;
  onProgress?: (progress: number, bytesUploaded: number, totalBytes: number | null) => void;
  onChunkComplete?: (chunkSize: number, bytesAccepted: number, bytesTotal: number | null) => void;
  onSuccess?: (result: UploadFile) => void;
  onError?: (error: Error) => void;
  onAbort?: () => void;
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}

// useMultiUpload options
interface MultiUploadOptions {
  maxConcurrent?: number; // Default: 3
  metadata?: Record<string, string>;
  onUploadStart?: (item: UploadItem) => void;
  onUploadProgress?: (item: UploadItem, progress: number, bytesUploaded: number, totalBytes: number | null) => void;
  onUploadSuccess?: (item: UploadItem, result: UploadFile) => void;
  onUploadError?: (item: UploadItem, error: Error) => void;
  onComplete?: (results: { successful: UploadItem[]; failed: UploadItem[]; total: number }) => void;
}

// useFlowUpload options
interface FlowUploadOptions<TOutput> {
  flowConfig: {
    flowId: string;
    storageId: string;
    outputNodeId?: string; // Optional: specify which output node to use
  };
  onProgress?: (progress: number, bytesUploaded: number, totalBytes: number | null) => void;
  onSuccess?: (result: TOutput) => void;
  onFlowComplete?: (outputs: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  onAbort?: () => void;
}

// useDragDrop options
interface DragDropOptions {
  accept?: string[]; // MIME types or file extensions
  maxFiles?: number;
  maxFileSize?: number; // bytes
  multiple?: boolean;
  validator?: (files: File[]) => string[] | null;
  onFilesReceived?: (files: File[]) => void;
  onValidationError?: (errors: string[]) => void;
}
```

## Vue 3

> **Important**: All Vue composables (`useUpload`, `useMultiUpload`, `useFlowUpload`, etc.) must be used within an `UploadistaProvider` component. Set up the provider first before using any composables.

### Basic Setup

```bash
npm install @uploadista/vue @uploadista/client-browser
```

### Provider Setup (Required)

**All Uploadista composables require the `UploadistaProvider` component to be setup at the root of your application.** This provider creates a shared upload client instance and manages WebSocket connections for real-time updates.

```vue
<template>
  <UploadistaProvider
    :server-url="serverUrl"
    storage-id="default"
    :chunk-size="5 * 1024 * 1024"
    :store-fingerprint-for-resuming="true"
    @event="handleEvent"
  >
    <YourApp />
  </UploadistaProvider>
</template>

<script setup lang="ts">
import { UploadistaProvider } from "@uploadista/vue";

const serverUrl = "https://api.example.com";

const handleEvent = (event) => {
  console.log("Upload event:", event);
};
</script>
```

#### Provider Props

```typescript
interface UploadistaProviderProps {
  // Required
  serverUrl: string; // API base URL (e.g., "https://api.example.com")

  // Optional configuration
  storageId?: string; // Default storage ID (default: "local")
  uploadistaBasePath?: string; // API path prefix (default: "uploadista")
  chunkSize?: number; // Chunk size in bytes (default: 1MB)
  parallelUploads?: number; // Max parallel uploads (default: 1)
  storeFingerprintForResuming?: boolean; // Enable resumable uploads (default: true)

  // Events
  onEvent?: (event: UploadistaEvent) => void; // Global event handler
}
```

#### Example in main.ts/App.vue

```vue
<!-- App.vue -->
<template>
  <UploadistaProvider
    server-url="https://api.example.com"
    storage-id="s3-bucket"
    :chunk-size="5 * 1024 * 1024"
  >
    <RouterView />
  </UploadistaProvider>
</template>

<script setup lang="ts">
import { UploadistaProvider } from "@uploadista/vue";
</script>
```

### Simple Upload

```vue
<template>
  <div>
    <input
      type="file"
      @change="selectFile"
      :disabled="upload.isUploading.value"
    />
    <progress v-if="upload.isUploading.value" :value="upload.state.value.progress" max="100" />
    <p v-if="upload.state.value.error" style="color: red">{{ upload.state.value.error.message }}</p>
    <button v-if="upload.canRetry.value" @click="upload.retry">Retry</button>
  </div>
</template>

<script setup lang="ts">
import { useUpload } from "@uploadista/vue";

const upload = useUpload({
  onSuccess: (result) => {
    console.log("Done:", result);
  },
  onError: (error) => {
    console.error("Failed:", error);
  },
  onProgress: (progress) => {
    console.log("Progress:", progress + "%");
  },
});

const selectFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) upload.upload(file);
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
      @change="handleFileChange"
    />

    <div>Progress: {{ multiUpload.state.value.progress }}%</div>
    <div>
      {{ multiUpload.state.value.uploading }} uploading,
      {{ multiUpload.state.value.successful }} successful,
      {{ multiUpload.state.value.failed }} failed
    </div>

    <button @click="multiUpload.abortAll" :disabled="!multiUpload.state.value.isUploading">
      Abort All
    </button>
    <button @click="multiUpload.retryFailed" :disabled="multiUpload.state.value.failed === 0">
      Retry Failed
    </button>

    <div v-for="item in multiUpload.items.value" :key="item.id">
      <p>{{ item.file instanceof File ? item.file.name : 'File' }}</p>
      <progress :value="item.state.progress" max="100" />
      <span>{{ item.state.status }}</span>
      <button v-if="item.state.status === 'uploading'" @click="multiUpload.abortUpload(item.id)">
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useMultiUpload } from "@uploadista/vue";

const multiUpload = useMultiUpload({
  maxConcurrent: 3,
  onUploadSuccess: (item, result) => {
    console.log(`${item.file.name} uploaded successfully`);
  },
  onComplete: (results) => {
    console.log("All done:", results);
  },
});

const handleFileChange = (e: Event) => {
  const files = Array.from((e.target as HTMLInputElement).files || []);
  if (files.length) {
    multiUpload.addFiles(files);
    multiUpload.startAll();
  }
};
</script>
```

### Drag & Drop Zone

```vue
<template>
  <div>
    <div
      v-bind="dragDrop.dragHandlers.value"
      @click="dragDrop.openFilePicker"
      :style="{
        border: dragDrop.state.value.isDragging ? '2px solid blue' : '2px dashed gray',
        padding: '20px',
        cursor: 'pointer',
      }"
    >
      <input v-bind="dragDrop.inputProps.value" />
      <p v-if="dragDrop.state.value.isDragging">Drop files here...</p>
      <p v-else>Drag files or click to select</p>

      <div v-if="dragDrop.state.value.errors.length > 0" style="color: red">
        <p v-for="(error, i) in dragDrop.state.value.errors" :key="i">{{ error }}</p>
      </div>
    </div>

    <div v-for="item in multiUpload.items.value" :key="item.id">
      <span>{{ item.file instanceof File ? item.file.name : 'File' }}</span>
      <progress :value="item.state.progress" max="100" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useDragDrop, useMultiUpload } from "@uploadista/vue";

const multiUpload = useMultiUpload({
  maxConcurrent: 3,
  onComplete: (results) => {
    console.log("All uploads complete:", results);
  },
});

const dragDrop = useDragDrop({
  accept: ["image/*", "video/*", ".pdf"],
  maxFiles: 10,
  maxFileSize: 50 * 1024 * 1024, // 50MB
  onFilesReceived: (files) => {
    multiUpload.addFiles(files);
    multiUpload.startAll();
  },
  onValidationError: (errors) => {
    console.error("Validation errors:", errors);
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
      :disabled="flowUpload.isUploading.value"
    />

    <div v-if="flowUpload.isUploadingFile.value">
      Uploading... {{ flowUpload.state.value.progress }}%
    </div>

    <div v-if="flowUpload.isProcessing.value">
      Processing...
      <span v-if="flowUpload.state.value.currentNodeName">
        (Current: {{ flowUpload.state.value.currentNodeName }})
      </span>
    </div>

    <div v-if="flowUpload.state.value.jobId">
      Job ID: {{ flowUpload.state.value.jobId }}
    </div>

    <div v-if="flowUpload.state.value.status === 'success' && flowUpload.state.value.result">
      <p>Upload complete!</p>
      <img :src="flowUpload.state.value.result.url" alt="Processed" />
    </div>

    <p v-if="flowUpload.state.value.error" style="color: red">
      {{ flowUpload.state.value.error.message }}
    </p>

    <button v-if="flowUpload.isUploading.value" @click="flowUpload.abort">
      Cancel
    </button>
  </div>
</template>

<script setup lang="ts">
import { useFlowUpload } from "@uploadista/vue";

const flowUpload = useFlowUpload({
  flowConfig: {
    flowId: "optimize-flow",
    storageId: "local",
    outputNodeId: "optimized-output", // Optional
  },
  onSuccess: (result) => {
    console.log("Processed file:", result);
  },
  onFlowComplete: (outputs) => {
    console.log("All outputs:", outputs);
  },
  onError: (error) => {
    console.error("Flow upload failed:", error);
  },
});

const selectFile = (e: Event) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) flowUpload.upload(file);
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
import { useUpload } from "@uploadista/react";

export function UploadWithErrorHandling() {
  const upload = useUpload({
    onError: (error) => {
      console.error("Upload failed:", error);
      // Handle error based on message or custom logic
      if (error.message.includes("network")) {
        console.log("No internet connection");
      } else if (error.message.includes("timeout")) {
        console.log("Upload timed out");
      }
    },
    onShouldRetry: (error, retryAttempt) => {
      // Custom retry logic
      if (retryAttempt >= 3) return false;
      // Retry on network errors
      return error.message.includes("network");
    },
  });

  return (
    <div>
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload.upload(file);
        }}
        disabled={upload.isUploading}
      />

      {upload.state.status === "error" && upload.state.error && (
        <div>
          <p>Error: {upload.state.error.message}</p>
          {upload.canRetry && (
            <button onClick={upload.retry}>Retry</button>
          )}
        </div>
      )}

      {upload.state.status === "success" && (
        <p>Upload successful!</p>
      )}
    </div>
  );
}
```

## Monitoring Upload Progress

> **Note**: Real-time progress updates are automatically handled through the `UploadistaProvider` context. WebSocket connections and event subscriptions are managed internally. You don't need to manually set up WebSocket connections or polling.

All upload hooks (`useUpload`, `useMultiUpload`, `useFlowUpload`) automatically receive real-time progress updates through:

1. **onProgress callbacks**: Called during file upload chunks
2. **Flow events**: Automatically subscribed when using `useFlowUpload`
3. **State updates**: All hooks update their `.state` with current progress

Example of monitoring progress:

```tsx
const upload = useUpload({
  onProgress: (progress, bytesUploaded, totalBytes) => {
    console.log(`${progress}% - ${bytesUploaded}/${totalBytes} bytes`);
  },
  onChunkComplete: (chunkSize, bytesAccepted, bytesTotal) => {
    console.log(`Chunk complete: ${chunkSize} bytes`);
  },
});

// Access progress in state
console.log(upload.state.progress); // 0-100
console.log(upload.state.bytesUploaded);
console.log(upload.state.totalBytes);
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
