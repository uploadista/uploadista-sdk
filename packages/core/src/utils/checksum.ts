import { Effect } from "effect";
import { UploadistaError } from "../errors/uploadista-error";

/**
 * Supported checksum algorithms
 */
const SUPPORTED_ALGORITHMS = ["sha256"] as const;
export type ChecksumAlgorithm = (typeof SUPPORTED_ALGORITHMS)[number];

/**
 * Check if a checksum algorithm is supported
 */
export function isSupportedAlgorithm(algorithm: string): algorithm is ChecksumAlgorithm {
  return SUPPORTED_ALGORITHMS.includes(algorithm as ChecksumAlgorithm);
}

/**
 * Compute checksum of file bytes using the Web Crypto API.
 * This works across all modern platforms: browsers, Node.js 15+, Deno, Bun, and Cloudflare Workers.
 *
 * @param bytes - File content as Uint8Array
 * @param algorithm - Hashing algorithm to use (currently only 'sha256' is supported)
 * @returns Effect that resolves to hex-encoded checksum string
 */
export function computeChecksum(
  bytes: Uint8Array,
  algorithm: string,
): Effect.Effect<string, UploadistaError> {
  return Effect.gen(function* () {
    // Validate algorithm is supported
    if (!isSupportedAlgorithm(algorithm)) {
      return yield* UploadistaError.fromCode("UNSUPPORTED_CHECKSUM_ALGORITHM", {
        body: `Checksum algorithm '${algorithm}' is not supported. Supported algorithms: ${SUPPORTED_ALGORITHMS.join(", ")}`,
        details: { algorithm, supportedAlgorithms: SUPPORTED_ALGORITHMS },
      }).toEffect();
    }

    // Map algorithm name to Web Crypto API algorithm name
    const webCryptoAlgorithm = algorithm.toUpperCase().replace(/\d+/, "-$&"); // "sha256" -> "SHA-256"

    // Compute hash using Web Crypto API (available in browsers, Node.js 15+, Deno, Bun, Cloudflare Workers)
    // Pass Uint8Array directly - it's a valid BufferSource
    const hashBuffer = yield* Effect.tryPromise({
      try: () => crypto.subtle.digest(webCryptoAlgorithm, bytes as BufferSource),
      catch: (error) =>
        UploadistaError.fromCode("UNKNOWN_ERROR", {
          body: `Failed to compute checksum: ${error instanceof Error ? error.message : "Unknown error"}`,
          cause: error,
          details: { algorithm },
        }),
    });

    // Convert ArrayBuffer to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  });
}
