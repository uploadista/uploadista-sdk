import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

describe("debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should delay function execution by the specified time", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(99);
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockFn).toHaveBeenCalledOnce();
  });

  it("should reset delay on subsequent calls", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    vi.advanceTimersByTime(50);
    debouncedFn(); // This should reset the timer

    vi.advanceTimersByTime(99);
    expect(mockFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(mockFn).toHaveBeenCalledOnce();
  });

  it("should call function immediately with leading: true", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100, { leading: true });

    debouncedFn();
    expect(mockFn).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledOnce(); // Should not be called again
  });

  it("should not call function on trailing edge with trailing: false", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100, { trailing: false });

    debouncedFn();
    vi.advanceTimersByTime(100);
    expect(mockFn).not.toHaveBeenCalled();
  });

  it("should call function on both leading and trailing edges when both options are true", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100, {
      leading: true,
      trailing: true,
    });

    debouncedFn();
    expect(mockFn).toHaveBeenCalledOnce();

    debouncedFn(); // Second call within delay
    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it("should preserve function arguments", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn("arg1", "arg2", 123);
    vi.advanceTimersByTime(100);

    expect(mockFn).toHaveBeenCalledWith("arg1", "arg2", 123);
  });

  it("should preserve function context (this)", () => {
    const obj = {
      value: 42,
      fn: vi.fn(function (this: { value: number }) {
        return this.value;
      }),
    };

    const debouncedFn = debounce(obj.fn, 100);
    debouncedFn.call(obj);

    vi.advanceTimersByTime(100);
    expect(obj.fn).toHaveBeenCalledOnce();
  });

  it("should handle multiple rapid calls correctly", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    // Make 5 rapid calls
    for (let i = 0; i < 5; i++) {
      debouncedFn(i);
    }

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledOnce();
    expect(mockFn).toHaveBeenCalledWith(4); // Should be called with the last argument
  });

  it("should use default options when none provided", () => {
    const mockFn = vi.fn();
    const debouncedFn = debounce(mockFn, 100);

    debouncedFn();
    expect(mockFn).not.toHaveBeenCalled(); // leading: false by default

    vi.advanceTimersByTime(100);
    expect(mockFn).toHaveBeenCalledOnce(); // trailing: true by default
  });
});
