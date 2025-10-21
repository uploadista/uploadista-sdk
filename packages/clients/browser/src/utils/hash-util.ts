/**
 * Computes the SHA-256 checksum of a Blob using the Web Crypto API.
 *
 * This utility function provides a browser-native way to compute cryptographic
 * hashes of file data. It uses the SubtleCrypto API (part of Web Crypto) which
 * provides hardware-accelerated cryptographic operations when available.
 *
 * The SHA-256 algorithm produces a 256-bit (32-byte) hash value, typically
 * rendered as a 64-character hexadecimal string. SHA-256 is widely used for:
 * - File integrity verification
 * - Content deduplication
 * - File fingerprinting
 * - Checksum validation
 *
 * **Performance note:** For large files (>100MB), this function loads the entire
 * file into memory before hashing. For extremely large files, consider chunked
 * hashing approaches if memory is a concern.
 *
 * @param blob - The Blob or File to hash
 * @returns Promise resolving to the hex-encoded SHA-256 hash
 *
 * @throws {Error} When the hash computation fails (e.g., out of memory, crypto API unavailable)
 *
 * @example
 * ```typescript
 * import { computeblobSha256 } from '@uploadista/client-browser';
 *
 * // Hash a File from input
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 * const hash = await computeblobSha256(file);
 * console.log('File SHA-256:', hash);
 * // Output: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
 *
 * // Hash a Blob
 * const blob = new Blob(['Hello, World!'], { type: 'text/plain' });
 * const hash = await computeblobSha256(blob);
 * console.log('Blob SHA-256:', hash);
 *
 * // Verify file integrity
 * const expectedHash = 'abc123...';
 * const actualHash = await computeblobSha256(file);
 * if (actualHash === expectedHash) {
 *   console.log('File integrity verified');
 * } else {
 *   console.error('File has been modified or corrupted');
 * }
 *
 * // Check for duplicate files
 * const file1Hash = await computeblobSha256(file1);
 * const file2Hash = await computeblobSha256(file2);
 * if (file1Hash === file2Hash) {
 *   console.log('Files are identical (same content)');
 * }
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest} for SubtleCrypto.digest API
 */
export async function computeblobSha256(blob: Blob): Promise<string> {
  try {
    // Read blob as ArrayBuffer
    const arrayBuffer = await blob.arrayBuffer();

    // Compute SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);

    // Convert hash to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  } catch (error) {
    throw new Error(
      `Failed to compute file checksum: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
