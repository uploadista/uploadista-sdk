import type { HttpClient } from "../services/http-client";
import { BaseAuthManager, type SaasAuthConfig } from "./types";

/**
 * Token response from the auth server
 */
export type TokenResponse = {
  /** JWT token to use for authentication */
  token: string;
  /** Token expiration time in seconds (optional) */
  expiresIn?: number;
};

/**
 * Cached token information
 */
type CachedToken = {
  token: string;
  expiresAt?: number; // Unix timestamp in milliseconds
};

/**
 * SaaS auth manager - handles JWT token exchange with an auth server.
 *
 * Token exchange flow:
 * 1. Client calls getCredentials() to get user credentials
 * 2. Manager sends credentials to authServerUrl
 * 3. Auth server validates credentials and returns JWT token
 * 4. Manager caches token and attaches it to uploadista requests
 * 5. Token is cached per job to minimize auth overhead
 *
 * Security: API keys are kept server-side in the auth server, never exposed to clients.
 */
export class SaasAuthManager extends BaseAuthManager {
  /** Token cache: maps job ID to cached token */
  private tokenCache = new Map<string, CachedToken>();

  /** Global token for requests without a specific job ID */
  private globalToken: CachedToken | null = null;

  constructor(
    private config: SaasAuthConfig,
    private httpClient: HttpClient,
  ) {
    super("saas");
  }

  /**
   * Fetch a JWT token from the auth server using user credentials.
   *
   * @returns Token response with JWT and optional expiry
   * @throws Error if auth server is unreachable or returns an error
   */
  async fetchToken(): Promise<TokenResponse> {
    try {
      // Make POST request to auth server
      const response = await this.httpClient.request(
        `${this.config.authServerUrl}/${this.config.clientId}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      // Handle error responses
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Auth server returned ${response.status}`;

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = errorText || response.statusText || errorMessage;
        }

        throw new Error(errorMessage);
      }

      // Parse token response
      const data = (await response.json()) as TokenResponse;

      if (!data.token || typeof data.token !== "string") {
        throw new Error(
          "Auth server response missing 'token' field or token is not a string",
        );
      }

      return data;
    } catch (error) {
      // Wrap errors with context
      if (error instanceof Error) {
        throw new Error(`Failed to fetch auth token: ${error.message}`);
      }
      throw new Error(`Failed to fetch auth token: ${String(error)}`);
    }
  }

  /**
   * Get a cached token for a specific job, or fetch a new one if not cached.
   *
   * @param jobId - Optional job ID to cache token for specific job
   * @returns Cached or newly fetched token
   */
  private async getOrFetchToken(jobId?: string): Promise<string> {
    // Check if we have a cached token for this job
    if (jobId) {
      const cached = this.tokenCache.get(jobId);
      if (cached && !this.isTokenExpired(cached)) {
        return cached.token;
      }
    }

    // Check global token cache
    if (!jobId && this.globalToken && !this.isTokenExpired(this.globalToken)) {
      return this.globalToken.token;
    }

    // No valid cached token - fetch a new one
    const tokenResponse = await this.fetchToken();

    // Calculate expiration time if provided
    const expiresAt = tokenResponse.expiresIn
      ? Date.now() + tokenResponse.expiresIn * 1000
      : undefined;

    const cachedToken: CachedToken = {
      token: tokenResponse.token,
      expiresAt,
    };

    // Cache the token
    if (jobId) {
      this.tokenCache.set(jobId, cachedToken);
    } else {
      this.globalToken = cachedToken;
    }

    return tokenResponse.token;
  }

  /**
   * Check if a cached token is expired.
   * Adds a 60-second buffer to avoid using tokens that are about to expire.
   */
  private isTokenExpired(cached: CachedToken): boolean {
    if (!cached.expiresAt) {
      // No expiry set - assume token is valid
      return false;
    }

    // Add 60-second buffer before actual expiry
    const bufferMs = 60 * 1000;
    return Date.now() > cached.expiresAt - bufferMs;
  }

  /**
   * Attach JWT token to an HTTP request as Authorization Bearer header.
   *
   * @param headers - Existing request headers
   * @param jobId - Optional job ID to use cached token for specific job
   * @returns Updated headers with Authorization header
   * @throws Error if token fetch fails
   */
  async attachToken(
    headers: Record<string, string> = {},
    jobId?: string,
  ): Promise<Record<string, string>> {
    try {
      // Get token (from cache or fetch new)
      const token = await this.getOrFetchToken(jobId);

      // Attach as Bearer token
      return {
        ...headers,
        Authorization: `Bearer ${token}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to attach auth token: ${message}`);
    }
  }

  /**
   * Clear cached token for a specific job.
   * Should be called when a job completes to free memory.
   *
   * @param jobId - Job ID to clear token for
   */
  clearToken(jobId: string): void {
    this.tokenCache.delete(jobId);
  }

  /**
   * Clear all cached tokens.
   * Useful for logout or when switching users.
   */
  clearAllTokens(): void {
    this.tokenCache.clear();
    this.globalToken = null;
  }

  /**
   * Get cache statistics for debugging and monitoring.
   */
  getCacheStats(): {
    cachedJobCount: number;
    hasGlobalToken: boolean;
  } {
    return {
      cachedJobCount: this.tokenCache.size,
      hasGlobalToken: this.globalToken !== null,
    };
  }
}
