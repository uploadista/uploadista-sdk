/**
 * Platform-agnostic AbortController interface
 */

export interface AbortControllerLike {
  readonly signal: AbortSignalLike;
  abort(reason?: unknown): void;
  /**
   * Pause the operation (optional, may not be supported by all implementations)
   */
  pause?(): void;
  /**
   * Resume a paused operation (optional, may not be supported by all implementations)
   */
  resume?(): void;
  /**
   * Whether the operation is currently paused
   */
  readonly isPaused?: boolean;
  /**
   * Wait for resume to be called (returns immediately if not paused)
   * Used by upload loops to pause between chunk uploads
   */
  waitForResume?(): Promise<void>;
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

/**
 * A wrapper that adds pause/resume functionality to an AbortController.
 * Used by FlowManager and upload loops to support pausing chunk uploads.
 *
 * IMPORTANT: This class requires an inner AbortController to be provided.
 * The inner controller's signal is used directly, which ensures compatibility
 * with browser's fetch API (which requires a real AbortSignal).
 */
export class PausableAbortController implements AbortControllerLike {
  private _isPaused = false;
  private _resumeResolvers: Array<() => void> = [];
  private readonly _innerController: AbortControllerLike;

  /**
   * Create a PausableAbortController that wraps an inner AbortController.
   *
   * @param innerController - The inner AbortController to wrap. This should be
   *   a real AbortController (from the browser or platform) so that its signal
   *   is compatible with fetch API.
   */
  constructor(innerController: AbortControllerLike) {
    this._innerController = innerController;
  }

  /**
   * Returns the inner controller's signal directly.
   * This ensures compatibility with browser's fetch API which requires a real AbortSignal.
   */
  get signal(): AbortSignalLike {
    return this._innerController.signal;
  }

  get isPaused(): boolean {
    return this._isPaused;
  }

  abort(reason?: unknown): void {
    // When aborting, also resolve any pending waitForResume promises
    // so the upload loop can exit cleanly
    for (const resolve of this._resumeResolvers) {
      resolve();
    }
    this._resumeResolvers = [];

    // Delegate to inner controller
    this._innerController.abort(reason);
  }

  pause(): void {
    this._isPaused = true;
  }

  resume(): void {
    this._isPaused = false;
    // Resolve all pending waitForResume promises
    for (const resolve of this._resumeResolvers) {
      resolve();
    }
    this._resumeResolvers = [];
  }

  /**
   * Returns a promise that resolves when resume() is called.
   * If not paused, resolves immediately.
   * If aborted while waiting, resolves immediately (caller should check signal.aborted).
   */
  waitForResume(): Promise<void> {
    if (!this._isPaused || this._innerController.signal.aborted) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this._resumeResolvers.push(resolve);
    });
  }
}

/**
 * Helper function to wait for resume if the controller supports it.
 * Returns immediately if the controller doesn't support pause or isn't paused.
 */
export async function waitForResumeIfPaused(
  controller: AbortControllerLike,
): Promise<void> {
  if (controller.isPaused && controller.waitForResume) {
    await controller.waitForResume();
  }
}
