import type {
  AbortControllerFactory,
  AbortControllerLike,
  AbortSignalLike,
} from "@uploadista/client-core";

/**
 * Expo AbortController implementation that wraps native AbortController
 * Expo provides an AbortController API that is compatible with the browser AbortController API
 */
class ExpoAbortController implements AbortControllerLike {
  private native: AbortController;

  constructor() {
    this.native = new AbortController();
  }

  get signal(): AbortSignalLike {
    return this.native.signal;
  }

  abort(_reason?: unknown): void {
    this.native.abort();
  }
}

/**
 * Factory for creating Expo AbortController instances
 */
export const createExpoAbortControllerFactory = (): AbortControllerFactory => ({
  create: (): AbortControllerLike => new ExpoAbortController(),
});
