import type { FingerprintService } from "@uploadista/client-core";
import type { BrowserUploadInput } from "../types/upload-input";
import { computeblobSha256 } from "../utils/hash-util";

/**
 * Creates a fingerprint service for generating unique file identifiers.
 *
 * This service computes SHA-256 fingerprints of files to uniquely identify them.
 * Fingerprints are used for:
 * - Detecting duplicate uploads
 * - Resuming interrupted uploads
 * - Verifying file integrity
 * - Implementing deduplication strategies
 *
 * The fingerprint is computed using the Web Crypto API and represents the
 * SHA-256 hash of the entire file content. Two identical files will always
 * produce the same fingerprint.
 *
 * @returns A FingerprintService that computes SHA-256 fingerprints for browser files
 *
 * @example
 * ```typescript
 * import { createFingerprintService } from '@uploadista/client-browser';
 *
 * const fingerprintService = createFingerprintService();
 *
 * // Generate fingerprint for a file
 * const fileInput = document.querySelector('input[type="file"]');
 * const file = fileInput.files[0];
 *
 * const fingerprint = await fingerprintService.computeFingerprint(
 *   file,
 *   'https://api.example.com/upload'
 * );
 *
 * console.log('File fingerprint:', fingerprint);
 * // Can be used to check if file was previously uploaded
 * ```
 *
 * @see {@link computeblobSha256} for the underlying hash implementation
 */
export function createFingerprintService(): FingerprintService<BrowserUploadInput> {
  return {
    /**
     * Computes a unique fingerprint for a file.
     *
     * Calculates the SHA-256 hash of the entire file content. The endpoint
     * parameter is currently unused but included for interface compatibility
     * with other platform implementations that might use it for salt or
     * endpoint-specific fingerprinting.
     *
     * @param file - The File or Blob to fingerprint
     * @param _endpoint - Upload endpoint (currently unused, reserved for future use)
     * @returns Promise resolving to the hex-encoded SHA-256 fingerprint
     *
     * @example
     * ```typescript
     * const file = new File(['content'], 'example.txt');
     * const fingerprint = await service.computeFingerprint(file, 'https://api.example.com');
     * // fingerprint: "ed7002b439e9ac845f22357d822bac1444730fbdb6016d3ec9432297b9ec9f73"
     * ```
     */
    computeFingerprint: async (file, _endpoint) => {
      return computeblobSha256(file);
    },
  };
}
