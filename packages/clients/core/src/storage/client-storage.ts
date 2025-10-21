import type { IdGenerationService } from "../services/id-generation-service";
import type { StorageService } from "../services/storage-service";
import {
  type PreviousUpload,
  previousUploadSchema,
} from "../types/previous-upload";

/**
 * Client-side storage interface for managing upload resumption data.
 *
 * Provides methods to store, retrieve, and manage previous upload information,
 * enabling the client to resume interrupted uploads from where they left off.
 * This is essential for implementing reliable upload resumption across sessions.
 *
 * Storage keys are namespaced with "uploadista::" prefix and organized by
 * file fingerprint to allow quick lookup of resumable uploads.
 *
 * @example Finding resumable uploads
 * ```typescript
 * const storage = createClientStorage(localStorage);
 *
 * // Find all previous uploads
 * const allUploads = await storage.findAllUploads();
 *
 * // Find uploads for a specific file
 * const fingerprint = await computeFingerprint(file);
 * const matches = await storage.findUploadsByFingerprint(fingerprint);
 *
 * if (matches.length > 0) {
 *   // Resume from the most recent upload
 *   const uploadId = matches[0].uploadId;
 *   await resumeUpload(uploadId);
 * }
 * ```
 */
export type ClientStorage = {
  /**
   * Retrieves all stored upload records from client storage.
   *
   * Useful for debugging or displaying a list of resumable uploads to the user.
   *
   * @returns Array of all previous upload records
   */
  findAllUploads: () => Promise<PreviousUpload[]>;

  /**
   * Finds previous upload records matching a specific file fingerprint.
   *
   * This is the primary method for discovering resumable uploads.
   * Returns uploads sorted by most recent first.
   *
   * @param fingerprint - The file fingerprint to search for
   * @returns Array of matching upload records, or empty array if none found
   *
   * @example
   * ```typescript
   * const fingerprint = await computeFingerprint(file);
   * const previous = await storage.findUploadsByFingerprint(fingerprint);
   *
   * if (previous.length > 0) {
   *   console.log(`Found ${previous.length} resumable uploads`);
   *   console.log(`Last upload was ${previous[0].offset} bytes`);
   * }
   * ```
   */
  findUploadsByFingerprint: (fingerprint: string) => Promise<PreviousUpload[]>;

  /**
   * Removes an upload record from client storage.
   *
   * Called after an upload completes successfully or is explicitly cancelled
   * to clean up storage and prevent stale resumption attempts.
   *
   * @param clientStorageKey - The storage key returned by addUpload
   *
   * @example Cleanup after successful upload
   * ```typescript
   * await uploadFile(file);
   * await storage.removeUpload(storageKey);
   * ```
   */
  removeUpload: (clientStorageKey: string) => Promise<void>;

  /**
   * Stores an upload record in client storage for future resumption.
   *
   * Creates a namespaced storage key that includes the file fingerprint,
   * making it easy to find resumable uploads later.
   *
   * @param fingerprint - File fingerprint for organizing uploads
   * @param upload - Upload metadata to store (uploadId, offset, etc.)
   * @param options - Options object containing ID generation service
   * @returns The storage key that can be used to remove this upload later, or undefined if storage failed
   *
   * @example Storing upload progress
   * ```typescript
   * const fingerprint = await computeFingerprint(file);
   * const key = await storage.addUpload(
   *   fingerprint,
   *   { uploadId: 'abc123', offset: 1024000 },
   *   { generateId: idService }
   * );
   *
   * // Later, remove when complete
   * if (key) await storage.removeUpload(key);
   * ```
   */
  addUpload: (
    fingerprint: string,
    upload: PreviousUpload,
    { generateId }: { generateId: IdGenerationService },
  ) => Promise<string | undefined>;
};

/**
 * Creates a ClientStorage instance using the provided storage service.
 *
 * This factory function wraps a platform-specific StorageService (e.g., localStorage,
 * AsyncStorage) with the ClientStorage interface, providing a consistent API
 * for upload resumption across different platforms.
 *
 * @param storageService - Platform-specific storage implementation
 * @returns ClientStorage instance for managing upload records
 *
 * @example Browser with localStorage
 * ```typescript
 * const storage = createClientStorage({
 *   find: async (prefix) => {
 *     const items: Record<string, string> = {};
 *     for (let i = 0; i < localStorage.length; i++) {
 *       const key = localStorage.key(i);
 *       if (key?.startsWith(prefix)) {
 *         items[key] = localStorage.getItem(key) || '';
 *       }
 *     }
 *     return items;
 *   },
 *   setItem: async (key, value) => localStorage.setItem(key, value),
 *   removeItem: async (key) => localStorage.removeItem(key),
 * });
 * ```
 *
 * @example React Native with AsyncStorage
 * ```typescript
 * const storage = createClientStorage({
 *   find: async (prefix) => {
 *     const keys = await AsyncStorage.getAllKeys();
 *     const matching = keys.filter(k => k.startsWith(prefix));
 *     const pairs = await AsyncStorage.multiGet(matching);
 *     return Object.fromEntries(pairs);
 *   },
 *   setItem: async (key, value) => AsyncStorage.setItem(key, value),
 *   removeItem: async (key) => AsyncStorage.removeItem(key),
 * });
 * ```
 */
export function createClientStorage(
  storageService: StorageService,
): ClientStorage {
  return {
    findAllUploads: async () => {
      const items = await storageService.find("uploadista::");
      return Object.values(items).map((item) =>
        previousUploadSchema.parse(JSON.parse(item)),
      );
    },
    findUploadsByFingerprint: async (fingerprint: string) => {
      const items = await storageService.find(`uploadista::${fingerprint}`);
      return Object.values(items).map((item) =>
        previousUploadSchema.parse(JSON.parse(item)),
      );
    },
    removeUpload: (clientStorageKey: string) =>
      storageService.removeItem(clientStorageKey),
    addUpload: async (
      fingerprint: string,
      upload: PreviousUpload,
      { generateId }: { generateId: IdGenerationService },
    ) => {
      const key = generateId.generate();
      const clientStorageKey = `uploadista::${fingerprint}::${key}`;
      await storageService.setItem(clientStorageKey, JSON.stringify(upload));
      return clientStorageKey;
    },
  };
}
