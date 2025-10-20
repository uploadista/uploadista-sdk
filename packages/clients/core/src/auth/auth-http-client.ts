import type {
  HttpClient,
  HttpRequestOptions,
  HttpResponse,
} from "../services/http-client";
import type { DirectAuthManager } from "./direct-auth";
import type { NoAuthManager } from "./no-auth";
import type { SaasAuthManager } from "./saas-auth";

/**
 * Union type of all auth managers
 */
export type AuthManager = DirectAuthManager | SaasAuthManager | NoAuthManager;

/**
 * Auth-aware HTTP client wrapper.
 *
 * Wraps a standard HttpClient and automatically attaches authentication
 * credentials/tokens to all HTTP requests based on the configured auth manager.
 *
 * The wrapper delegates all non-auth concerns (connection pooling, metrics, etc.)
 * to the underlying HttpClient and only adds the auth layer on top.
 */
export class AuthHttpClient implements HttpClient {
  constructor(
    private httpClient: HttpClient,
    private authManager: AuthManager,
  ) {}

  /**
   * Make an HTTP request with authentication credentials attached.
   * Calls the auth manager to attach credentials before delegating to the underlying client.
   */
  async request(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse> {
    try {
      // Attach auth credentials to request headers
      const authenticatedHeaders = await this.attachAuthCredentials(
        options.headers || {},
        url,
      );

      // Delegate to underlying HTTP client with authenticated headers
      return await this.httpClient.request(url, {
        ...options,
        headers: authenticatedHeaders,
        // include credentials for cors if needed
        credentials:
          this.authManager.getType() === "no-auth" ||
          this.authManager.getType() === "saas"
            ? "omit"
            : (options.credentials ?? "include"),
      });
    } catch (error) {
      // If auth fails, wrap error with context
      if (error instanceof Error && error.message.includes("auth")) {
        throw error; // Re-throw auth errors as-is
      }

      // For other errors, let them propagate
      throw error;
    }
  }

  /**
   * Attach authentication credentials to request headers.
   * Delegates to the appropriate auth manager method.
   */
  private async attachAuthCredentials(
    headers: Record<string, string>,
    url: string,
  ): Promise<Record<string, string>> {
    // Check if this is a DirectAuthManager or SaasAuthManager
    if ("attachCredentials" in this.authManager) {
      // DirectAuthManager or NoAuthManager
      return await this.authManager.attachCredentials(headers);
    }

    if ("attachToken" in this.authManager) {
      // SaasAuthManager - extract job ID from URL if present
      const jobId = this.extractJobIdFromUrl(url);
      return await this.authManager.attachToken(headers, jobId);
    }

    // Fallback - return headers unchanged
    return headers;
  }

  /**
   * Extract job ID from URL for SaaS mode token caching.
   * Looks for patterns like /upload/{id} or /jobs/{id} in the URL.
   */
  private extractJobIdFromUrl(url: string): string | undefined {
    // Match patterns like:
    // - /api/upload/{uploadId}
    // - /api/flow/{flowId}/{storageId}
    // - /api/jobs/{jobId}/status
    // - /api/jobs/{jobId}/continue/{nodeId}

    const uploadMatch = url.match(/\/api\/upload\/([^/?]+)/);
    if (uploadMatch) {
      return uploadMatch[1];
    }

    const flowMatch = url.match(/\/api\/flow\/([^/?]+)/);
    if (flowMatch) {
      return flowMatch[1];
    }

    const jobMatch = url.match(/\/api\/jobs\/([^/?]+)/);
    if (jobMatch) {
      return jobMatch[1];
    }

    // No job ID found - SaaS mode will use global token
    return undefined;
  }

  /**
   * Delegate metrics methods to underlying HTTP client
   */
  getMetrics() {
    return this.httpClient.getMetrics();
  }

  getDetailedMetrics() {
    return this.httpClient.getDetailedMetrics();
  }

  reset() {
    this.httpClient.reset();
  }

  async close() {
    await this.httpClient.close();
  }

  async warmupConnections(urls: string[]) {
    await this.httpClient.warmupConnections(urls);
  }

  /**
   * Get the underlying auth manager for advanced use cases
   */
  getAuthManager(): AuthManager {
    return this.authManager;
  }
}
