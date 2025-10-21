import type { PlatformService, Timeout } from "@uploadista/client-core";

/**
 * Creates a browser-specific platform service that provides environment capabilities.
 *
 * This service abstracts platform-specific functionality and provides a consistent
 * interface for the Uploadista client to interact with browser APIs. It handles:
 * - Timer management (setTimeout/clearTimeout)
 * - Environment detection (browser vs. Node.js)
 * - Network connectivity status
 * - File object detection and metadata extraction
 *
 * This abstraction allows the core upload logic to remain platform-agnostic while
 * still accessing browser-specific features when needed.
 *
 * @returns A PlatformService configured for browser environments
 *
 * @example
 * ```typescript
 * import { createBrowserPlatformService } from '@uploadista/client-browser';
 *
 * const platform = createBrowserPlatformService();
 *
 * // Check if running in browser
 * console.log('Is browser:', platform.isBrowser()); // true
 *
 * // Check network status
 * console.log('Is online:', platform.isOnline()); // true or false
 *
 * // Extract file metadata
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 * console.log('File name:', platform.getFileName(file));
 * console.log('File type:', platform.getFileType(file));
 * console.log('File size:', platform.getFileSize(file));
 * ```
 */
export function createBrowserPlatformService(): PlatformService {
  return {
    /**
     * Schedules a function to be executed after a specified delay.
     *
     * Wraps the browser's native `setTimeout` function.
     *
     * @param callback - Function to execute after the delay
     * @param ms - Delay in milliseconds before executing the callback
     * @returns A timeout ID that can be passed to clearTimeout
     *
     * @example
     * ```typescript
     * const timeoutId = platform.setTimeout(() => {
     *   console.log('Executed after 1 second');
     * }, 1000);
     * ```
     */
    setTimeout: (callback: () => void, ms: number | undefined) => {
      return globalThis.setTimeout(callback, ms);
    },

    /**
     * Cancels a timeout previously scheduled with setTimeout.
     *
     * Wraps the browser's native `clearTimeout` function.
     *
     * @param id - The timeout ID returned by setTimeout
     *
     * @example
     * ```typescript
     * const timeoutId = platform.setTimeout(() => { }, 1000);
     * platform.clearTimeout(timeoutId); // Cancel the timeout
     * ```
     */
    clearTimeout: (id: Timeout) => {
      globalThis.clearTimeout(id as number);
    },

    /**
     * Checks if the code is running in a browser environment.
     *
     * Detects browser by checking for the existence of the `window` object.
     * This is useful for conditional logic that should only run in browsers.
     *
     * @returns `true` if running in a browser, `false` otherwise
     *
     * @example
     * ```typescript
     * if (platform.isBrowser()) {
     *   // Browser-specific code
     *   console.log('Running in browser');
     * }
     * ```
     */
    isBrowser: () => {
      return typeof window !== "undefined";
    },

    /**
     * Checks if the browser is currently online.
     *
     * Uses the Navigator Online Status API (`navigator.onLine`) to determine
     * network connectivity. Note that this only indicates if the device has
     * a network connection, not if it can reach the internet.
     *
     * @returns `true` if online, `false` if offline, defaults to `true` if not in browser
     *
     * @example
     * ```typescript
     * if (platform.isOnline()) {
     *   // Proceed with upload
     *   await client.upload(file);
     * } else {
     *   console.log('Waiting for network connection...');
     * }
     *
     * // Listen for online/offline events
     * window.addEventListener('online', () => {
     *   console.log('Back online, resuming upload');
     * });
     * ```
     */
    isOnline: () => {
      if (typeof navigator !== "undefined") {
        return navigator.onLine;
      }
      return true;
    },

    /**
     * Checks if a value is a File object.
     *
     * Type guard to determine if an unknown value is a browser File object.
     * Useful for validating upload inputs and conditional file handling.
     *
     * @param value - The value to check
     * @returns `true` if the value is a File instance, `false` otherwise
     *
     * @example
     * ```typescript
     * const input = getUploadInput(); // unknown type
     *
     * if (platform.isFileLike(input)) {
     *   // TypeScript knows input is a File here
     *   console.log('Uploading file:', input.name);
     * }
     * ```
     */
    isFileLike: (value: unknown) => {
      return value instanceof File;
    },

    /**
     * Extracts the file name from a File object.
     *
     * @param file - The file to extract the name from
     * @returns The file name string, or `undefined` if not a File
     *
     * @example
     * ```typescript
     * const file = new File(['content'], 'document.pdf');
     * const name = platform.getFileName(file);
     * console.log(name); // "document.pdf"
     * ```
     */
    getFileName: (file: unknown) => {
      if (file instanceof File) {
        return file.name;
      }
      return undefined;
    },

    /**
     * Extracts the MIME type from a File object.
     *
     * @param file - The file to extract the type from
     * @returns The MIME type string, or `undefined` if not a File
     *
     * @example
     * ```typescript
     * const file = new File(['content'], 'image.png', { type: 'image/png' });
     * const type = platform.getFileType(file);
     * console.log(type); // "image/png"
     * ```
     */
    getFileType: (file: unknown) => {
      if (file instanceof File) {
        return file.type;
      }
      return undefined;
    },

    /**
     * Extracts the file size in bytes from a File object.
     *
     * @param file - The file to extract the size from
     * @returns The file size in bytes, or `undefined` if not a File
     *
     * @example
     * ```typescript
     * const file = new File(['Hello'], 'greeting.txt');
     * const size = platform.getFileSize(file);
     * console.log(size); // 5 (bytes)
     * ```
     */
    getFileSize: (file: unknown) => {
      if (file instanceof File) {
        return file.size;
      }
      return undefined;
    },

    /**
     * Extracts the last modified timestamp from a File object.
     *
     * @param file - The file to extract the timestamp from
     * @returns The last modified timestamp in milliseconds since epoch, or `undefined` if not a File
     *
     * @example
     * ```typescript
     * const file = new File(['content'], 'data.txt');
     * const lastModified = platform.getFileLastModified(file);
     * console.log(new Date(lastModified)); // Date object of when file was last modified
     * ```
     */
    getFileLastModified: (file: unknown) => {
      if (file instanceof File) {
        return file.lastModified;
      }
      return undefined;
    },
  };
}
