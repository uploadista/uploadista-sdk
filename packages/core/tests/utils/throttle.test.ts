import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { throttle } from "../../src/utils/throttle";

describe("throttle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should throttle function calls", () => {
    const mockFn = vi.fn();
    const throttledFn = throttle(mockFn, 100);

    throttledFn();
    expect(mockFn).toHaveBeenCalledOnce(); // Leading call

    throttledFn();
    throttledFn();
    expect(mockFn).toHaveBeenCalledOnce(); // Still only one call

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(2); // Trailing call executed
  });

  it("should respect leading option when set to false", () => {
    const mockFn = vi.fn();
    const throttledFn = throttle(mockFn, 100, { leading: false });

    throttledFn();
    expect(mockFn).not.toHaveBeenCalled(); // No leading call

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledOnce(); // Trailing call executed
  });

  it("should respect trailing option when set to false", () => {
    const mockFn = vi.fn();
    const throttledFn = throttle(mockFn, 100, { trailing: false });

    throttledFn();
    expect(mockFn).toHaveBeenCalledOnce(); // Leading call

    throttledFn();
    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledOnce(); // No trailing call
  });

  it("should use default options when none provided", () => {
    const mockFn = vi.fn();
    const throttledFn = throttle(mockFn, 100);

    throttledFn();
    expect(mockFn).toHaveBeenCalledOnce(); // leading: true by default

    throttledFn();
    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(2); // trailing: true by default
  });

  it("should preserve function arguments", () => {
    const mockFn = vi.fn();
    const throttledFn = throttle(mockFn, 100);

    throttledFn("arg1", "arg2", 123);
    expect(mockFn).toHaveBeenCalledWith("arg1", "arg2", 123);
  });

  it("should preserve function context (this)", () => {
    const obj = {
      value: 42,
      fn: vi.fn(function (this: { value: number }) {
        return this.value;
      }),
    };

    const throttledFn = throttle(obj.fn, 100);
    throttledFn.call(obj);

    expect(obj.fn).toHaveBeenCalledOnce();
  });

  it("should handle multiple rapid calls within throttle period", () => {
    const mockFn = vi.fn();
    const throttledFn = throttle(mockFn, 100);

    // Make 5 rapid calls
    for (let i = 0; i < 5; i++) {
      throttledFn(i);
    }

    expect(mockFn).toHaveBeenCalledOnce(); // Only leading call
    expect(mockFn).toHaveBeenCalledWith(0); // First call's arguments

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(2); // Trailing call executed
    expect(mockFn).toHaveBeenLastCalledWith(4); // Last call's arguments
  });
});
