import { Context, Effect, Layer } from "effect";
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
     * Returns false if no authentication context or permission not found.
     */
    readonly hasPermission: (permission: string) => Effect.Effect<boolean>;

    /**
     * Get the full authentication context if available.
     * Returns null if no authentication context is available.
     */
    readonly getAuthContext: () => Effect.Effect<AuthContext | null>;
  }
>() {}

/**
 * Creates an AuthContextService Layer from an AuthContext.
 * This is typically called by adapters after successful authentication.
 *
 * @param authContext - The authentication context from middleware
 * @returns Effect Layer providing AuthContextService
 */
export const AuthContextServiceLive = (
  authContext: AuthContext | null,
): Layer.Layer<AuthContextService> =>
  Layer.succeed(AuthContextService, {
    getClientId: () => Effect.succeed(authContext?.clientId ?? null),
    getMetadata: () => Effect.succeed(authContext?.metadata ?? {}),
    hasPermission: (permission: string) =>
      Effect.succeed(authContext?.permissions?.includes(permission) ?? false),
    getAuthContext: () => Effect.succeed(authContext),
  });

/**
 * No-auth implementation of AuthContextService.
 * Returns null/empty values for all operations.
 * Used when no authentication middleware is configured (backward compatibility).
 */
export const NoAuthContextServiceLive: Layer.Layer<AuthContextService> =
  AuthContextServiceLive(null);
