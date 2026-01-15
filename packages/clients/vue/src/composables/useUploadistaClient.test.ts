import { mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import {
  UPLOADISTA_CLIENT_KEY,
  UPLOADISTA_EVENT_SUBSCRIBERS_KEY,
} from "./plugin";
import { useUploadistaClient } from "./useUploadistaClient";

describe("useUploadistaClient", () => {
  const createMockClient = () => ({
    upload: vi.fn(),
    abort: vi.fn(),
    getProgress: vi.fn(),
  });

  const createTestComponent = (setupFn: () => unknown) => {
    return defineComponent({
      setup() {
        const result = setupFn();
        return { result };
      },
      render() {
        return h("div");
      },
    });
  };

  describe("client injection", () => {
    it("should return injected client", () => {
      const mockClient = createMockClient();
      let result: ReturnType<typeof useUploadistaClient> | null = null;

      const TestComponent = createTestComponent(() => {
        result = useUploadistaClient();
        return result;
      });

      mount(TestComponent, {
        global: {
          provide: {
            [UPLOADISTA_CLIENT_KEY as symbol]: mockClient,
            [UPLOADISTA_EVENT_SUBSCRIBERS_KEY as symbol]: ref(new Set()),
          },
        },
      });

      expect(result).not.toBeNull();
      expect(result!.client).toBe(mockClient);
    });

    it("should throw error when used outside provider context", () => {
      const TestComponent = createTestComponent(() => {
        useUploadistaClient();
      });

      expect(() => {
        mount(TestComponent);
      }).toThrow(
        "useUploadistaClient must be used within a component tree that has the Uploadista plugin or provider installed",
      );
    });
  });

  describe("event subscription", () => {
    it("should add handler to event subscribers", () => {
      const mockClient = createMockClient();
      const eventSubscribers = ref(new Set<(event: unknown) => void>());
      let result: ReturnType<typeof useUploadistaClient> | null = null;

      const TestComponent = createTestComponent(() => {
        result = useUploadistaClient();
        return result;
      });

      mount(TestComponent, {
        global: {
          provide: {
            [UPLOADISTA_CLIENT_KEY as symbol]: mockClient,
            [UPLOADISTA_EVENT_SUBSCRIBERS_KEY as symbol]: eventSubscribers,
          },
        },
      });

      const handler = vi.fn();
      result!.subscribeToEvents(handler);

      expect(eventSubscribers.value.has(handler)).toBe(true);
    });

    it("should remove handler on unsubscribe", () => {
      const mockClient = createMockClient();
      const eventSubscribers = ref(new Set<(event: unknown) => void>());
      let result: ReturnType<typeof useUploadistaClient> | null = null;

      const TestComponent = createTestComponent(() => {
        result = useUploadistaClient();
        return result;
      });

      mount(TestComponent, {
        global: {
          provide: {
            [UPLOADISTA_CLIENT_KEY as symbol]: mockClient,
            [UPLOADISTA_EVENT_SUBSCRIBERS_KEY as symbol]: eventSubscribers,
          },
        },
      });

      const handler = vi.fn();
      const unsubscribe = result!.subscribeToEvents(handler);

      expect(eventSubscribers.value.has(handler)).toBe(true);

      unsubscribe();

      expect(eventSubscribers.value.has(handler)).toBe(false);
    });

    it("should warn and return no-op when subscribers not available", () => {
      const mockClient = createMockClient();
      let result: ReturnType<typeof useUploadistaClient> | null = null;
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

      const TestComponent = createTestComponent(() => {
        result = useUploadistaClient();
        return result;
      });

      mount(TestComponent, {
        global: {
          provide: {
            [UPLOADISTA_CLIENT_KEY as symbol]: mockClient,
            // Not providing UPLOADISTA_EVENT_SUBSCRIBERS_KEY
          },
        },
      });

      const handler = vi.fn();
      const unsubscribe = result!.subscribeToEvents(handler);

      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining("subscribeToEvents called but no event subscribers provided"),
      );

      // Unsubscribe should be a no-op and not throw
      expect(() => unsubscribe()).not.toThrow();

      consoleWarn.mockRestore();
    });
  });
});
