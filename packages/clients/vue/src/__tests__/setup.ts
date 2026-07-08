/**
 * Vitest setup file for Vue client tests.
 *
 * Sets up browser-like environment with mocks for Web APIs
 * and Vue-specific test utilities.
 */

import { config } from "@vue/test-utils";
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

// Spy on URL methods - these are provided by happy-dom but we want to track calls
export const mockCreateObjectURL = vi
  .spyOn(URL, "createObjectURL")
  .mockReturnValue("blob:mock-url");
export const mockRevokeObjectURL = vi
  .spyOn(URL, "revokeObjectURL")
  .mockReturnValue(undefined);

// Configure Vue Test Utils global stubs/plugins if needed
config.global.stubs = {};

// Clean up mocks after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Helper to create a mock File
export function createMockFile(name: string, size: number, type: string): File {
  const buffer = new ArrayBuffer(size);
  const blob = new Blob([buffer], { type });
  return new File([blob], name, { type });
}

// Helper to create mock DragEvent
export function createMockDragEvent(
  type: string,
  files: File[] = [],
): DragEvent {
  const dataTransfer = {
    items: files.map((file) => ({
      kind: "file",
      type: file.type,
      getAsFile: () => file,
    })),
    files: {
      length: files.length,
      item: (index: number) => files[index] || null,
      [Symbol.iterator]: function* () {
        for (const file of files) {
          yield file;
        }
      },
    } as unknown as FileList,
    dropEffect: "none" as DataTransfer["dropEffect"],
    effectAllowed: "all" as DataTransfer["effectAllowed"],
    types: ["Files"],
    getData: () => "",
    setData: () => {},
    clearData: () => {},
    setDragImage: () => {},
  } as unknown as DataTransfer;

  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;

  Object.defineProperty(event, "dataTransfer", {
    value: dataTransfer,
    writable: false,
  });

  return event;
}

// Helper to create mock InputEvent with files
export function createMockInputChangeEvent(files: File[]): Event {
  const event = new Event("change", { bubbles: true });
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (const file of files) {
        yield file;
      }
    },
  } as unknown as FileList;

  // Create a mock input element
  const mockInput = {
    files: fileList,
    value: "C:\\fakepath\\file.txt",
  };

  Object.defineProperty(event, "target", {
    value: mockInput,
    writable: false,
  });

  return event;
}
