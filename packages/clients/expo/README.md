# @uploadista/expo

Expo client for Uploadista - file uploads from mobile devices with Expo.

Provides Expo-specific implementations for file uploads, including:
- Direct file system access (async storage)
- Image picker and camera integration
- Optimized chunked uploads for mobile networks
- Resumable uploads with automatic retry

## Features

- **Expo Native APIs** - Uses Expo's DocumentPicker, ImagePicker, MediaLibrary
- **Automatic Resumption** - Resume failed uploads without re-uploading
- **Chunked Uploads** - Configurable chunk sizes for reliable transfers
- **Mobile-Optimized** - Handles network interruptions gracefully
- **TypeScript Support** - Full type safety for all APIs
- **Storage Integration** - AsyncStorage for upload state persistence
- **Camera Support** - Direct camera capture and upload
- **Image Library** - Pick and upload images from device library

## Installation

```bash
pnpm add @uploadista/expo expo expo-document-picker expo-image-picker
# or
npm install @uploadista/expo expo expo-document-picker expo-image-picker
# or
yarn add @uploadista/expo expo expo-document-picker expo-image-picker
```

## Requirements

- React Native 0.60+
- Expo 46+
- iOS 11+ or Android 6+
- TypeScript 5.0+ (optional but recommended)

## Quick Start

### 1. Create Uploadista Client

```typescript
import { createUploadistaClient } from '@uploadista/expo'

const client = createUploadistaClient({
  baseUrl: 'https://api.example.com',
  storageId: 'my-storage',
  chunkSize: 1024 * 1024, // 1MB chunks
})
```

### 2. Pick and Upload File from Device

```typescript
import { useUpload } from '@uploadista/expo'
import * as DocumentPicker from 'expo-document-picker'

export function FileUploadScreen() {
  const { state, upload } = useUpload()

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync()
    if (result.type === 'success') {
      await upload(result)
    }
  }

  return (
    <View>
      <TouchableOpacity onPress={handlePickFile}>
        <Text>Pick File</Text>
      </TouchableOpacity>

      {state.status === 'uploading' && (
        <Text>Progress: {Math.round(state.progress)}%</Text>
      )}
      {state.status === 'success' && <Text>Upload Complete!</Text>}
      {state.status === 'error' && <Text>Error: {state.error?.message}</Text>}
    </View>
  )
}
```

### 3. Upload from Camera

```typescript
import { useUpload } from '@uploadista/expo'
import * as ImagePicker from 'expo-image-picker'

export function CameraUploadScreen() {
  const { state, upload } = useUpload()

  const handleTakePhoto = async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'Images',
      quality: 0.8,
    })

    if (!result.canceled) {
      await upload(result.assets[0])
    }
  }

  return (
    <View>
      <TouchableOpacity onPress={handleTakePhoto}>
        <Text>Take Photo</Text>
      </TouchableOpacity>

      {state.status === 'uploading' && (
        <ProgressBar value={state.progress} max={100} />
      )}
      {state.status === 'success' && (
        <Text>Photo uploaded: {state.result?.filename}</Text>
      )}
    </View>
  )
}
```

### 4. Upload from Image Library

```typescript
import { useUpload } from '@uploadista/expo'
import * as ImagePicker from 'expo-image-picker'

export function ImageLibraryUploadScreen() {
  const { state, upload } = useUpload()

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'Images',
      multiple: false,
    })

    if (!result.canceled) {
      await upload(result.assets[0])
    }
  }

  return (
    <View>
      <TouchableOpacity onPress={handlePickImage}>
        <Text>Pick from Library</Text>
      </TouchableOpacity>

      {state.status === 'uploading' && (
        <Text>Uploading: {state.bytesUploaded} / {state.totalBytes} bytes</Text>
      )}
      {state.status === 'success' && (
        <Image source={{ uri: state.result?.filename }} />
      )}
    </View>
  )
}
```

## API Reference

### Client

#### `createUploadistaClient(options)`

Creates the Expo Uploadista client.

**Options:**
- `baseUrl` (string) - API base URL
- `storageId` (string) - Storage backend identifier
- `chunkSize` (number, optional) - Chunk size in bytes (default: 1MB)
- `concurrency` (number, optional) - Concurrent chunk uploads (default: 3)
- `maxRetries` (number, optional) - Max retries per chunk (default: 3)
- `timeout` (number, optional) - Request timeout in ms

**Returns:** UploadistaClient instance

