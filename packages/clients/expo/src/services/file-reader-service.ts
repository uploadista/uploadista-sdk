import type {
  FileReaderService,
  FileSource,
  SliceResult,
} from "@uploadista/client-core";
import type { ExpoUploadInput } from "@/types/upload-input";

/**
 * Expo-specific implementation of FileReaderService
 * Handles Blob, File, and URI-based file inputs using Expo FileSystem APIs
 */
export function createExpoFileReaderService(): FileReaderService<ExpoUploadInput> {
  return {
    async openFile(input: unknown, _chunkSize: number): Promise<FileSource> {
      // Handle Blob/File objects
      if (input instanceof Blob) {
        return createBlobFileSource(input);
      }

      // Handle URI strings or URI objects from Expo APIs
      if (
        typeof input === "string" ||
        (input && typeof input === "object" && "uri" in input)
      ) {
        const uri =
          typeof input === "string" ? input : (input as { uri: string }).uri;
        return createExpoUriFileSource(uri);
      }

      throw new Error(
        "Unsupported file input type for Expo. Expected Blob, File, URI string, or {uri: string}",
      );
    },
  };
}

/**
 * Create a FileSource from a Blob object
 */
function createBlobFileSource(blob: Blob): FileSource {
  return {
    input: blob,
    size: blob.size,
    async slice(start: number, end: number): Promise<SliceResult> {
      const chunk = blob.slice(start, end);

      // React Native/Expo Blob may not have arrayBuffer() method
      // Always use FileReader fallback for compatibility
      const arrayBuffer = await blobToArrayBuffer(chunk);

      const done = end >= blob.size;

      return {
        done,
        value: new Uint8Array(arrayBuffer),
        size: chunk.size,
      };
    },
    close() {
      // No cleanup needed for Blob
    },
    name: null,
    lastModified: null,
    type: null,
  };
}

/**
 * Convert Blob to ArrayBuffer using FileReader (fallback for React Native/Expo)
 */
function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("FileReader result is not an ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Create a FileSource from a URI using Expo FileSystem
 * This implementation uses expo-file-system for native file access
 */
function createExpoUriFileSource(uri: string): FileSource {
  // For Expo URIs, we use FileSystem to read the file
  let cachedBlob: Blob | null = null;
  let cachedSize: number | null = null;

  return {
    input: uri,
    size: cachedSize,
    async slice(start: number, end: number): Promise<SliceResult> {
      // Fetch the blob if not cached
      if (!cachedBlob) {
        try {
          // Use Expo FileSystem to read the file as base64
          const FileSystem = await getExpoFileSystem();
          const fileInfo = await FileSystem.getInfoAsync(uri);

          if (!fileInfo.exists) {
            throw new Error(`File does not exist at URI: ${uri}`);
          }

          cachedSize = fileInfo.size ?? 0;

          // Read the entire file as base64
          const base64String = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Convert base64 to Uint8Array and cache size
          const uint8Array = base64ToUint8Array(base64String);
          cachedSize = uint8Array.length;

          // Create a Blob from the Uint8Array buffer
          // React Native Blob constructor accepts array-like objects
          // biome-ignore lint/suspicious/noExplicitAny: React Native Blob constructor type compatibility
          cachedBlob = new Blob([uint8Array.buffer] as any);
        } catch (error) {
          throw new Error(`Failed to read file from URI ${uri}: ${error}`);
        }
      }

      const chunk = cachedBlob.slice(start, end);

      // React Native/Expo Blob may not have arrayBuffer() method
      // Always use FileReader fallback for compatibility
      const arrayBuffer = await blobToArrayBuffer(chunk);

      const done = end >= cachedBlob.size;

      return {
        done,
        value: new Uint8Array(arrayBuffer),
        size: chunk.size,
      };
    },
    close() {
      // Clear cached blob
      cachedBlob = null;
      cachedSize = null;
    },
    name: uri,
    lastModified: null,
    type: null,
  };
}

/**
 * Dynamically import Expo FileSystem
 * This allows the service to work even if expo-file-system is not installed
 */
async function getExpoFileSystem() {
  try {
    return require("expo-file-system");
  } catch (_error) {
    throw new Error(
      "expo-file-system is required but not installed. " +
        "Please install it with: npx expo install expo-file-system",
    );
  }
}

/**
 * Convert base64 string to Uint8Array
 * Uses js-base64 library for cross-platform compatibility
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Use js-base64 for decoding (works in all environments)
  const { fromBase64 } = require("js-base64");
  const binaryString = fromBase64(base64);

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
