/**
 * Authorization Error Types
 *
 * Error classes for permission and authorization failures.
 */

import { AdapterError } from "../error-types";

/**
 * Authorization error - indicates the user lacks required permissions.
 * Returns HTTP 403 Forbidden status.
 *
 * @example
 * ```typescript
 * if (!hasPermission(permissions, "engine:metrics")) {
 *   throw new AuthorizationError("engine:metrics");
 * }
 * ```
 */
export class AuthorizationError extends AdapterError {
  /**
   * The permission that was required but not granted.
   */
  public readonly requiredPermission: string;

  constructor(requiredPermission: string, message?: string) {
    super(
      message ?? `Permission denied: ${requiredPermission} required`,
      403,
      "PERMISSION_DENIED",
    );
    this.name = "AuthorizationError";
    this.requiredPermission = requiredPermission;
  }
}

/**
 * Authentication required error - indicates no authentication context.
 * Returns HTTP 401 Unauthorized status.
 *
 * @example
 * ```typescript
 * if (!authContext) {
 *   throw new AuthenticationRequiredError();
 * }
 * ```
 */
export class AuthenticationRequiredError extends AdapterError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_REQUIRED");
    this.name = "AuthenticationRequiredError";
  }
}

/**
 * Organization mismatch error - indicates accessing a resource from another organization.
 * Returns HTTP 403 Forbidden status.
 *
 * @example
 * ```typescript
 * if (resource.organizationId !== clientId) {
 *   throw new OrganizationMismatchError();
 * }
 * ```
 */
export class OrganizationMismatchError extends AdapterError {
  constructor(message = "Access denied: resource belongs to another organization") {
    super(message, 403, "ORGANIZATION_MISMATCH");
    this.name = "OrganizationMismatchError";
  }
}

/**
 * Quota exceeded error - indicates usage quota has been exceeded.
 * Returns HTTP 402 Payment Required status.
 *
 * @example
 * ```typescript
 * if (usage > quota) {
 *   throw new QuotaExceededError("Storage quota exceeded");
 * }
 * ```
 */
export class QuotaExceededError extends AdapterError {
  constructor(message = "Quota exceeded", code = "QUOTA_EXCEEDED") {
    super(message, 402, code);
    this.name = "QuotaExceededError";
  }
}

/**
 * Creates a standardized error response body for AuthorizationError.
 * Includes the required permission in the response.
 *
 * @param error - The AuthorizationError to format
 * @returns Standardized error response body
 */
export const createAuthorizationErrorResponseBody = (
  error: AuthorizationError,
) => ({
  error: error.message,
  code: error.errorCode,
  requiredPermission: error.requiredPermission,
  timestamp: new Date().toISOString(),
});
