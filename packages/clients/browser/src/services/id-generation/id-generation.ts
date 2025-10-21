import type { IdGenerationService } from "@uploadista/client-core";

/**
 * Creates a browser-specific ID generation service using the Web Crypto API.
 *
 * This service generates cryptographically secure random UUIDs (v4) using the
 * browser's native `crypto.randomUUID()` method. These UUIDs are used throughout
 * the Uploadista client for:
 * - Upload session identifiers
 * - Chunk identifiers
 * - Request correlation IDs
 * - Internal tracking
 *
 * The generated UUIDs conform to RFC 4122 version 4 (random) and provide
 * strong uniqueness guarantees suitable for distributed systems.
 *
 * Browser compatibility: Requires support for `crypto.randomUUID()` (available
 * in modern browsers). If you need to support older browsers, consider using a
 * polyfill.
 *
 * @returns An IdGenerationService that generates cryptographically secure UUIDs
 *
 * @example
 * ```typescript
 * import { createBrowserIdGenerationService } from '@uploadista/client-browser';
 *
 * const idService = createBrowserIdGenerationService();
 *
 * // Generate a unique ID
 * const id = idService.generate();
 * console.log('Generated ID:', id);
 * // Output: "550e8400-e29b-41d4-a716-446655440000" (example UUID v4)
 *
 * // Each call generates a new unique ID
 * const id2 = idService.generate();
 * console.log('Another ID:', id2);
 * // Output: "7c9e6679-7425-40de-944b-e07fc1f90ae7" (different UUID)
 * ```
 */
export function createBrowserIdGenerationService(): IdGenerationService {
  return {
    /**
     * Generates a cryptographically secure random UUID (v4).
     *
     * Uses the Web Crypto API's `crypto.randomUUID()` method to generate
     * a UUID conforming to RFC 4122 version 4. Each UUID is statistically
     * unique and suitable for use as an identifier in distributed systems.
     *
     * @returns A UUID v4 string in the format "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
     *
     * @example
     * ```typescript
     * const service = createBrowserIdGenerationService();
     * const uploadId = service.generate();
     * console.log(uploadId); // "f47ac10b-58cc-4372-a567-0e02b2c3d479"
     * ```
     */
    generate: () => crypto.randomUUID(),
  };
}
