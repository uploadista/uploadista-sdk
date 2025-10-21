import type {
  AbortControllerFactory,
  AbortControllerLike,
  AbortSignalLike,
} from "@uploadista/client-core";

/**
 * Browser implementation of AbortController that wraps the native AbortController API.
 *
 * This class provides a minimal wrapper around the browser's native AbortController
 * to ensure compatibility with the Uploadista client's AbortControllerLike interface.
 * It's used for canceling uploads and HTTP requests.
 *
 * @example
 * ```typescript
 * const controller = new BrowserAbortController();
 *
 * // Start an operation with the signal
 * fetch('https://api.example.com/upload', {
 *   signal: controller.signal,
 *   method: 'POST',
 *   body: formData
 * });
 *
 * // Cancel the operation
 * controller.abort('User canceled');
 * ```
 */
class BrowserAbortController implements AbortControllerLike {
  private native: AbortController;

  /**
   * Creates a new BrowserAbortController instance.
   *
   * Initializes a new native AbortController from the browser's API.
   */
  constructor() {
    this.native = new AbortController();
  }

  /**
   * Gets the AbortSignal associated with this controller.
   *
   * This signal is passed to abortable operations (like fetch or upload)
   * and will be triggered when abort() is called.
   *
   * @returns The abort signal that operations can listen to
   */
  get signal(): AbortSignalLike {
    return this.native.signal;
  }

  /**
   * Aborts the operation associated with this controller.
   *
   * When called, this will trigger the abort signal, causing any operations
   * listening to it (such as fetch requests or file uploads) to be canceled.
   *
   * @param reason - Optional reason for the abort, which will be available on the AbortSignal
   *
   * @example
   * ```typescript
   * const controller = new BrowserAbortController();
   *
   * // Start upload
   * const upload = client.upload(file, { signal: controller.signal });
   *
   * // Cancel upload after 5 seconds
   * setTimeout(() => {
   *   controller.abort('Timeout exceeded');
   * }, 5000);
   * ```
   */
  abort(reason?: unknown): void {
    this.native.abort(reason);
  }
}

/**
 * Creates a factory for browser AbortController instances.
 *
 * This factory is used by the Uploadista client to create AbortController
 * instances for canceling uploads and HTTP requests. It wraps the browser's
 * native AbortController API.
 *
 * @returns An AbortControllerFactory that creates browser-compatible abort controllers
 *
 * @example
 * ```typescript
 * import { createBrowserAbortControllerFactory } from '@uploadista/client-browser';
 *
 * const factory = createBrowserAbortControllerFactory();
 *
 * // Create a controller
 * const controller = factory.create();
 *
 * // Use it to cancel operations
 * const upload = client.upload(file, {
 *   signal: controller.signal
 * });
 *
 * // Later, cancel the upload
 * controller.abort();
 * ```
 */
export const createBrowserAbortControllerFactory = (): AbortControllerFactory => ({
  create: (): AbortControllerLike => new BrowserAbortController(),
});
