# @uploadista/react-native

React Native client for Uploadista with mobile-optimized upload patterns and support for both Expo-managed and bare React Native environments.

## Overview

`@uploadista/react-native` provides a first-class React Native integration for Uploadista, enabling seamless file uploads and flow management on iOS and Android. The client abstracts platform differences and provides idiomatic React Native patterns for:

- **Single file uploads** - Upload one file with progress tracking
- **Multi-file uploads** - Concurrent uploads with batch management
- **Flow uploads** - Orchestrated uploads through processing pipelines
- **Camera uploads** - Direct camera capture and upload
- **Gallery uploads** - Photo/video library selection and upload
- **File picker uploads** - Generic document selection

## Features

- ✅ **Expo and Bare RN Support** - Works with both Expo-managed and bare React Native workflows
- ✅ **iOS & Android** - Full support for iOS 14+ and Android 7+
- ✅ **File System Abstraction** - Pluggable providers for different environments
- ✅ **Mobile Patterns** - Camera, gallery, and file picker integrations
- ✅ **Progress Tracking** - Real-time upload progress and metrics
- ✅ **WebSocket Support** - Flow uploads with real-time events
- ✅ **Type Safe** - Full TypeScript support with strict typing
- ✅ **Zero External Dependencies** - Only optional peer dependencies

## Installation

### Prerequisites

- React Native 0.71+
- React 16.8+ (for hooks)
- Either Expo SDK 51+ or bare React Native environment

### NPM Installation

```bash
npm install @uploadista/react-native @uploadista/client @uploadista/core
```

### Yarn Installation

```bash
yarn add @uploadista/react-native @uploadista/client @uploadista/core
```

### pnpm Installation

```bash
pnpm add @uploadista/react-native @uploadista/client @uploadista/core
```

## Quick Start

### Expo Setup

For Expo managed projects, install the required Expo modules:

```bash
expo install expo-document-picker expo-image-picker expo-camera expo-file-system
```

Then in your app:

```tsx
import { UploadistaProvider } from '@uploadista/react-native';
import { UploadClient } from '@uploadista/client';

const client = new UploadClient({
  apiUrl: 'https://api.example.com',
});

export default function App() {
  return (
    <UploadistaProvider client={client}>
      <YourAppContent />
    </UploadistaProvider>
  );
}
```

### Bare React Native Setup

For bare React Native, install native dependencies:

```bash
npm install react-native-document-picker react-native-image-picker rn-fetch-blob

# For iOS
cd ios && pod install && cd ..

# For Android (usually automatic)
```

Then configure the provider:

```tsx
import { UploadistaProvider } from '@uploadista/react-native';
import { NativeFileSystemProvider } from '@uploadista/react-native/providers';
import { UploadClient } from '@uploadista/client';

const client = new UploadClient({
  apiUrl: 'https://api.example.com',
});

const fileSystemProvider = new NativeFileSystemProvider();

export default function App() {
  return (
    <UploadistaProvider
      client={client}
      fileSystemProvider={fileSystemProvider}
    >
      <YourAppContent />
    </UploadistaProvider>
  );
}
```

## Basic Usage

### Single File Upload

```tsx
import { useUploadistaClient } from '@uploadista/react-native';

export function SingleUploadScreen() {
  const { fileSystemProvider } = useUploadistaClient();

  const handlePickAndUpload = async () => {
    try {
      // Pick a file
      const file = await fileSystemProvider.pickDocument();

      // Read file content
      const content = await fileSystemProvider.readFile(file.uri);

      // Upload to server
      const response = await fetch('https://api.example.com/upload', {
        method: 'POST',
        body: content,
        headers: {
          'Content-Type': file.mimeType || 'application/octet-stream',
        },
      });

      console.log('Upload successful:', await response.json());
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <Button
      title="Pick and Upload File"
      onPress={handlePickAndUpload}
    />
  );
}
```

### Camera Upload

```tsx
import { useUploadistaClient } from '@uploadista/react-native';

export function CameraUploadScreen() {
  const { fileSystemProvider } = useUploadistaClient();

  const handleCaptureAndUpload = async () => {
    try {
      // Capture photo with camera
      const photo = await fileSystemProvider.pickCamera();

      // Upload to server
      const formData = new FormData();
      formData.append('file', {
        uri: photo.uri,
        name: photo.name,
        type: photo.mimeType || 'image/jpeg',
      } as any);

      const response = await fetch('https://api.example.com/upload', {
        method: 'POST',
        body: formData,
      });

      console.log('Photo uploaded:', await response.json());
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <Button
      title="Capture and Upload Photo"
      onPress={handleCaptureAndUpload}
    />
  );
}
```

