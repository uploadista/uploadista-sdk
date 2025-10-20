import { BaseAuthManager } from "./types";

/**
 * No-auth manager - pass-through implementation for backward compatibility.
 *
 * When no auth configuration is provided, this manager is used to maintain
 * a consistent interface without adding any authentication to requests.
 */
export class NoAuthManager extends BaseAuthManager {
  constructor() {
    super("no-auth");
  }

  /**
   * Pass through headers without modification.
   *
   * @param headers - Existing request headers
   * @returns Same headers unchanged
   */
  async attachCredentials(
    headers: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    return headers;
  }

  /**
   * No-op for clearing tokens (NoAuthManager doesn't cache anything)
   */
  clearToken(_jobId: string): void {
    // No-op
  }

  /**
   * No-op for clearing all tokens
   */
  clearAllTokens(): void {
    // No-op
  }
}
