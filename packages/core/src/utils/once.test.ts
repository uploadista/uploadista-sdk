import { describe, expect, it, vi } from "vitest";
import { once } from "./once";

describe("once", () => {
  it("should call the function only once", () => {
    const mockFn = vi.fn(() => "result");
    const onceFn = once(mockFn);

    const result1 = onceFn();
    const result2 = onceFn();

    expect(mockFn).toHaveBeenCalledOnce();
    expect(result1).toBe("result");
    expect(result2).toBe("result");
  });

  it("should preserve function arguments on first call", () => {
    const mockFn = vi.fn((a: number, b: string) => `${a}-${b}`);
    const onceFn = once(mockFn);

    onceFn(42, "test");
    onceFn(100, "ignored"); // These arguments should be ignored

    expect(mockFn).toHaveBeenCalledOnce();
    expect(mockFn).toHaveBeenCalledWith(42, "test");
  });

  it("should preserve function context (this)", () => {
    const obj = {
      value: 42,
      fn: function (this: { value: number }) {
        return this.value;
      },
    };

    const onceFn = once(obj.fn);
    const result1 = onceFn.call(obj);
    const result2 = onceFn.call(obj);

    expect(result1).toBe(42);
    expect(result2).toBe(42);
  });

  it("should throw error when called multiple times if function returns falsy value", () => {
    const mockFn = vi.fn(() => null);
    const onceFn = once(mockFn);

    const result1 = onceFn();
    expect(result1).toBeNull();

    expect(() => onceFn()).toThrow("Function called more than once");
  });

  it("should handle functions that return undefined", () => {
    const mockFn = vi.fn(() => undefined);
    const onceFn = once(mockFn);

    const result1 = onceFn();
    expect(result1).toBeUndefined();

    expect(() => onceFn()).toThrow("Function called more than once");
  });

  it("should handle functions that return 0", () => {
    const mockFn = vi.fn(() => 0);
    const onceFn = once(mockFn);

    const result1 = onceFn();
    expect(result1).toBe(0);

    expect(() => onceFn()).toThrow("Function called more than once");
  });

  it("should handle functions that return empty string", () => {
    const mockFn = vi.fn(() => "");
    const onceFn = once(mockFn);

    const result1 = onceFn();
    expect(result1).toBe("");

    expect(() => onceFn()).toThrow("Function called more than once");
  });
});
