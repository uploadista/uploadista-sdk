export class BaseAuthManager {
  constructor(private type: "direct" | "uploadista-cloud" | "no-auth") {}

  getType() {
    return this.type;
  }
}
/**
 * Credentials that can be attached to HTTP requests.
 * Supports headers and cookies for maximum flexibility.
 */
export type RequestCredentials = {
  /** HTTP headers to attach (e.g., Authorization, X-API-Key) */
  headers?: Record<string, string>;
  /** Cookies to attach (primarily for browser environments) */
  cookies?: Record<string, string>;
};

/**
 * Direct auth mode configuration.
 * Users provide a function that returns credentials to attach to every request.
 * This mode supports any authentication protocol (OAuth, JWT, sessions, API keys, etc.)
 *
 * @example Bearer token
 * ```typescript
 * {
 *   mode: 'direct',
 *   getCredentials: async () => ({
 *     headers: {
 *       'Authorization': `Bearer ${await getAccessToken()}`
 *     }
 *   })
 * }
 * ```
 *
 * @example API key
 * ```typescript
 * {
 *   mode: 'direct',
 *   getCredentials: () => ({
 *     headers: {
 *       'X-API-Key': process.env.API_KEY
 *     }
 *   })
 * }
 * ```
 */
export type DirectAuthConfig = {
  mode: "direct";
  /**
   * Function called before each HTTP request to obtain credentials.
   * Can be async to support token refresh or other async operations.
   * Should not throw - return empty object if credentials unavailable.
   */
  getCredentials?: () => RequestCredentials | Promise<RequestCredentials>;
};

/**
 * UploadistaCloud auth mode configuration.
 * Client requests JWT tokens from a user-controlled auth server,
 * which validates credentials and issues tokens using a secure API key.
 *
 * Token exchange flow:
 * 1. Client calls getCredentials() to get user credentials
 * 2. Client sends credentials to authServerUrl
 * 3. Auth server validates and returns JWT token
 * 4. Client attaches token to uploadista engine requests
 *
 * @example
 * ```typescript
 * {
 *   mode: 'uploadista-cloud',
 *   authServerUrl: 'https://auth.myapp.com/token',
 *   clientId: 'my-client-id'
 * }
 * ```
 */
export type UploadistaCloudAuthConfig = {
  mode: "uploadista-cloud";
  /**
   * URL of the user's auth server that issues JWT tokens.
   * Should be a GET endpoint that accepts client id and returns { token, expiresIn }.
   */
  authServerUrl: string;
  /**
   * Client ID to use for authentication. It will be used to compare the API Key with the client id on the auth server.
   */
  clientId: string;
};

/**
 * Authentication configuration for the uploadista client.
 * Supports two modes:
 * - Direct: Bring your own auth (any protocol)
 * - UploadistaCloud: Standard JWT token exchange with auth server
 *
 * Use a discriminated union to ensure type safety - TypeScript will
 * enforce that the correct fields are present for each mode.
 */
export type AuthConfig = DirectAuthConfig | UploadistaCloudAuthConfig;
