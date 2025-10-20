import type { PlatformService, Timeout } from "@uploadista/client-core";

/**
 * Expo implementation of PlatformService
 */
export function createExpoPlatformService(): PlatformService {
  return {
    setTimeout: (callback: () => void, ms: number | undefined) => {
      return globalThis.setTimeout(callback, ms);
    },

    clearTimeout: (id: Timeout) => {
      globalThis.clearTimeout(id as number);
    },

    isBrowser: () => {
      return false;
    },

    isOnline: () => {
      // Expo's NetInfo would need to be imported separately
      // For now, assume online
      return true;
    },

    isFileLike: (value: unknown) => {
      // Check for blob-like interface or File-like object
      return (
        value !== null &&
        typeof value === "object" &&
        ("uri" in value || "name" in value)
      );
    },

    getFileName: (file: unknown) => {
      if (file !== null && typeof file === "object" && "name" in file) {
        return (file as Record<string, unknown>).name as string | undefined;
      }
      if (file !== null && typeof file === "object" && "uri" in file) {
        const uri = (file as Record<string, unknown>).uri as string | undefined;
        if (uri) {
          return uri.split("/").pop();
        }
      }
      return undefined;
    },

    getFileType: (file: unknown) => {
      if (file !== null && typeof file === "object" && "type" in file) {
        return (file as Record<string, unknown>).type as string | undefined;
      }
      return undefined;
    },

    getFileSize: (file: unknown) => {
      if (file !== null && typeof file === "object" && "size" in file) {
        return (file as Record<string, unknown>).size as number | undefined;
      }
      return undefined;
    },

    getFileLastModified: (file: unknown) => {
      if (file !== null && typeof file === "object" && "lastModified" in file) {
        return (file as Record<string, unknown>).lastModified as
          | number
          | undefined;
      }
      return undefined;
    },
  };
}
