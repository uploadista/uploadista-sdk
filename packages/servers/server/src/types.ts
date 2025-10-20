/**
 * Authentication context containing user identity and authorization metadata.
 * This context is extracted from authentication middleware and made available
 * throughout the upload and flow processing pipeline via Effect Layer.
 */
export type AuthContext = {
  /**
   * Unique identifier for the authenticated user.
   * This is typically extracted from JWT claims (sub), session data, or API key metadata.
   */
  clientId: string;

  /**
   * Optional metadata for authorization and tracking purposes.
   * Can include rate limits, quotas, permissions, or custom application data.
   *
   * @example
   * ```typescript
   * {
   *   permissions: ['upload:create', 'flow:execute'],
   *   rateLimit: { requests: 1000, period: 3600 },
   *   quota: { storage: 10737418240, used: 5368709120 }
   * }
   * ```
   */
  metadata?: Record<string, unknown>;

  /**
   * Optional list of permissions granted to the user.
   * These can be used for fine-grained access control in the future.
   */
  permissions?: string[];
};

/**
 * Result type for authentication middleware.
 * - AuthContext: Successful authentication with user identity
 * - null: Authentication failed or not authenticated
 */
export type AuthResult = AuthContext | null;
