import type { StorageService } from "../services/storage-service";

/**
 * In-memory fallback storage service for Expo
 * Used when AsyncStorage is not available or for testing
 */
export function createInMemoryStorageService(): StorageService {
  const storage = new Map<string, string>();

  return {
    async getItem(key: string): Promise<string | null> {
      return storage.get(key) ?? null;
    },

    async setItem(key: string, value: string): Promise<void> {
      storage.set(key, value);
    },

    async removeItem(key: string): Promise<void> {
      storage.delete(key);
    },

    async findAll(): Promise<Record<string, string>> {
      return Object.fromEntries(storage.entries());
    },

    async find(prefix: string): Promise<Record<string, string>> {
      return Object.fromEntries(
        Array.from(storage.entries()).filter(([key]) => key.startsWith(prefix)),
      );
    },
  };
}
