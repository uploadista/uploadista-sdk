import { UploadistaError } from "@uploadista/core/errors";
import { Effect } from "effect";

/**
 * Waits for a URL to become available by periodically checking its accessibility.
 * This is useful when a file has just been uploaded and may not be immediately
 * accessible due to CDN propagation or storage consistency delays.
 *
 * @param url - The URL to check for availability
 * @param options - Configuration options
 * @param options.maxWaitTime - Maximum time to wait in milliseconds (default: 10000)
 * @param options.retryDelay - Delay between retries in milliseconds (default: 500)
 * @returns Effect that succeeds when URL is available or fails with UploadistaError
 */
export function waitForUrlAvailability(
  url: string,
  options: {
    maxWaitTime?: number;
    retryDelay?: number;
  } = {},
): Effect.Effect<void, UploadistaError> {
  const { maxWaitTime = 10000, retryDelay = 500 } = options;

  return Effect.gen(function* () {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const response = yield* Effect.tryPromise(() =>
        fetch(url, { method: "HEAD" }),
      ).pipe(Effect.catchAll(() => Effect.succeed(null)));

      if (response?.ok) {
        yield* Effect.logInfo(`URL ${url} is now available`);
        return;
      }

      if (response) {
        yield* Effect.logDebug(
          `URL not ready yet (${response.status}), retrying...`,
        );
      } else {
        yield* Effect.logDebug(`URL check failed, retrying...`);
      }

      yield* Effect.sleep(retryDelay);
    }

    return yield* UploadistaError.fromCode("FLOW_NODE_ERROR", {
      cause: `URL ${url} not available after ${maxWaitTime}ms`,
    }).toEffect();
  });
}
