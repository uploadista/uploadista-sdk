type DebounceOptions = {
  // Whether the first call to the debounced function is run immediately.
  leading?: boolean;

  // Whether the last call to the debounced function is run after delay
  // milliseconds have elapsed since the last call.
  trailing?: boolean;
};

const defaultDebounceOptions: DebounceOptions = {
  leading: false,
  trailing: true,
};

/**
 * Returns `fn` wrapped by a function that delays invoking `fn` for `delay`
 * milliseconds since the last call. Set `options.leading` to invoke `fn` on
 * the leading edge of the delay, and/or set `options.trailing` to invoke `fn`
 * on the trailing edge of the delay (true by default).
 *
 * Example for `debounce(fn, 30, {leading: true, trailing: true})`,
 * where `fn` is called twice, with the second call made 20 ms after the first:
 *
 * Time:     0                   20                            50 (ms)
 * Timeline: |----------------------------------------------------------------|
 *           ^                   ^                             ^
 *           |                   |                             |
 *           | First call.       | Second call 20ms after the  | End of delay.
 *           | (instant leading  | first.                      | (trailing edge
 *           |  edge call)       |                             |  call)
 *                               |-----------------------------|
 *                               |  30 ms delay for debounce.  |
 *
 *
 * Note that if both `options.leading` and `options.trailing` are true, `fn`
 * will only be invoked on the trailing edge if the debounced function is called
 * more than once during the delay.
 *
 * @param fn - Function to debounce.
 * @param delay - Milliseconds to delay calling `fn` since the last call.
 * @param debounceOptions - See `DebounceOptions` and `defaultDebounceOptions`.
 * @returns A debounced `fn`.
 */
export function debounce<T, A extends unknown[]>(
  fn: (this: T, ...args: A) => void,
  delay: number,
  debounceOptions: DebounceOptions = {},
): (this: T, ...args: A) => void {
  const options = { ...defaultDebounceOptions, ...debounceOptions };

  let timer: ReturnType<typeof setTimeout> | undefined;

  return function (this: T, ...args: A): void {
    if (options.leading && !timer) {
      // Leading edge.
      // Call fn on the leading edge, when debouncing hasn't started yet.
      console.log("leading");
      fn.apply(this, args);

      // Debounce the next call.
      timer = setTimeout(() => {
        timer = undefined;
      }, delay);
    } else {
      // Trailing edge.
      // Postpone calling fn until the delay has elapsed since the last call.
      // Each call clears any previously delayed call and resets the delay, so
      // the postponed call will always be the last one.
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (options.trailing) {
          // Call fn on the trailing edge.
          fn.apply(this, args);

          if (options.leading) {
            // Debounce next leading call since a trailing call was just made.
            setTimeout(() => {
              timer = undefined;
            }, delay);
          }
        } else {
          // No trailing call. Since the delay has elapsed since the last call,
          // immediately reset the debouncing delay.
          timer = undefined;
        }
      }, delay);
    }
  };
}
