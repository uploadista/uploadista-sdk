import type { PlatformService, Timeout } from "@uploadista/client-core";

/**
 * Browser implementation of PlatformService
 */
export function createBrowserPlatformService(): PlatformService {
  return {
    setTimeout: (callback: () => void, ms: number | undefined) => {
      return globalThis.setTimeout(callback, ms);
    },

    clearTimeout: (id: Timeout) => {
      globalThis.clearTimeout(id as number);
    },

    isBrowser: () => {
      return typeof window !== "undefined";
    },

    isOnline: () => {
      if (typeof navigator !== "undefined") {
        return navigator.onLine;
      }
      return true;
    },

    isFileLike: (value: unknown) => {
      return value instanceof File;
    },

    getFileName: (file: unknown) => {
      if (file instanceof File) {
        return file.name;
      }
      return undefined;
    },

    getFileType: (file: unknown) => {
      if (file instanceof File) {
        return file.type;
      }
      return undefined;
    },

    getFileSize: (file: unknown) => {
      if (file instanceof File) {
        return file.size;
      }
      return undefined;
    },

    getFileLastModified: (file: unknown) => {
      if (file instanceof File) {
        return file.lastModified;
      }
      return undefined;
    },
  };
}
