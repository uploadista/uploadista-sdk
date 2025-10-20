/**
 * Platform-agnostic service for platform-specific APIs
 * Provides abstraction for timer functions and platform detection
 */

export type Timeout = unknown;

export interface PlatformService {
  /**
   * Schedule a callback to run after a delay
   */
  setTimeout: (callback: () => void, ms: number | undefined) => Timeout;

  /**
   * Cancel a scheduled callback
   */
  clearTimeout: (id: Timeout) => void;

  /**
   * Check if we're in a browser environment
   */
  isBrowser: () => boolean;

  /**
   * Check if network is online
   */
  isOnline: () => boolean;

  /**
   * Check if a value is a File-like object
   */
  isFileLike: (value: unknown) => boolean;

  /**
   * Get file name from File-like object
   */
  getFileName: (file: unknown) => string | undefined;

  /**
   * Get file type from File-like object
   */
  getFileType: (file: unknown) => string | undefined;

  /**
   * Get file size from File-like object
   */
  getFileSize: (file: unknown) => number | undefined;

  /**
   * Get file last modified timestamp from File-like object
   */
  getFileLastModified: (file: unknown) => number | undefined;
}

/**
 * Simple async wait utility
 */
export async function wait(
  platformService: PlatformService,
  ms: number,
): Promise<void> {
  return new Promise<void>((resolve) =>
    platformService.setTimeout(resolve, ms),
  );
}
