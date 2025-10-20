import type { StorageService } from "@uploadista/client-core";

/**
 * Browser-specific implementation of StorageService using sessionStorage
 */
export function createSessionStorageService(): StorageService {
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
    async getItem(key: string): Promise<string | null> {
      return sessionStorage.getItem(key);
    },

    async setItem(key: string, value: string): Promise<void> {
      sessionStorage.setItem(key, value);
    },

    async removeItem(key: string): Promise<void> {
      sessionStorage.removeItem(key);
    },

    async findAll(): Promise<Record<string, string>> {
      return findEntries("");
    },

    async find(prefix: string): Promise<Record<string, string>> {
      return findEntries(prefix);
    },
  };
}
