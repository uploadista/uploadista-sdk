import { Effect } from "effect";
import { UploadistaError } from "../errors/uploadista-error";

// only call a function once
export function once<T, A extends unknown[], Return>(
  fn: (this: T, ...args: A) => Return,
) {
  let called = false;
  let value: Return | undefined;
  const f = function (this: T, ...args: A): Return {
    if (called) {
      if (value) {
        return value;
      }
      throw new Error("Function called more than once");
    }
    called = true;
    value = fn.apply(this, args);
    return value;
  };
  return f;
}

/**
 * Effect-based once utilities
 */
export const OnceEffect = {
  /**
   * Creates an Effect-based once function that only executes once
   * @param effect - The effect to execute only once
   * @returns Effect that caches the result after first execution
   */
  make: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | UploadistaError, R> => {
    let cached: A | undefined;
    let called = false;

    return Effect.gen(function* () {
      if (called) {
        if (cached !== undefined) {
          return cached;
        }
        yield* new UploadistaError({
          code: "UNKNOWN_ERROR",
          status: 500,
          body: "Effect called more than once with undefined result",
        }).toEffect();
      }

      called = true;
      cached = yield* effect;
      return cached;
    });
  },

  /**
   * Creates a legacy once function wrapper
   * @param fn - Function to wrap
   * @returns Once-wrapped function
   */
  legacy: once,
};