## File System Provider

The file system abstraction layer allows you to work with files uniformly across Expo and bare React Native:

```tsx
interface FileSystemProvider {
  // Select a document
  pickDocument(options?: PickerOptions): Promise<FilePickResult>;

  // Select an image from gallery
  pickImage(options?: PickerOptions): Promise<FilePickResult>;

  // Select a video from gallery
  pickVideo(options?: PickerOptions): Promise<FilePickResult>;

  // Capture a photo with camera
  pickCamera(options?: CameraOptions): Promise<FilePickResult>;

  // Read file as ArrayBuffer
  readFile(uri: string): Promise<ArrayBuffer>;

  // Get file information
  getFileInfo(uri: string): Promise<FileInfo>;

  // Convert file path to accessible URI
  getDocumentUri(filePath: string): Promise<string>;
}
```

## Types

### FilePickResult

Result from file picker operations:

```tsx
interface FilePickResult {
  uri: string;           // File URI (platform-specific)
  name: string;          // File name with extension
  size: number;          // File size in bytes
  mimeType?: string;     // MIME type (if available)
  localPath?: string;    // Local file path (if available)
}
```

### FileInfo

Information about a file:

```tsx
interface FileInfo {
  uri: string;                 // File URI
  name: string;                // File name
  size: number;                // File size in bytes
  mimeType?: string;           // MIME type (if available)
  modificationTime?: number;   // Last modified timestamp
}
```

### PickerOptions

Options for file picker operations:

```tsx
interface PickerOptions {
  allowedTypes?: string[];     // MIME types to filter
  allowMultiple?: boolean;     // Allow multiple selection
  maxSize?: number;            // Maximum file size in bytes
}
```

## Permissions

### iOS

Add to `Info.plist`:

```xml
<key>NSCameraUsageDescription</key>
<string>We need camera access to upload photos</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>We need photo library access to upload images</string>
```

### Android

Add to `AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.INTERNET" />
```

The file system providers handle runtime permission requests automatically.

## Architecture

### Expo Provider

Uses Expo's native modules for file system access:

- `expo-document-picker` - Document selection
- `expo-image-picker` - Image and video selection from gallery
- `expo-camera` - Camera integration
- `expo-file-system` - File reading

### Native Provider

Uses third-party native modules for bare React Native:

- `react-native-document-picker` - Document selection
- `react-native-image-picker` - Image and video selection
- `rn-fetch-blob` - File system and network operations

Both providers implement the same `FileSystemProvider` interface, allowing you to write code once and run everywhere.

## Examples

See the `examples/` directory for complete working examples:

- `react-native-expo-client/` - Expo managed workflow example
- `react-native-cli-client/` - Bare React Native example

## Development

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run type-check
```

### Linting

```bash
npm run lint
```

### Testing

```bash
npm test
```

## API Reference

### createFileSystemProvider()

Creates a file system provider based on configuration:

```tsx
import { createFileSystemProvider } from '@uploadista/react-native/providers';

// Auto-detect environment
const provider = createFileSystemProvider();

// Specify Expo
const expoProvider = createFileSystemProvider({ type: 'expo' });

// Specify native
const nativeProvider = createFileSystemProvider({ type: 'native' });

// Use custom provider
const customProvider = createFileSystemProvider({
  provider: myCustomProvider,
});
```

### getDefaultFileSystemProvider()

Gets the automatically detected file system provider for the current environment:

```tsx
import { getDefaultFileSystemProvider } from '@uploadista/react-native/providers';

const provider = getDefaultFileSystemProvider();
```

## Troubleshooting

### Module not found errors

Ensure you've installed the required modules for your environment:

**Expo:**
```bash
expo install expo-document-picker expo-image-picker expo-camera expo-file-system
```

**Bare RN:**
```bash
npm install react-native-document-picker react-native-image-picker rn-fetch-blob
```

### Permission denied

Check that:
1. Permissions are declared in `Info.plist` (iOS) or `AndroidManifest.xml` (Android)
2. User has granted permissions at runtime (app will request automatically)
3. For Android 13+, ensure `READ_MEDIA_IMAGES` and `READ_MEDIA_VIDEO` are also declared

### File picker not opening

Verify that:
1. You're inside a valid React component
2. The provider is properly initialized
3. You're calling from a user interaction (not from render)

## Support

For issues and questions:

- GitHub Issues: https://github.com/uploadista/uploadista/issues
- Documentation: https://uploadista.dev/docs

## License

MIT - See LICENSE file for details
