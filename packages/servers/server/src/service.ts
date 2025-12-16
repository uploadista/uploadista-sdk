import { Context, Effect, Layer } from "effect";
import {
  AuthenticationRequiredError,
  AuthorizationError,
} from "./permissions/errors";
import {
  hasAnyPermission as matchHasAnyPermission,
  hasPermission as matchHasPermission,
} from "./permissions/matcher";
import type { AuthContext } from "./types";

/**
 * Authentication Context Service
 *
 * Provides access to the current authentication context throughout
 * the upload and flow processing pipeline. The service is provided
 * via Effect Layer and can be accessed using Effect.service().
 *
 * @example
 * ```typescript
 * import { Effect } from "effect";
 * import { AuthContextService } from "@uploadista/server";
 *
 * const uploadHandler = Effect.gen(function* () {
 *   const authService = yield* AuthContextService;
 *   const clientId = yield* authService.getClientId();
 *   if (clientId) {
 *     console.log(`Processing upload for client: ${clientId}`);
 *   }
 * });
 * ```
 */
export class AuthContextService extends Context.Tag("AuthContextService")<
  AuthContextService,
  {
    /**
     * Get the current client ID from auth context.
     * Returns null if no authentication context is available.
     */
    readonly getClientId: () => Effect.Effect<string | null>;

    /**
     * Get the current auth metadata.
     * Returns empty object if no authentication context or no metadata.
     */
    readonly getMetadata: () => Effect.Effect<Record<string, unknown>>;

    /**
     * Check if the current client has a specific permission.
     * Supports exact match, wildcard match, and hierarchical match.
     * Returns false if no authentication context or permission not found.
     *
     * @example
     * ```typescript
     * // Exact match
     * yield* authService.hasPermission("engine:health")
     *
     * // Wildcard: user with "engine:*" will match "engine:health"
     * yield* authService.hasPermission("engine:health")
     *
     * // Hierarchical: user with "engine:dlq" will match "engine:dlq:read"
     * yield* authService.hasPermission("engine:dlq:read")
     * ```
     */
    readonly hasPermission: (permission: string) => Effect.Effect<boolean>;

    /**
     * Check if the current client has any of the specified permissions.
     * Returns true if at least one permission is granted.
     */
    readonly hasAnyPermission: (
      permissions: readonly string[],
    ) => Effect.Effect<boolean>;

    /**
     * Require a specific permission, failing with AuthorizationError if not granted.
     * Use this when you want to fail fast on missing permissions.
     *
     * @throws AuthorizationError if permission is not granted
     * @throws AuthenticationRequiredError if no auth context
     *
     * @example
     * ```typescript
     * const protectedHandler = Effect.gen(function* () {
     *   const authService = yield* AuthContextService;
     *   yield* authService.requirePermission("engine:metrics");
     *   // Only reaches here if permission is granted
     *   return yield* getMetrics();
     * });
     * ```
     */
    readonly requirePermission: (
      permission: string,
    ) => Effect.Effect<void, AuthorizationError | AuthenticationRequiredError>;

    /**
     * Require authentication, failing with AuthenticationRequiredError if not authenticated.
     *
     * @throws AuthenticationRequiredError if no auth context
     */
    readonly requireAuthentication: () => Effect.Effect<
      AuthContext,
      AuthenticationRequiredError
    >;

    /**
     * Get all permissions granted to the current client.
     * Returns empty array if no authentication context or no permissions.
     */
    readonly getPermissions: () => Effect.Effect<readonly string[]>;

    /**
     * Get the full authentication context if available.
     * Returns null if no authentication context is available.
     */
    readonly getAuthContext: () => Effect.Effect<AuthContext | null>;
  }
>() {}

/**
 * Options for creating an AuthContextService Layer.
 */
export interface AuthContextServiceOptions {
  /**
   * When true, bypasses all permission checks (grants all permissions).
   * Used when no auth middleware is configured (backward compatibility).
   * @default false
   */
  bypassAuth?: boolean;
}

/**
 * Creates an AuthContextService Layer from an AuthContext.
 * This is typically called by adapters after successful authentication.
 *
 * @param authContext - The authentication context from middleware
 * @param options - Optional configuration for auth behavior
 * @returns Effect Layer providing AuthContextService
 */
export const AuthContextServiceLive = (
  authContext: AuthContext | null,
  options?: AuthContextServiceOptions,
): Layer.Layer<AuthContextService> => {
  const permissions = authContext?.permissions ?? [];
  const bypassAuth = options?.bypassAuth ?? false;

  return Layer.succeed(AuthContextService, {
    getClientId: () => Effect.succeed(authContext?.clientId ?? null),

    getMetadata: () => Effect.succeed(authContext?.metadata ?? {}),

    hasPermission: (permission: string) =>
      bypassAuth
        ? Effect.succeed(true)
        : Effect.succeed(matchHasPermission(permissions, permission)),

    hasAnyPermission: (requiredPermissions: readonly string[]) =>
      bypassAuth
        ? Effect.succeed(true)
        : Effect.succeed(
            matchHasAnyPermission(permissions, requiredPermissions),
          ),

    requirePermission: (permission: string) =>
      Effect.gen(function* () {
        // If bypass mode is enabled, grant all permissions
        if (bypassAuth) {
          yield* Effect.logDebug(
            `[Auth] Bypass mode: permission '${permission}' auto-granted`,
          );
          return;
        }
        if (!authContext) {
          yield* Effect.logDebug(
            `[Auth] Permission check failed: authentication required for '${permission}'`,
          );
          return yield* Effect.fail(new AuthenticationRequiredError());
        }
        if (!matchHasPermission(permissions, permission)) {
          yield* Effect.logDebug(
            `[Auth] Permission denied: '${permission}' for client '${authContext.clientId}'`,
          );
          return yield* Effect.fail(new AuthorizationError(permission));
        }
        yield* Effect.logDebug(
          `[Auth] Permission granted: '${permission}' for client '${authContext.clientId}'`,
        );
      }),

    requireAuthentication: () =>
      authContext
        ? Effect.succeed(authContext)
        : Effect.fail(new AuthenticationRequiredError()),

    getPermissions: () => Effect.succeed(permissions),

    getAuthContext: () => Effect.succeed(authContext),
  });
};

/**
 * No-auth implementation of AuthContextService.
 * Returns null/empty values for all operations.
 * Used when no authentication middleware is configured (backward compatibility).
 */
export const NoAuthContextServiceLive: Layer.Layer<AuthContextService> =
  AuthContextServiceLive(null);
