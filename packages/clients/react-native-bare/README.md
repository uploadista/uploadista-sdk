# @uploadista/react-native-bare

Bare React Native file upload client for Uploadista - for projects without Expo.

This package provides Uploadista integration for bare (non-Expo) React Native projects. It uses native libraries for file system access, camera, and gallery operations.

## Features

- **Bare React Native Support** - Works in non-Expo React Native projects
- **Native Libraries** - Uses industry-standard React Native libraries
- **iOS & Android** - Full support for iOS and Android platforms
- **Progress Tracking** - Real-time upload progress and metrics
- **Camera & Gallery** - Native camera and photo library integration
- **File Picking** - Document and file selection
- **TypeScript** - Full type safety and IDE support
- **Resumable Uploads** - Automatic resume on network interruption

## Installation

### 1. Install Dependencies

```bash
npm install @uploadista/react-native-bare @uploadista/client-core
npm install react-native-document-picker react-native-image-picker rn-fetch-blob
```

### 2. Link Native Modules

```bash
cd ios && pod install && cd ..
```

For Android, usually no additional linking is needed with modern React Native versions.

### 3. Request Permissions

#### iOS (Info.plist)

```xml
<dict>
  <key>NSCameraUsageDescription</key>
  <string>Allow app to access camera for photo uploads</string>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>Allow app to access photo library for uploads</string>
  <key>NSDocumentsUsageDescription</key>
  <string>Allow app to access documents for uploads</string>
</dict>
```

#### Android (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.INTERNET" />
```

Also request permissions at runtime:

```typescript
import { PermissionsAndroid } from 'react-native'

const requestPermissions = async () => {
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    ])
    return granted
  } catch (err) {
    console.warn(err)
  }
}
```

## Quick Start

### 1. Create Client

```typescript
import { createUploadistaClient } from '@uploadista/react-native-bare'

const client = createUploadistaClient({
  baseUrl: 'https://api.example.com',
  storageId: 'my-storage',
  chunkSize: 1024 * 1024, // 1MB chunks
})
```

### 2. Setup Provider

```typescript
import React from 'react'
import { BareRNUploadistaProvider } from '@uploadista/react-native-bare'

export default function App() {
  return (
    <BareRNUploadistaProvider client={client}>
      <YourApp />
    </BareRNUploadistaProvider>
  )
}
```

### 3. Use Upload Hooks

```typescript
import { useUpload } from '@uploadista/react-native-bare'
import { View, Button, Text } from 'react-native'
import DocumentPicker from 'react-native-document-picker'

export function FileUploadScreen() {
  const { state, upload } = useUpload()

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
      })

      await upload(result[0])
    } catch (err) {
      console.error('Error picking file:', err)
    }
  }

  return (
    <View>
      <Button title="Pick File" onPress={handlePickFile} />

      {state.status === 'uploading' && (
        <Text>Uploading: {Math.round(state.progress)}%</Text>
      )}
      {state.status === 'success' && (
        <Text>Upload complete! File ID: {state.result?.id}</Text>
      )}
      {state.status === 'error' && (
        <Text>Error: {state.error?.message}</Text>
      )}
    </View>
  )
}
```

## Camera Upload Example

```typescript
import { useUpload } from '@uploadista/react-native-bare'
import { View, Button, Text, Image } from 'react-native'
import ImagePicker from 'react-native-image-picker'

export function CameraUploadScreen() {
  const { state, upload } = useUpload()
  const [photoUri, setPhotoUri] = React.useState<string | null>(null)

  const handleTakePhoto = () => {
    ImagePicker.launchCamera(
      {
        mediaType: 'photo',
        includeBase64: false,
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.8,
      },
      async (response) => {
        if (response.didCancel) {
          console.log('User cancelled image picker')
        } else if (response.errorMessage) {
          console.log('ImagePicker Error:', response.errorMessage)
        } else if (response.assets && response.assets[0]) {
          const asset = response.assets[0]
          setPhotoUri(asset.uri)

          // Upload the photo
          await upload({
            uri: asset.uri!,
            name: asset.fileName || 'photo.jpg',
            type: asset.type || 'image/jpeg',
          })
        }
      },
    )
  }

  return (
    <View>
      <Button title="Take Photo" onPress={handleTakePhoto} />

      {photoUri && !state.status.uploading && <Image source={{ uri: photoUri }} />}

      {state.status === 'uploading' && (
        <Text>Uploading: {Math.round(state.progress)}%</Text>
      )}
      {state.status === 'success' && <Text>Photo uploaded successfully!</Text>}
      {state.status === 'error' && (
        <Text>Upload failed: {state.error?.message}</Text>
      )}
    </View>
  )
}
```

## Photo Library Upload Example

```typescript
import { useUpload } from '@uploadista/react-native-bare'
import { View, Button, Text } from 'react-native'
import ImagePicker from 'react-native-image-picker'

