import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StorageService } from "@uploadista/client-core";
/**
 * Expo-specific implementation of StorageService using AsyncStorage
 * AsyncStorage is provided as an optional peer dependency and must be installed separately
 */
export function createAsyncStorageService(): StorageService {
  const findEntries = async (
    prefix: string,
  ): Promise<Record<string, string>> => {
    const results: Record<string, string> = {};

    const keys = await AsyncStorage.getAllKeys();
    for (const key in keys) {
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