```typescript
const client = createUploadistaClient({
  baseUrl: 'https://api.example.com',
  storageId: 'my-storage',
  chunkSize: 2 * 1024 * 1024, // 2MB chunks
  concurrency: 4,
  maxRetries: 5,
  timeout: 30000,
})
```

### Composables

#### `useUpload(options?)`

Single file upload composable.

**Returns:**
- `state` - Upload state (readonly)
  - `status` - 'idle' | 'uploading' | 'success' | 'error' | 'aborted'
  - `progress` - Progress 0-100
  - `bytesUploaded` - Bytes uploaded
  - `totalBytes` - Total file size
  - `result` - Upload result
  - `error` - Error object
- `upload(file, options?)` - Upload file
- `abort()` - Cancel upload
- `reset()` - Reset to idle
- `retry()` - Retry failed upload

**Options:**
- `onProgress(event)` - Progress callback
- `onComplete(result)` - Success callback
- `onError(error)` - Error callback

```typescript
const { state, upload, abort } = useUpload({
  onProgress: (event) => console.log(event.progress + '%'),
  onComplete: (result) => console.log('Uploaded:', result.filename),
  onError: (error) => console.error('Upload failed:', error),
})

// Upload file
await upload(file)

// Cancel
abort()
```

#### `useMultiUpload(options?)`

Multiple concurrent file uploads.

**Returns:**
- `uploads` - Array of upload items
- `stats` - Aggregate statistics
  - `totalFiles` - Total files
  - `completedFiles` - Successfully uploaded
  - `failedFiles` - Failed uploads
  - `totalBytes` - Total size
  - `uploadedBytes` - Bytes uploaded
  - `totalProgress` - Overall progress 0-100
  - `allComplete` - All finished
  - `hasErrors` - Any failures
- `add(files)` - Add files to queue
- `remove(uploadId)` - Remove upload
- `clear()` - Clear all
- `retryFailed()` - Retry failures

```typescript
const { uploads, stats, add, retryFailed } = useMultiUpload()

// Add files
await add([file1, file2, file3])

// Monitor progress
console.log(`${stats.value.uploadedBytes} / ${stats.value.totalBytes}`)

// Retry on failure
if (stats.value.hasErrors) {
  await retryFailed()
}
```

### Services

#### `createExpoServices(options?)`

Creates all Expo-specific services for the client.

**Returns:** Service container with implementations for:
- `fileReaderService` - Read file chunks
- `httpClient` - HTTP requests
- `storageService` - AsyncStorage persistence
- `base64Service` - Base64 encoding
- `idGenerationService` - ID generation
- `checksumService` - File hashing
- `websocketFactory` - WebSocket creation

```typescript
import { createExpoServices } from '@uploadista/expo'
import { createUploadistaClientCore } from '@uploadista/client-core'

const services = createExpoServices({
  asyncStorageKey: '@uploadista/uploads',
})

const client = createUploadistaClientCore({
  endpoint: 'https://api.example.com',
  services,
})
```

#### File System Provider (Legacy)

```typescript
import { ExpoFileSystemProvider } from '@uploadista/expo'

const provider = new ExpoFileSystemProvider()

// Pick image from camera
const photoResult = await provider.pickImage({ camera: true })

// Pick from library
const libraryResult = await provider.pickImage({ camera: false })

// Pick document
const documentResult = await provider.pickDocument()
```

## Configuration

### Permissions

Add required permissions to `app.json`:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-image-picker",
        {
          "photosPermission": "Allow $(PRODUCT_NAME) to access photos.",
          "cameraPermission": "Allow $(PRODUCT_NAME) to access camera."
        }
      ],
      [
        "expo-document-picker",
        {
          "iCloudPermission": "Allow $(PRODUCT_NAME) to access iCloud."
        }
      ]
    ]
  }
}
```

### Chunk Size Configuration

Choose chunk sizes based on network conditions:

**Fast Networks (WiFi):**
```typescript
const client = createUploadistaClient({
  chunkSize: 5 * 1024 * 1024, // 5MB chunks
  concurrency: 6,
})
```

**Mobile Networks (LTE/4G):**
```typescript
const client = createUploadistaClient({
  chunkSize: 2 * 1024 * 1024, // 2MB chunks
  concurrency: 3,
})
```

**Slow Networks (3G/Edge):**
```typescript
const client = createUploadistaClient({
  chunkSize: 512 * 1024, // 512KB chunks
  concurrency: 2,
})
```

## Examples

### Complete Upload Screen

```typescript
import { useUpload } from '@uploadista/expo'
import * as ImagePicker from 'expo-image-picker'
import {
  View,
  TouchableOpacity,
  Text,
  Image,
  ProgressBarAndroidBase,
} from 'react-native'

