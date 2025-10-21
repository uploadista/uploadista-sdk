import type { ChecksumService } from "@uploadista/client-core";
import { computeblobSha256 } from "../utils/hash-util";

/**
 * Creates a checksum service for verifying data integrity using SHA-256 hashing.
 *
 * This service uses the browser's Web Crypto API to compute SHA-256 checksums
 * of data chunks during upload. Checksums ensure that uploaded data hasn't been
 * corrupted in transit and matches what was sent.
 *
 * The service is optimized for browser environments and leverages native crypto
 * APIs for performance.
 *
 * @returns A ChecksumService that computes SHA-256 hashes for data chunks
 *
 * @example
 * ```typescript
 * import { createChecksumService } from '@uploadista/client-browser';
 *
 * const checksumService = createChecksumService();
 *
 * // Compute checksum for a data chunk
 * const data = new Uint8Array([1, 2, 3, 4, 5]);
 * const checksum = await checksumService.computeChecksum(data);
 * console.log('SHA-256 checksum:', checksum);
 * // Output: "74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0"
 * ```
 *
 * @see {@link computeblobSha256} for the underlying hash implementation
 */
export function createChecksumService(): ChecksumService {
  return {
    /**
     * Computes a SHA-256 checksum for the provided data.
     *
     * Converts the Uint8Array to a Blob and uses the Web Crypto API
     * to calculate its SHA-256 hash, returned as a hex string.
     *
     * @param data - The data to checksum
     * @returns Promise resolving to the hex-encoded SHA-256 checksum
     */
    computeChecksum: async (data: Uint8Array<ArrayBuffer>) => {
      return computeblobSha256(new Blob([data]));
    },
  };
}
