import { describe, expect, it, vi } from "vitest";
import { createBrowserAbortControllerFactory } from "./abort-controller-factory";

describe("createBrowserAbortControllerFactory", () => {
  it("should create an AbortController factory", () => {
    const factory = createBrowserAbortControllerFactory();
    expect(factory).toBeDefined();
    expect(factory.create).toBeDefined();
    expect(typeof factory.create).toBe("function");
  });

  describe("create", () => {
    it("should create an AbortController instance", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      expect(controller).toBeDefined();
      expect(controller.signal).toBeDefined();
      expect(controller.abort).toBeDefined();
      expect(typeof controller.abort).toBe("function");
    });

    it("should create independent controllers", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller1 = factory.create();
      const controller2 = factory.create();

      expect(controller1).not.toBe(controller2);
      expect(controller1.signal).not.toBe(controller2.signal);
    });
  });

  describe("signal", () => {
    it("should have aborted property set to false initially", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      expect(controller.signal.aborted).toBe(false);
    });

    it("should support addEventListener", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      const listener = vi.fn();
      controller.signal.addEventListener("abort", listener);

      controller.abort();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe("abort", () => {
    it("should set aborted to true on signal", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      controller.abort();

      expect(controller.signal.aborted).toBe(true);
    });

    it("should abort with reason", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      const reason = new Error("User cancelled");
      controller.abort(reason);

      expect(controller.signal.aborted).toBe(true);
      expect(controller.signal.reason).toBe(reason);
    });

    it("should not throw when aborting multiple times", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      expect(() => {
        controller.abort();
        controller.abort();
        controller.abort();
      }).not.toThrow();

      expect(controller.signal.aborted).toBe(true);
    });

    it("should trigger abort event", () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      const abortHandler = vi.fn();
      controller.signal.addEventListener("abort", abortHandler);

      controller.abort();

      expect(abortHandler).toHaveBeenCalledTimes(1);
    });

    it("should work with fetch-like API", async () => {
      const factory = createBrowserAbortControllerFactory();
      const controller = factory.create();

      // Simulate an abortable operation
      const operation = new Promise((resolve, reject) => {
        const checkAbort = () => {
          if (controller.signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return true;
          }
          return false;
        };

        if (checkAbort()) return;

        controller.signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });

        // Simulate async work
        setTimeout(() => {
          if (!checkAbort()) {
            resolve("completed");
          }
        }, 100);
      });

      // Abort immediately
      controller.abort();

      await expect(operation).rejects.toThrow("Aborted");
    });
  });

  describe("integration", () => {
    it("should work with multiple independent operations", () => {
      const factory = createBrowserAbortControllerFactory();

      const controller1 = factory.create();
      const controller2 = factory.create();
      const controller3 = factory.create();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      controller1.signal.addEventListener("abort", handler1);
      controller2.signal.addEventListener("abort", handler2);
      controller3.signal.addEventListener("abort", handler3);

      // Abort only controller2
      controller2.abort();

      expect(controller1.signal.aborted).toBe(false);
      expect(controller2.signal.aborted).toBe(true);
      expect(controller3.signal.aborted).toBe(false);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });
  });
});