export function UploadPhotoScreen() {
  const { state, upload, abort } = useUpload()

  const pickAndUpload = async () => {
    // Request permissions
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) return

    // Pick image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'Images',
      quality: 0.8,
    })

    if (!result.canceled) {
      // Upload
      await upload(result.assets[0])
    }
  }

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {state.status === 'idle' && (
        <TouchableOpacity onPress={pickAndUpload}>
          <Text style={{ fontSize: 18 }}>Pick and Upload Photo</Text>
        </TouchableOpacity>
      )}

      {state.status === 'uploading' && (
        <View style={{ width: '80%' }}>
          <ProgressBarAndroidBase
            styleAttr="Horizontal"
            indeterminate={false}
            progress={state.progress / 100}
          />
          <Text>
            {Math.round(state.progress)}% - {Math.round(state.bytesUploaded / 1024 / 1024)}MB /
            {Math.round(state.totalBytes! / 1024 / 1024)}MB
          </Text>
          <TouchableOpacity onPress={abort}>
            <Text style={{ color: 'red' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {state.status === 'success' && (
        <View>
          <Image source={{ uri: state.result?.filename }} style={{ width: 200, height: 200 }} />
          <Text>Upload successful!</Text>
          <Text>File: {state.result?.filename}</Text>
        </View>
      )}

      {state.status === 'error' && (
        <View>
          <Text style={{ color: 'red' }}>Upload failed</Text>
          <Text>{state.error?.message}</Text>
          <TouchableOpacity onPress={() => upload(/* file */)}>
            <Text>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
```

### Multiple Files Upload

```typescript
import { useMultiUpload } from '@uploadista/expo'
import * as ImagePicker from 'expo-image-picker'
import { FlatList, View } from 'react-native'

export function MultiUploadScreen() {
  const { uploads, stats, add } = useMultiUpload()

  const pickMultiple = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'Images',
      multiple: true,
    })

    if (!result.canceled) {
      await add(result.assets)
    }
  }

  return (
    <View>
      <Button title="Add Photos" onPress={pickMultiple} />

      <Text>
        {stats.value.completedFiles} / {stats.value.totalFiles} uploaded
      </Text>

      <FlatList
        data={uploads}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View>
            <Text>{item.filename}</Text>
            <Text>{Math.round(item.progress)}%</Text>
            <Text>{item.state.status}</Text>
          </View>
        )}
      />
    </View>
  )
}
```

## Troubleshooting

### Permission Denied Errors

Ensure permissions are requested before accessing files:

```typescript
const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
if (!granted) {
  alert('Permission to access media library is required')
}
```

### Network Interruptions

Uploads automatically resume from the last successful chunk. To manually retry:

```typescript
const { state, retry } = useUpload()

if (state.value.status === 'error') {
  await retry()
}
```

### Memory Issues with Large Files

Use smaller chunk sizes for large files:

```typescript
const client = createUploadistaClient({
  chunkSize: 512 * 1024, // Smaller chunks use less memory
  concurrency: 1,
})
```

### Slow Uploads

Increase chunk size and concurrency for faster networks:

```typescript
const client = createUploadistaClient({
  chunkSize: 5 * 1024 * 1024,
  concurrency: 5,
})
```

## Related Packages

- **[@uploadista/client-core](../core/)** - Core client and types
- **[@uploadista/react-native-core](../react-native-core/)** - React Native composables
- **[@uploadista/client-browser](../browser/)** - Browser client implementation

## TypeScript Support

Full TypeScript support included. Type definitions for all APIs:

```typescript
import type {
  UploadistaClientOptions,
  UploadState,
  UseUploadOptions,
  UseMultiUploadOptions,
  ExpoServiceOptions,
} from '@uploadista/expo'
```

## Performance Tips

1. **Chunk Size** - Larger chunks (2-5MB) for fast networks, smaller (512KB) for slow
2. **Concurrency** - Balance between 2-6 concurrent chunks based on network
3. **Compression** - Pre-compress large files before upload (images, videos)
4. **Resumption** - Automatically handled; failed chunks restart without re-uploading
5. **Background Upload** - Consider using Background Tasks for long uploads

## License

MIT
