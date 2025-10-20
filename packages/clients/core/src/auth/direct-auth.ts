import type { Logger } from "../logger";
import type { PlatformService } from "../services/platform-service";
import type { DirectAuthConfig } from "./types";
import { BaseAuthManager } from "./types";

/**
 * Direct auth manager - handles credential attachment for "bring your own auth" mode.
 *
 * This manager calls the user-provided getCredentials() function before each request
 * and attaches the returned credentials (headers, cookies) to the HTTP request.
 *
 * Supports any authentication protocol: OAuth, JWT, API keys, session cookies, etc.
 */
export class DirectAuthManager extends BaseAuthManager {
  constructor(
    private config: DirectAuthConfig,
    private platformService: PlatformService,
    private logger: Logger,
  ) {
    super("direct");
  }

  /**
   * Attach credentials to an HTTP request by calling getCredentials() and
   * merging the returned headers/cookies with the request.
   *
   * @param headers - Existing request headers
   * @returns Updated headers with credentials attached
   * @throws Error if getCredentials() throws or returns invalid data
   */
  async attachCredentials(
    headers: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    try {
      if (!this.config.getCredentials) {
        return headers;
      }

      // Call user's credential provider (may be async)
      const credentials = await Promise.resolve(this.config.getCredentials());

      // Validate credentials
      if (!credentials || typeof credentials !== "object") {
        throw new Error(
          "getCredentials() must return an object with headers and/or cookies",
        );
      }

      // Merge credential headers with existing headers
      const updatedHeaders = { ...headers };

      if (credentials.headers) {
        this.validateHeaders(credentials.headers);
        Object.assign(updatedHeaders, credentials.headers);
      }

      // Note: Cookie handling would be browser-specific
      // For now, we only support headers as cookies are automatically
      // handled by the browser when using fetch()
      if (credentials.cookies) {
        this.attachCookies(updatedHeaders, credentials.cookies);
      }

      return updatedHeaders;
    } catch (error) {
      // Wrap errors with context
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to attach auth credentials: ${message}`);
    }
  }

  /**
   * Validate that headers is a valid object with string keys and values
   */
  private validateHeaders(headers: Record<string, string>): void {
    if (typeof headers !== "object" || headers === null) {
      throw new Error("headers must be an object");
    }

    for (const [key, value] of Object.entries(headers)) {
      if (typeof key !== "string" || typeof value !== "string") {
        throw new Error(
          `Invalid header: key and value must be strings (got ${key}: ${typeof value})`,
        );
      }
    }
  }

  /**
   * Attach cookies to request headers.
   * In browser environments, cookies are automatically handled by fetch().
   * In Node.js, we need to manually add them to the Cookie header.
   */
  private attachCookies(
    headers: Record<string, string>,
    cookies: Record<string, string>,
  ): void {
    // Check if we're in a browser environment
    const isBrowser = this.platformService.isBrowser();

    if (isBrowser) {
      // In browsers, fetch() automatically sends cookies for same-origin requests
      // For cross-origin, the server needs to set CORS headers and credentials: 'include'
      // We can't manually set cookies in headers for security reasons
      // So we just warn if cookies are provided in direct mode
      this.logger.warn(
        "DirectAuth: Cookies are automatically handled by the browser. " +
          "Ensure your server has proper CORS configuration with credentials support.",
      );
    } else {
      // In Node.js, we can manually build the Cookie header
      const cookieString = Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");

      if (cookieString) {
        headers.Cookie = cookieString;
      }
    }
  }
}
