import type { FingerprintService } from "@uploadista/client-core";
import type { ReactNativeUploadInput } from "@uploadista/react-native-core";
import { createHash } from "react-native-quick-crypto";
import { computeblobSha256 } from "../utils/hash-util";

/**
 * Creates a FingerprintService for bare React Native environments
 * Computes file fingerprints using SHA-256 hashing
 * Supports Blob, File, and URI-based inputs
 */
export function createReactNativeFingerprintService(): FingerprintService<ReactNativeUploadInput> {
  return {
    computeFingerprint: async (input, _endpoint) => {
      // Handle Blob/File objects directly
      if (input instanceof Blob) {
        return computeblobSha256(input);
      }

      // For URI inputs (string or {uri: string}), we need to convert to Blob first
      if (
        typeof input === "string" ||
        (input && typeof input === "object" && "uri" in input)
      ) {
        const uri =
          typeof input === "string" ? input : (input as { uri: string }).uri;
        return computeFingerprintFromUri(uri);
      }

      throw new Error(
        "Unsupported file input type for fingerprinting. Expected Blob, File, URI string, or {uri: string}",
      );
    },
  };
}

/**
 * Compute fingerprint from a file URI
 * Uses rn-fetch-blob to read the file and compute its SHA-256 hash
 */
async function computeFingerprintFromUri(uri: string): Promise<string> {
  try {
    // Use rn-fetch-blob to read the file as base64
    const RNFetchBlob = getRNFetchBlob();

    // Normalize URI path for rn-fetch-blob
    const normalizedPath = normalizeUri(uri);

    // Check if file exists
    const exists = await RNFetchBlob.fs.exists(normalizedPath);
    if (!exists) {
      throw new Error(`File does not exist at URI: ${uri}`);
    }

    // Read the entire file as base64
    const base64String = await RNFetchBlob.fs.readFile(normalizedPath, "base64");

    // Convert base64 to Uint8Array
    const uint8Array = base64ToUint8Array(base64String);

    // Compute SHA-256 hash using react-native-quick-crypto
    const hash = createHash("sha256");
    hash.update(uint8Array);
    return hash.digest("hex");
  } catch (error) {
    throw new Error(
      `Failed to compute fingerprint from URI ${uri}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Normalize URI for rn-fetch-blob
 * Strips file:// prefix and handles platform-specific paths
 */
function normalizeUri(uri: string): string {
  // Remove file:// prefix if present
  if (uri.startsWith("file://")) {
    return uri.substring(7);
  }
  return uri;
}

/**
 * Get rn-fetch-blob module
 * This allows the service to work even if rn-fetch-blob is not installed
 */
function getRNFetchBlob() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("rn-fetch-blob").default;
  } catch (_error) {
    throw new Error(
      "rn-fetch-blob is required for URI-based fingerprinting. " +
        "Please install it with: npm install rn-fetch-blob",
    );
  }
}

/**
 * Convert base64 string to Uint8Array
 * Uses js-base64 library for cross-platform compatibility
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Use js-base64 for decoding (works in all environments)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { fromBase64 } = require("js-base64");
  const binaryString = fromBase64(base64);

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
