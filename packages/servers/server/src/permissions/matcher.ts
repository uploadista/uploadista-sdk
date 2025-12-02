/**
 * Permission Matching Logic
 *
 * Implements permission matching with support for:
 * - Exact match: `engine:health` matches `engine:health`
 * - Wildcard match: `engine:*` matches `engine:health`, `engine:metrics`, etc.
 * - Hierarchical match: `engine:dlq` implies `engine:dlq:read` and `engine:dlq:write`
 */

import { PERMISSION_HIERARCHY } from "./types";

/**
 * Checks if a granted permission matches a required permission.
 *
 * @param granted - The permission that has been granted to the user
 * @param required - The permission that is required for the operation
 * @returns true if the granted permission satisfies the required permission
 *
 * @example
 * ```typescript
 * matchesPermission("engine:*", "engine:health") // true (wildcard)
 * matchesPermission("engine:health", "engine:health") // true (exact)
 * matchesPermission("engine:dlq", "engine:dlq:read") // true (hierarchical)
 * matchesPermission("flow:execute", "engine:health") // false
 * ```
 */
export const matchesPermission = (
  granted: string,
  required: string,
): boolean => {
  // Exact match
  if (granted === required) {
    return true;
  }

  // Wildcard match: `engine:*` matches `engine:health`
  if (granted.endsWith(":*")) {
    const prefix = granted.slice(0, -1); // Remove the `*`, keep the `:`
    if (required.startsWith(prefix)) {
      return true;
    }
  }

  // Hierarchical match: `engine:dlq` implies `engine:dlq:read`
  const impliedPermissions = PERMISSION_HIERARCHY[granted];
  if (impliedPermissions?.includes(required)) {
    return true;
  }

  return false;
};

/**
 * Checks if any of the granted permissions satisfy the required permission.
 *
 * @param grantedPermissions - Array of permissions granted to the user
 * @param required - The permission that is required for the operation
 * @returns true if any granted permission satisfies the required permission
 *
 * @example
 * ```typescript
 * hasPermission(["flow:*", "upload:create"], "flow:execute") // true
 * hasPermission(["upload:create"], "flow:execute") // false
 * ```
 */
export const hasPermission = (
  grantedPermissions: readonly string[],
  required: string,
): boolean => {
  return grantedPermissions.some((granted) =>
    matchesPermission(granted, required),
  );
};

/**
 * Checks if any of the granted permissions satisfy any of the required permissions.
 *
 * @param grantedPermissions - Array of permissions granted to the user
 * @param requiredPermissions - Array of permissions, any of which would be sufficient
 * @returns true if any granted permission satisfies any required permission
 *
 * @example
 * ```typescript
 * hasAnyPermission(["upload:create"], ["flow:execute", "upload:create"]) // true
 * hasAnyPermission(["upload:read"], ["flow:execute", "upload:create"]) // false
 * ```
 */
export const hasAnyPermission = (
  grantedPermissions: readonly string[],
  requiredPermissions: readonly string[],
): boolean => {
  return requiredPermissions.some((required) =>
    hasPermission(grantedPermissions, required),
  );
};

/**
 * Checks if all of the required permissions are satisfied.
 *
 * @param grantedPermissions - Array of permissions granted to the user
 * @param requiredPermissions - Array of permissions, all of which must be satisfied
 * @returns true if all required permissions are satisfied
 *
 * @example
 * ```typescript
 * hasAllPermissions(["flow:*", "upload:*"], ["flow:execute", "upload:create"]) // true
 * hasAllPermissions(["flow:execute"], ["flow:execute", "upload:create"]) // false
 * ```
 */
export const hasAllPermissions = (
  grantedPermissions: readonly string[],
  requiredPermissions: readonly string[],
): boolean => {
  return requiredPermissions.every((required) =>
    hasPermission(grantedPermissions, required),
  );
};

/**
 * Expands a permission to include all implied permissions.
 * Useful for display or audit purposes.
 *
 * @param permission - The permission to expand
 * @returns Array of the permission and all implied permissions
 *
 * @example
 * ```typescript
 * expandPermission("engine:dlq") // ["engine:dlq", "engine:dlq:read", "engine:dlq:write"]
 * expandPermission("engine:health") // ["engine:health"]
 * ```
 */
export const expandPermission = (permission: string): string[] => {
  const result = [permission];
  const implied = PERMISSION_HIERARCHY[permission];
  if (implied) {
    result.push(...implied);
  }
  return result;
};
