import { Effect, type Scope } from "effect";
import type { UploadistaError } from "../errors/uploadista-error";

type ReleaseCallback = () => Promise<void>;

/**
 * Creates a permit that must be explicitly released to free up a semaphore slot.
 *
 * Permits are used internally by semaphores to track resource acquisition and release.
 * Each permit represents one available slot in the semaphore's concurrency limit.
 *
 * @param onRelease - Callback function to execute when the permit is released
 * @returns A permit object with a release method
 * @internal
 */
export function permit(onRelease: ReleaseCallback) {
  let isReleased = false;

  async function release() {
    if (!isReleased) {
      isReleased = true;
      await onRelease();
    }
  }

  return {
    release,
  };
}

export type Permit = ReturnType<typeof permit>;

type Deferred = {
  resolve?: (permit: Permit) => void;
  promise?: Promise<Permit>;
};

/**
 * Creates a semaphore for controlling concurrent access to resources.
 *
 * A semaphore limits the number of concurrent operations that can access a shared
 * resource. This is useful for:
 * - Limiting parallel file uploads
 * - Controlling database connection pool size
 * - Throttling API requests
 * - Managing concurrent flow node execution
 *
 * When all permits are in use, new acquire() calls will wait until a permit
 * becomes available.
 *
 * @param count - Maximum number of concurrent operations allowed
 * @returns A semaphore object with an acquire method
 *
 * @example
 * ```typescript
 * const uploadSemaphore = semaphore(3); // Max 3 concurrent uploads
 *
 * async function uploadFile(file: File) {
 *   const permit = await uploadSemaphore.acquire();
 *   try {
 *     // Upload file (max 3 concurrent)
 *     await uploadToServer(file);
 *   } finally {
 *     await permit.release();
 *   }
 * }
 *
 * // Process files with concurrency limit
 * await Promise.all(files.map(uploadFile));
 * ```
 */
export function semaphore(count: number) {
  let availablePermits = count;
  const deferreds: Deferred[] = [];

  function acquire(): Promise<Permit> {
    if (availablePermits > 0) {
      return Promise.resolve(createPermit());
    }

    const deferred: Deferred = {};
    deferred.promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });
    deferreds.push(deferred);
    return deferred.promise;
  }

  function createPermit(): Permit {
    availablePermits--;

    return permit(async () => {
      availablePermits++;

      if (deferreds.length > 0) {
        const deferred = deferreds.shift();
        if (deferred) {
          deferred.resolve?.(createPermit());
          await deferred.promise;
        }
      }
    });
  }

  return {
    acquire,
  };
}

export type Semaphore = ReturnType<typeof semaphore>;

/**
 * Effect-based semaphore utilities
 */
export const SemaphoreEffect = {
  /**
   * Creates an Effect-based semaphore with resource management
   * @param count - Number of permits available
   * @returns Effect semaphore with automatic resource cleanup
   */
  make: (
    count: number,
  ): Effect.Effect<
    {
      acquire: <A, E, R>(
        effect: Effect.Effect<A, E, R>,
      ) => Effect.Effect<A, E | UploadistaError, R>;
    },
    never,
    Scope.Scope
  > =>
    Effect.acquireRelease(
      Effect.sync(() => {
        let availablePermits = count;
        const queue: Array<(permit: () => void) => void> = [];

        const acquire = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.gen(function* () {
            // Wait for a permit
            yield* Effect.async<void, UploadistaError>((resume) => {
              if (availablePermits > 0) {
                availablePermits--;
                resume(Effect.void);
              } else {
                queue.push((releasePermit) => {
                  availablePermits--;
                  resume(Effect.void);
                });
              }
            });

            // Execute the effect with cleanup
            return yield* Effect.ensuring(
              effect,
              Effect.sync(() => {
                availablePermits++;
                if (queue.length > 0) {
                  const nextWaiting = queue.shift();
                  if (nextWaiting) {
                    nextWaiting(() => {});
                  }
                }
              }),
            );
          });

        return { acquire };
      }),
      () => Effect.void, // Cleanup function
    ),

  /**
   * Creates a legacy semaphore wrapper
   * @param count - Number of permits
   * @returns Legacy semaphore instance
   */
  legacy: (count: number) => semaphore(count),
};
