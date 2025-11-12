import { Context, type Effect, type Layer } from "effect";
import type { UploadistaError } from "../../errors";

/**
 * Shape definition for the Credential Provider interface.
 * Defines the contract for retrieving credentials for various services.
 */
export interface CredentialProviderShape {
  /**
   * Retrieves credentials for a specific service and client.
   *
   * @param params - Parameters for credential retrieval
   * @param params.clientId - Unique identifier for the client, or null if not available
   * @param params.serviceType - Optional service type to get specific credentials for
   * @returns An Effect that resolves to a record of credential key-value pairs
   * @throws {UploadistaError} When credential retrieval fails
   */
  getCredential: (params: {
    clientId: string | null;
    serviceType?: string;
  }) => Effect.Effect<Record<string, unknown>, UploadistaError>;
}

/**
 * Context tag for the Credential Provider.
 *
 * This tag provides a type-safe way to access credential functionality
 * throughout the application using Effect's dependency injection system.
 *
 * @example
 * ```typescript
 * import { CredentialProvider } from "@uploadista/core/flow/plugins";
 *
 * // In your flow node
 * const program = Effect.gen(function* () {
 *   const credentialProvider = yield* CredentialProvider;
 *   const credentials = yield* credentialProvider.getCredential({
 *     clientId: "user123",
 *     serviceType: "replicate"
 *   });
 *   return credentials;
 * });
 * ```
 */
export class CredentialProvider extends Context.Tag("CredentialProvider")<
  CredentialProvider,
  CredentialProviderShape
>() {}

export type CredentialProviderLayer = Layer.Layer<
  CredentialProvider,
  never,
  never
>;
