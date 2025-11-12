import type { WebSocketConnection } from "@uploadista/core/types";
import { vi } from "vitest";

export interface MockDurableObjectStub {
  emit: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
}

export interface MockDurableObjectNamespace {
  idFromName: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
}

export function createMockDurableObjectStub(): MockDurableObjectStub {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockDurableObjectNamespace(): MockDurableObjectNamespace & {
  mockStub: MockDurableObjectStub;
  stubbedIds: Map<string, any>;
} {
  const stubsById = new Map<string, MockDurableObjectStub>();
  const mockStub = createMockDurableObjectStub();

  return {
    mockStub,
    stubbedIds: stubsById,
    idFromName: vi.fn().mockImplementation((name: string) => {
      const id = { name, toString: () => name };
      if (!stubsById.has(name)) {
        stubsById.set(name, mockStub);
      }
      return id;
    }),
    get: vi.fn().mockImplementation((id: any) => {
      return stubsById.get(id.name) || mockStub;
    }),
  };
}

export interface MockEventEmitterDurableObject<T> {
  idFromName: (name: string) => any;
  get: (id: any) => MockDurableObjectStub;
}

export function createMockEventEmitterDurableObject<T>(): {
  namespace: MockDurableObjectNamespace & {
    mockStub: MockDurableObjectStub;
    stubbedIds: Map<string, any>;
  };
  asTyped: () => MockEventEmitterDurableObject<T>;
} {
  const namespace = createMockDurableObjectNamespace();

  return {
    namespace,
    asTyped: () => namespace as any,
  };
}
