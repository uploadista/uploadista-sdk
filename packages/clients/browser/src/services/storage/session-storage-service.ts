import type { StorageService } from "@uploadista/client-core";

/**
 * Creates a browser storage service using sessionStorage for temporary data storage.
 *
 * This service provides a key-value storage interface backed by the browser's
 * sessionStorage API. Unlike localStorage, data stored with sessionStorage is
 * only available for the duration of the page session and is cleared when the
 * browser tab or window is closed.
 *
 * Use cases include:
 * - Temporary upload state during a session
 * - One-time authentication tokens
 * - Transient UI state
 * - Session-specific preferences
 *
 * **Key differences from localStorage:**
 * - Data persists only for the current browser tab/window session
 * - Each tab has its own isolated sessionStorage
 * - Data is cleared when the tab/window is closed
 * - Page reloads preserve sessionStorage (unlike in-memory storage)
 * - Same storage quota limits as localStorage (5-10MB)
 *
 * @returns A StorageService backed by browser sessionStorage
 *
 * @example
 * ```typescript
 * import { createSessionStorageService } from '@uploadista/client-browser';
 *
 * const storage = createSessionStorageService();
 *
 * // Store temporary upload state
 * await storage.setItem('temp-upload:abc', JSON.stringify({
 *   fileId: 'abc',
 *   started: Date.now()
 * }));
 *
 * // Retrieve within same session
 * const data = await storage.getItem('temp-upload:abc');
 * if (data) {
 *   const state = JSON.parse(data);
 *   console.log('Upload started at', new Date(state.started));
 * }
 *
 * // Find all temporary uploads
 * const tempUploads = await storage.find('temp-upload:');
 *
 * // Clean up
 * await storage.removeItem('temp-upload:abc');
 * // OR: Close tab/window to clear all sessionStorage
 * ```
 *
 * @see {@link createLocalStorageService} for persistent storage
 */
export function createSessionStorageService(): StorageService {
  /**
   * Internal helper to find entries matching a prefix.
   *
   * Iterates through all sessionStorage keys and returns those that start
   * with the specified prefix along with their values.
   *
   * @param prefix - Key prefix to filter by
   * @returns Object mapping matching keys to their values
   * @private
   */
  const findEntries = (prefix: string): Record<string, string> => {
    const results: Record<string, string> = {};

    for (const key in sessionStorage) {
      if (key.startsWith(prefix)) {
        const item = sessionStorage.getItem(key);
        if (item) {
          results[key] = item;
        }
      }
    }

    return results;
  };

  return {
    /**
     * Retrieves a value from sessionStorage by key.
     *
     * @param key - The key to retrieve
     * @returns Promise resolving to the value, or null if the key doesn't exist
     *
     * @example
     * ```typescript
     * const token = await storage.getItem('session:auth-token');
     * if (token) {
     *   // Use token for requests
     * }
     * ```
     */
    async getItem(key: string): Promise<string | null> {
      return sessionStorage.getItem(key);
    },

    /**
     * Stores a value in sessionStorage.
     *
     * If the key already exists, its value will be overwritten.
     * Values must be strings; use JSON.stringify() for objects.
     * Data will be cleared when the browser tab/window is closed.
     *
     * @param key - The key to store under
     * @param value - The string value to store
     *
     * @throws {QuotaExceededError} If sessionStorage quota is exceeded
     *
     * @example
     * ```typescript
     * // Store temporary state
     * await storage.setItem('wizard:step', '2');
     *
     * // Store temporary object
     * await storage.setItem('temp:upload', JSON.stringify({
     *   progress: 50,
     *   paused: false
     * }));
     * ```
     */
    async setItem(key: string, value: string): Promise<void> {
      sessionStorage.setItem(key, value);
    },

    /**
     * Removes a value from sessionStorage by key.
     *
     * If the key doesn't exist, this is a no-op (no error is thrown).
     *
     * @param key - The key to remove
     *
     * @example
     * ```typescript
     * // Clean up temporary data
     * await storage.removeItem('temp:upload:123');
     * ```
     */
    async removeItem(key: string): Promise<void> {
      sessionStorage.removeItem(key);
    },

    /**
     * Retrieves all entries from sessionStorage.
     *
     * Returns an object mapping every key in sessionStorage to its value.
     * This only includes data for the current tab/window.
     *
     * @returns Promise resolving to object with all key-value pairs
     *
     * @example
     * ```typescript
     * const all = await storage.findAll();
     * console.log('Session items:', Object.keys(all).length);
     * ```
     */
    async findAll(): Promise<Record<string, string>> {
      return findEntries("");
    },

    /**
     * Finds all entries with keys starting with a given prefix.
     *
     * Useful for querying related session data. For example, use "temp:"
     * prefix to find all temporary entries.
     *
     * @param prefix - The key prefix to search for
     * @returns Promise resolving to object with matching key-value pairs
     *
     * @example
     * ```typescript
     * // Find all temporary uploads in this session
     * const tempUploads = await storage.find('temp-upload:');
     * for (const [key, value] of Object.entries(tempUploads)) {
     *   console.log('Temp upload:', key, JSON.parse(value));
     * }
     *
     * // Find wizard state
     * const wizardState = await storage.find('wizard:');
     * ```
     */
    async find(prefix: string): Promise<Record<string, string>> {
      return findEntries(prefix);
    },
  };
}
