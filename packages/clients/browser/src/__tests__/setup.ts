/**
 * Vitest setup file for browser client tests.
 *
 * Sets up browser-like environment with mocks for Web APIs.
 */

import { afterEach, vi } from "vitest";

// Mock crypto.subtle for tests that need it
const mockSubtle = {
  digest: vi
    .fn()
    .mockImplementation(async (_algorithm: string, data: ArrayBuffer) => {
      // Return a mock hash based on data length for testing
      const mockHash = new Uint8Array(32);
      const view = new Uint8Array(data);
      for (let i = 0; i < 32; i++) {
        mockHash[i] = (view[i % view.length] || 0) ^ (i * 7);
      }
      return mockHash.buffer;
    }),
};

// Mock crypto.randomUUID
const mockRandomUUID = vi.fn(() => "550e8400-e29b-41d4-a716-446655440000");

// Setup global crypto mock if not available
if (typeof globalThis.crypto === "undefined") {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: mockSubtle,
      randomUUID: mockRandomUUID,
      getRandomValues: (arr: Uint8Array) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
      },
    },
    writable: true,
  });
} else {
  // Patch existing crypto object
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: mockSubtle,
      writable: true,
    });
  }
  if (!globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      value: mockRandomUUID,
      writable: true,
    });
  }
}

// Clean up mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock localStorage and sessionStorage for storage tests
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    // Iterator support for for...in loops
    [Symbol.iterator]: function* () {
      for (const key of Object.keys(store)) {
        yield key;
      }
    },
  };
};

// Setup storage mocks if not available
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: createStorageMock(),
    writable: true,
  });
}

if (typeof globalThis.sessionStorage === "undefined") {
  Object.defineProperty(globalThis, "sessionStorage", {
    value: createStorageMock(),
    writable: true,
  });
}

// Make storage iterable for for...in loops used in the actual code
const makeStorageIterable = (storage: Storage) => {
  const originalSetItem = storage.setItem.bind(storage);
  const originalRemoveItem = storage.removeItem.bind(storage);
  const originalClear = storage.clear?.bind(storage);

  const keys = new Set<string>();

  // Override setItem to track keys
  storage.setItem = (key: string, value: string) => {
    keys.add(key);
    originalSetItem(key, value);
  };

  // Override removeItem to track keys
  storage.removeItem = (key: string) => {
    keys.delete(key);
    originalRemoveItem(key);
  };

  // Override clear to track keys
  if (originalClear) {
    storage.clear = () => {
      keys.clear();
      originalClear();
    };
  }

  return storage;
};

// Export utilities for tests
export { createStorageMock, makeStorageIterable };
