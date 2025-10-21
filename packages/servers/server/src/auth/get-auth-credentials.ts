/**
 * Response type for authentication credential requests.
 * - `isValid: true` with token and expiration
 * - `isValid: false` with error message
 *
 * @example
 * ```typescript
 * const response = await getAuthCredentials({
 *   uploadistaClientId: "my-client",
 *   uploadistaApiKey: "sk_..."
 * });
 * if (response.isValid) {
 *   console.log(`Token: ${response.data.token}`);
 * } else {
 *   console.error(`Auth failed: ${response.error}`);
 * }
 * ```
 */
export type AuthCredentialsResponse =
  | {
      isValid: true;
      data: { token: string; expiresIn: number };
    }
  | {
      isValid: false;
      error: string;
    };

/**
 * Retrieve JWT authentication credentials from the Uploadista server.
 * This function exchanges client credentials (ID + API key) for a signed JWT token.
 *
 * The JWT token is then used in subsequent API requests via the Authorization header.
 * Tokens are time-limited and should be refreshed before expiration.
 *
 * @param params - Credential exchange parameters
 * @param params.uploadistaClientId - Your Uploadista client ID
 * @param params.uploadistaApiKey - Your Uploadista API key (secret)
 * @param params.baseUrl - Uploadista server base URL (default: https://api.uploadista.com)
 * @returns Promise resolving to authentication response with token or error
 *
 * @example
 * ```typescript
 * import { getAuthCredentials } from "@uploadista/server";
 *
 * // Get JWT token for API requests
 * const response = await getAuthCredentials({
 *   uploadistaClientId: process.env.UPLOADISTA_CLIENT_ID,
 *   uploadistaApiKey: process.env.UPLOADISTA_API_KEY,
 * });
 *
 * if (response.isValid) {
 *   // Use token in API requests
 *   const headers = {
 *     Authorization: `Bearer ${response.data.token}`,
 *   };
 *
 *   // Token expires in response.data.expiresIn seconds
 *   setTimeout(
 *     () => {
 *       // Refresh token before expiration
 *     },
 *     response.data.expiresIn * 1000,
 *   );
 * }
 * ```
 */
export const getAuthCredentials = async ({
  uploadistaClientId,
  uploadistaApiKey,
  baseUrl = "https://api.uploadista.com",
}: {
  uploadistaClientId: string;
  uploadistaApiKey: string;
  baseUrl?: string;
}): Promise<AuthCredentialsResponse> => {
  const response = await fetch(
    `${baseUrl}/uploadista/auth/jwt?apiKey=${uploadistaApiKey}&clientId=${uploadistaClientId}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    },
  );

  if (response.ok !== true) {
    return { isValid: false, error: "Failed to get auth credentials" };
  }

  const data = (await response.json()) as { token: string; expiresIn: number };

  return {
    isValid: true,
    data,
  };
};
