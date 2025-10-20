import { debounce } from "./debounce.js";

export function throttle<T, A extends unknown[], Return>(
  fn: (this: T, ...args: A) => Return,
  wait: number,
  {
    leading = true,
    trailing = true,
  }: { leading?: boolean; trailing?: boolean } = {},
) {
  return debounce(fn, wait, {
    leading,
    trailing,
  });
}

/**
 * Effect-based throttle utilities
 */
export const ThrottleEffect = {
  /**
   * Creates a legacy throttle function wrapper
   * @param fn - Function to throttle
   * @param wait - Wait time in milliseconds
   * @param options - Throttle options
   * @returns Throttled function
   */
  legacy: throttle,
};
