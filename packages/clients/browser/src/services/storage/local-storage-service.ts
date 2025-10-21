import type { StorageService } from "@uploadista/client-core";

/**
 * Creates a browser storage service using localStorage for persistent data storage.
 *
 * This service provides a key-value storage interface backed by the browser's
 * localStorage API. Data stored with this service persists across browser sessions
 * and page reloads until explicitly deleted or cleared by the user.
 *
 * Use cases include:
 * - Persisting upload state for resumable uploads
 * - Caching file metadata and fingerprints
 * - Storing user preferences and settings
 * - Maintaining upload history
 *
 * **Important notes:**
 * - localStorage has a typical limit of 5-10MB per origin
 * - Data is stored as strings (objects are JSON-serialized)
 * - localStorage is synchronous but this service wraps it in Promises for consistency
 * - Data is scoped to the origin (protocol + domain + port)
 * - Users can clear localStorage through browser settings
 *
 * @returns A StorageService backed by browser localStorage
 *
 * @example
 * ```typescript
 * import { createLocalStorageService } from '@uploadista/client-browser';
 *
 * const storage = createLocalStorageService();
 *
 * // Store upload state
 * await storage.setItem('upload:123', JSON.stringify({
 *   fileId: '123',
 *   progress: 75,
 *   uploadedChunks: [0, 1, 2]
 * }));
 *
 * // Retrieve upload state
 * const data = await storage.getItem('upload:123');
 * if (data) {
 *   const state = JSON.parse(data);
 *   console.log('Resuming upload at', state.progress, '%');
 * }
 *
 * // Find all uploads
 * const uploads = await storage.find('upload:');
 * console.log('Found', Object.keys(uploads).length, 'uploads');
 *
 * // Clean up completed upload
 * await storage.removeItem('upload:123');
 * ```
 *
 * @see {@link createSessionStorageService} for session-only storage
 */
export function createLocalStorageService(): StorageService {
  /**
   * Internal helper to find entries matching a prefix.
   *
   * Iterates through all localStorage keys and returns those that start
   * with the specified prefix along with their values.
   *
   * @param prefix - Key prefix to filter by
   * @returns Object mapping matching keys to their values
   * @private
   */
  const findEntries = (prefix: string): Record<string, string> => {
    const results: Record<string, string> = {};

    for (const key in localStorage) {
      if (key.startsWith(prefix)) {
        const item = localStorage.getItem(key);
        if (item) {
          results[key] = item;
        }
      }
    }

    return results;
  };

  return {
    /**
     * Retrieves a value from localStorage by key.
     *
     * @param key - The key to retrieve
     * @returns Promise resolving to the value, or null if the key doesn't exist
     *
     * @example
     * ```typescript
     * const value = await storage.getItem('user:preferences');
     * if (value) {
     *   const prefs = JSON.parse(value);
     * }
     * ```
     */
    async getItem(key: string): Promise<string | null> {
      return localStorage.getItem(key);
    },

    /**
     * Stores a value in localStorage.
     *
     * If the key already exists, its value will be overwritten.
     * Values must be strings; use JSON.stringify() for objects.
     *
     * @param key - The key to store under
     * @param value - The string value to store
     *
     * @throws {QuotaExceededError} If localStorage quota is exceeded
     *
     * @example
     * ```typescript
     * // Store string
     * await storage.setItem('upload:status', 'completed');
     *
     * // Store object
     * await storage.setItem('upload:metadata', JSON.stringify({
     *   name: 'file.txt',
     *   size: 1024
     * }));
     * ```
     */
    async setItem(key: string, value: string): Promise<void> {
      localStorage.setItem(key, value);
    },

    /**
     * Removes a value from localStorage by key.
     *
     * If the key doesn't exist, this is a no-op (no error is thrown).
     *
     * @param key - The key to remove
     *
     * @example
     * ```typescript
     * // Clean up completed upload
     * await storage.removeItem('upload:123');
     * ```
     */
    async removeItem(key: string): Promise<void> {
      localStorage.removeItem(key);
    },

    /**
     * Retrieves all entries from localStorage.
     *
     * Returns an object mapping every key in localStorage to its value.
     * Use with caution as this can return a large amount of data.
     *
     * @returns Promise resolving to object with all key-value pairs
     *
     * @example
     * ```typescript
     * const all = await storage.findAll();
     * console.log('Total items in storage:', Object.keys(all).length);
     * ```
     */
    async findAll(): Promise<Record<string, string>> {
      return findEntries("");
    },

    /**
     * Finds all entries with keys starting with a given prefix.
     *
     * Useful for querying related data or implementing namespacing.
     * For example, use "upload:" prefix to find all upload-related entries.
     *
     * @param prefix - The key prefix to search for
     * @returns Promise resolving to object with matching key-value pairs
     *
     * @example
     * ```typescript
     * // Find all uploads
     * const uploads = await storage.find('upload:');
     * for (const [key, value] of Object.entries(uploads)) {
     *   console.log('Upload:', key, JSON.parse(value));
     * }
     *
     * // Find user preferences
     * const prefs = await storage.find('pref:');
     * ```
     */
    async find(prefix: string): Promise<Record<string, string>> {
      return findEntries(prefix);
    },
  };
}
