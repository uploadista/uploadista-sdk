import type {
  AbortControllerFactory,
  AbortControllerLike,
  AbortSignalLike,
} from "@uploadista/client-core";

/**
 * Browser AbortController implementation that wraps native AbortController
 */
class BrowserAbortController implements AbortControllerLike {
  private native: AbortController;

  constructor() {
    this.native = new AbortController();
  }

  get signal(): AbortSignalLike {
    return this.native.signal;
  }

  abort(reason?: unknown): void {
    this.native.abort(reason);
  }
}

/**
 * Factory for creating browser AbortController instances
 */
export const createBrowserAbortControllerFactory = (): AbortControllerFactory => ({
  create: (): AbortControllerLike => new BrowserAbortController(),
});
