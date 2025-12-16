import type { StorageService } from "@uploadista/client-core";

/**
 * Get AsyncStorage module dynamically
 * This allows the service to work even if AsyncStorage is not installed
 */
function getAsyncStorage() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-async-storage/async-storage").default;
  } catch (_error) {
    throw new Error(
      "@react-native-async-storage/async-storage is required for persistent storage. " +
        "Please install it with: npm install @react-native-async-storage/async-storage",
    );
  }
}

/**
 * React Native-specific implementation of StorageService using AsyncStorage
 * AsyncStorage is provided as an optional peer dependency and must be installed separately
 */
export function createAsyncStorageService(): StorageService {
  const AsyncStorage = getAsyncStorage();

  const findEntries = async (
    prefix: string,
  ): Promise<Record<string, string>> => {
    const results: Record<string, string> = {};

    const keys = await AsyncStorage.getAllKeys();
    for (const key of keys) {
      if (key.startsWith(prefix)) {
        const item = await AsyncStorage.getItem(key);
        if (item) {
          results[key] = item;
        }
      }
    }

    return results;
  };

  return {
    async getItem(key: string): Promise<string | null> {
      try {
        return await AsyncStorage.getItem(key);
      } catch (error) {
        console.error(`AsyncStorage getItem error for key ${key}:`, error);
        return null;
      }
    },

    async setItem(key: string, value: string): Promise<void> {
      try {
        await AsyncStorage.setItem(key, value);
      } catch (error) {
        console.error(`AsyncStorage setItem error for key ${key}:`, error);
        throw error;
      }
    },

    async removeItem(key: string): Promise<void> {
      try {
        await AsyncStorage.removeItem(key);
      } catch (error) {
        console.error(`AsyncStorage removeItem error for key ${key}:`, error);
        throw error;
      }
    },

    async findAll(): Promise<Record<string, string>> {
      return findEntries("");
    },

    async find(prefix: string): Promise<Record<string, string>> {
      return findEntries(prefix);
    },
  };
}
