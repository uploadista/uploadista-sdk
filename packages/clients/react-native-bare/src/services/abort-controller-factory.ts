import type {
  AbortControllerFactory,
  AbortControllerLike,
  AbortSignalLike,
} from "@uploadista/client-core";

/**
 * React Native AbortController implementation that wraps native AbortController
 * React Native provides an AbortController API that is compatible with the browser AbortController API
 */
class ReactNativeAbortController implements AbortControllerLike {
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
 * Factory for creating React Native AbortController instances
 */
export const createReactNativeAbortControllerFactory =
  (): AbortControllerFactory => ({
    create: (): AbortControllerLike => new ReactNativeAbortController(),
  });
