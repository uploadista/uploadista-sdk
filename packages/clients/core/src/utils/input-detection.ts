/**
 * Utilities for detecting input data types to determine flow execution strategy.
 *
 * @module utils/input-detection
 */

/**
 * Input type classification for flow execution.
 *
 * - `file`: File-like object requiring chunked upload
 * - `url`: URL string for direct file fetch
 * - `data`: Structured data to pass through unchanged
 */
export type InputType = "file" | "url" | "data";

/**
 * Minimal interface for file-like objects (File, Blob, React Native assets).
 * Platform-agnostic representation of uploadable content.
 */
export interface FileLike {
  /** File name (optional) */
  name?: string;
  /** MIME type (optional) */
  type?: string;
  /** File size in bytes (optional) */
  size?: number;
}

/**
 * URL regex pattern matching http:// or https:// protocols.
 * Validates common URL structures for input type detection.
 */
const URL_PATTERN = /^https?:\/\/.+/i;

/**
 * Detect the type of input data for flow execution.
 *
 * Detection rules:
 * 1. Object with file-like properties (name/type/size) → "file"
 * 2. String matching URL pattern → "url"
 * 3. Everything else → "data"
 *
 * Uses duck typing to detect file-like objects across platforms.
 *
 * @param data - Input data to classify
 * @returns Input type classification
 *
 * @example
 * ```typescript
 * detectInputType(new File([], "test.jpg")); // "file"
 * detectInputType({ name: "test.jpg", size: 1024 }); // "file"
 * detectInputType("https://example.com/image.jpg"); // "url"
 * detectInputType({ field: "value" }); // "data"
 * ```
 */
export function detectInputType(data: unknown): InputType {
  // Check for file-like object using duck typing
  if (isFileLike(data)) {
    return "file";
  }

  // Check for URL string
  if (typeof data === "string" && URL_PATTERN.test(data)) {
    return "url";
  }

  // Default to structured data
  return "data";
}

/**
 * Check if input is a URL string.
 *
 * @param data - Input data to check
 * @returns True if data is a URL string
 *
 * @example
 * ```typescript
 * isURL("https://example.com/file.jpg"); // true
 * isURL("not a url"); // false
 * isURL({ url: "https://..." }); // false
 * ```
 */
export function isURL(data: unknown): data is string {
  return typeof data === "string" && URL_PATTERN.test(data);
}

/**
 * Check if input is a file-like object (File, Blob, or platform-specific file).
 *
 * Uses duck typing to identify objects with file-like properties.
 * Works across browser (File/Blob) and React Native environments.
 *
 * @param data - Input data to check
 * @returns True if data is file-like
 *
 * @example
 * ```typescript
 * isFileLike(new File([], "test.jpg")); // true
 * isFileLike(new Blob(["data"])); // true
 * isFileLike({ name: "test.jpg", size: 1024 }); // true
 * isFileLike("not a file"); // false
 * ```
 */
export function isFileLike(data: unknown): data is FileLike {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  // Check for File or Blob using runtime type check (browser)
  if (typeof globalThis !== "undefined") {
    // @ts-expect-error - File and Blob may not exist in all environments
    if (globalThis.File && data instanceof globalThis.File) {
      return true;
    }
    // @ts-expect-error - File and Blob may not exist in all environments
    if (globalThis.Blob && data instanceof globalThis.Blob) {
      return true;
    }
  }

  // Duck typing: object with file-like properties
  const obj = data as Record<string, unknown>;
  return (
    ("name" in obj || "type" in obj || "size" in obj) &&
    (typeof obj.size === "number" || typeof obj.size === "undefined")
  );
}