export function PhotoLibraryUploadScreen() {
  const { state, upload } = useUpload()

  const handlePickPhoto = () => {
    ImagePicker.launchImageLibrary(
      {
        mediaType: 'photo',
        selectionLimit: 1,
        maxWidth: 1920,
        maxHeight: 1920,
      },
      async (response) => {
        if (!response.didCancel && response.assets && response.assets[0]) {
          const asset = response.assets[0]
          await upload({
            uri: asset.uri!,
            name: asset.fileName || 'photo.jpg',
            type: asset.type || 'image/jpeg',
          })
        }
      },
    )
  }

  return (
    <View>
      <Button title="Pick from Library" onPress={handlePickPhoto} />
      {state.status === 'uploading' && (
        <Text>Progress: {Math.round(state.progress)}%</Text>
      )}
    </View>
  )
}
```

## API Reference

### Client Factory

#### `createUploadistaClient(options)`

Creates a bare React Native Uploadista client.

**Options:**
- `baseUrl` (string) - API server URL
- `storageId` (string) - Storage backend identifier
- `chunkSize` (number, optional) - Chunk size in bytes (default: 1MB)
- `concurrency` (number, optional) - Concurrent chunks (default: 3)
- `maxRetries` (number, optional) - Max retries per chunk (default: 3)
- `timeout` (number, optional) - Request timeout (default: 30s)

### Hooks

#### `useUpload(options?)`

Single file upload with progress tracking.

**Returns:**
- `state` - Upload state (readonly)
  - `status` - 'idle' | 'uploading' | 'success' | 'error' | 'aborted'
  - `progress` - Progress 0-100
  - `bytesUploaded` - Bytes uploaded
  - `totalBytes` - Total file size
  - `result` - Upload result on success
  - `error` - Error on failure
- `upload(file, options?)` - Start upload
- `abort()` - Cancel upload
- `reset()` - Reset to idle state
- `retry()` - Retry failed upload

**Options:**
- `onProgress(event)` - Progress callback
- `onComplete(result)` - Success callback
- `onError(error)` - Error callback

#### `useMultiUpload(options?)`

Multiple concurrent uploads.

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
- `clear()` - Clear all uploads
- `retryFailed()` - Retry failures

### Supported File Types

Works with file objects from:
- **react-native-document-picker** - Documents
- **react-native-image-picker** - Photos and videos
- **Native file URIs** - File system paths

```typescript
// All these formats are supported:
{
  uri: 'file:///path/to/file',
  name: 'document.pdf',
  type: 'application/pdf'
}
```

## Troubleshooting

### Permission Denied on Android

Request runtime permissions:

```typescript
import { PermissionsAndroid } from 'react-native'

const requestPermissions = async () => {
  try {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.CAMERA,
      PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
    ]
    const granted = await PermissionsAndroid.requestMultiple(permissions)
    return Object.values(granted).every(
      (p) => p === PermissionsAndroid.RESULTS.GRANTED,
    )
  } catch (err) {
    console.warn(err)
    return false
  }
}

// Use in component
const hasPermissions = await requestPermissions()
```

### Native Module Not Linked

If you see "Native module not linked" errors:

1. **iOS:** Ensure pods are installed:
   ```bash
   cd ios && pod install && cd ..
   ```

2. **Android:** Check gradle sync is complete:
   ```bash
   ./gradlew clean build
   ```

### Upload Fails on Large Files

Use smaller chunks for large files:

```typescript
const client = createUploadistaClient({
  baseUrl: 'https://api.example.com',
  storageId: 'my-storage',
  chunkSize: 512 * 1024, // 512KB chunks for large files
  concurrency: 2,
})
```

### Memory Issues

1. Compress images before upload:
   ```typescript
   // Use react-native-image-crop-picker or similar
   const compressedImage = await compress(image)
   await upload(compressedImage)
   ```

2. Limit concurrent uploads:
   ```typescript
   const client = createUploadistaClient({
     concurrency: 2, // Lower concurrency for low-RAM devices
   })
   ```

## Performance Tips

1. **Chunk Size** - Use 2-5MB for fast networks, 512KB-1MB for slow networks
2. **Concurrency** - Balance between 2-4 based on device capabilities
3. **Image Compression** - Pre-compress images to reduce upload size
4. **Resumption** - Automatic, but test on slow networks
5. **Background Tasks** - Consider using native background task libraries

## Platform-Specific Notes

### iOS

- Minimum iOS 11
- Requires camera and photo library permissions
- Large file uploads should use smaller chunks due to memory constraints

### Android

- Minimum Android 6 (API 23)
- Request runtime permissions at app start
- Scoped storage (Android 10+) automatically handled
- Large files may need smaller chunks on low-RAM devices

## Related Packages

- **[@uploadista/react-native-core](../react-native-core/)** - Core React Native types
- **[@uploadista/expo](../expo/)** - For Expo-managed projects
- **[@uploadista/client-core](../../core/)** - Core client types

## TypeScript Support

Full TypeScript support with strict typing:

```typescript
import type {
  UploadState,
  UseUploadOptions,
  UseMultiUploadOptions,
  BareRNUploadInput,
} from '@uploadista/react-native-bare'
```

## License

MIT
