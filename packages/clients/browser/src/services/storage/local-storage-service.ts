import type { StorageService } from "@uploadista/client-core";

/**
 * Browser-specific implementation of StorageService using localStorage
 */
export function createLocalStorageService(): StorageService {
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
    async getItem(key: string): Promise<string | null> {
      return localStorage.getItem(key);
    },

    async setItem(key: string, value: string): Promise<void> {
      localStorage.setItem(key, value);
    },

    async removeItem(key: string): Promise<void> {
      localStorage.removeItem(key);
    },

    async findAll(): Promise<Record<string, string>> {
      return findEntries("");
    },

    async find(prefix: string): Promise<Record<string, string>> {
      return findEntries(prefix);
    },
  };
}
