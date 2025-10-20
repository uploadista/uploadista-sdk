/**
 * Platform-agnostic AbortController interface
 */

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(reason?: unknown): void;
}

export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void): void;
  removeEventListener(type: "abort", listener: () => void): void;
}

export interface AbortControllerFactory {
  /**
   * Create a new AbortController instance
   */
  create(): AbortControllerLike;
}
