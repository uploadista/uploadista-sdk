/**
 * Platform-specific type definitions for React Native
 *
 * React Native's Blob implementation differs from the browser's Blob API.
 * This file provides proper type definitions and guards for platform-specific behavior.
 */

/**
 * BufferSource represents data that can be passed to Blob constructor
 * Includes both ArrayBuffer and typed arrays (Uint8Array, etc.)
 */
export type BufferSource = ArrayBuffer | ArrayBufferView;

/**
 * React Native Blob constructor options
 * Extends standard BlobPropertyBag with platform-specific properties
 */
export interface ReactNativeBlobOptions {
  /** MIME type of the blob */
  type?: string;
  /** Platform-specific: file path for optimization (React Native only) */
  path?: string;
}

/**
 * React Native Blob constructor type
 * Unlike browser Blob, accepts BufferSource in the parts array
 */
export interface ReactNativeBlobConstructor {
  new (
    parts?: Array<BufferSource | Blob | string>,
    options?: ReactNativeBlobOptions,
  ): Blob;
  prototype: Blob;
}

/**
 * Type guard to check if a value is ArrayBuffer
 */
export function isArrayBuffer(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer;
}

/**
 * Type guard to check if a value is ArrayBufferView (typed array)
 */
export function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return (
    value !== null &&
    typeof value === "object" &&
    "buffer" in value &&
    value.buffer instanceof ArrayBuffer
  );
}

/**
 * Type guard to check if a value is BufferSource
 */
export function isBufferSource(value: unknown): value is BufferSource {
  return isArrayBuffer(value) || isArrayBufferView(value);
}

/**
 * Type guard to check if we're in React Native environment
 * (checks for navigator.product === 'ReactNative')
 */
export function isReactNativeEnvironment(): boolean {
  const g = globalThis as typeof globalThis & {
    navigator?: { product?: string };
  };
  return (
    typeof g !== "undefined" &&
    typeof g.navigator !== "undefined" &&
    g.navigator.product === "ReactNative"
  );
}

/**
 * Create a Blob from BufferSource with proper typing for React Native
 *
 * This function handles the platform differences between browser and React Native Blob APIs.
 * React Native's Blob constructor accepts BufferSource directly, while browser Blob requires
 * conversion to Uint8Array first in some cases.
 *
 * @param data - ArrayBuffer or typed array to convert to Blob
 * @param options - Blob options including MIME type
 * @returns Platform-appropriate Blob instance
 *
 * @example
 * ```typescript
 * const arrayBuffer = await fileSystemProvider.readFile(uri);
 * const blob = createBlobFromBuffer(arrayBuffer, {
 *   type: 'image/jpeg'
 * });
 * ```
 */
export function createBlobFromBuffer(
  data: BufferSource,
  options?: ReactNativeBlobOptions,
): Blob {
  // Convert ArrayBuffer to Uint8Array for consistent handling
  const uint8Array = data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  // In React Native, Blob constructor accepts BufferSource
  // Cast to ReactNativeBlobConstructor to use the correct signature
  const BlobConstructor = Blob as unknown as ReactNativeBlobConstructor;
  return new BlobConstructor([uint8Array], options);
}
