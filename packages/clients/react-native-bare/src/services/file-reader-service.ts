import type {
  FileReaderService,
  FileSource,
  SliceResult,
} from "@uploadista/client-core";
import type { ReactNativeUploadInput } from "@/types/upload-input";

/**
 * React Native-specific implementation of FileReaderService
 * Handles Blob, File, and URI-based file inputs
 */
export function createReactNativeFileReaderService(): FileReaderService<ReactNativeUploadInput> {
  return {
    async openFile(input, _chunkSize: number): Promise<FileSource> {
      // Handle Blob/File objects
      if (input instanceof Blob) {
        return createBlobFileSource(input);
      }

      // Handle URI strings or URI objects
      if (
        typeof input === "string" ||
        (input && typeof input === "object" && "uri" in input)
      ) {
        const uri =
          typeof input === "string" ? input : (input as { uri: string }).uri;
        return createUriFileSource(uri);
      }

      throw new Error(
        "Unsupported file input type for React Native. Expected Blob, File, URI string, or {uri: string}",
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

      // React Native Blob may not have arrayBuffer() method
      let arrayBuffer: ArrayBuffer;
      if (typeof chunk.arrayBuffer === "function") {
        arrayBuffer = await chunk.arrayBuffer();
      } else {
        // Fallback: use FileReader for React Native
        arrayBuffer = await blobToArrayBuffer(chunk);
      }

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
    type: null,
    lastModified: null,
  };
}

/**
 * Convert Blob to ArrayBuffer using FileReader (fallback for React Native)
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
 * Create a FileSource from a URI
 * This is a simplified implementation - you may need to use react-native-fs
 * or another library for more advanced file operations
 */
function createUriFileSource(uri: string): FileSource {
  // For URIs, we need to fetch the file first
  // This implementation assumes the URI can be fetched as a blob
  let cachedBlob: Blob | null = null;
  let cachedSize: number | null = null;

  return {
    input: uri,
    size: cachedSize,
    async slice(start: number, end: number): Promise<SliceResult> {
      // Fetch the blob if not cached
      if (!cachedBlob) {
        try {
          const response = await fetch(uri);
          cachedBlob = await response.blob();
          cachedSize = cachedBlob.size;
        } catch (error) {
          throw new Error(`Failed to fetch file from URI ${uri}: ${error}`);
        }
      }

      const chunk = cachedBlob.slice(start, end);

      // React Native Blob may not have arrayBuffer() method
      let arrayBuffer: ArrayBuffer;
      if (typeof chunk.arrayBuffer === "function") {
        arrayBuffer = await chunk.arrayBuffer();
      } else {
        arrayBuffer = await blobToArrayBuffer(chunk);
      }

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
    lastModified: null,
    name: uri,
    type: null,
  };
}
