import type { FingerprintService } from "@uploadista/client-core";
import * as Crypto from "expo-crypto";
import type { ExpoUploadInput } from "../types/upload-input";
import { computeblobSha256 } from "../utils/hash-util";

/**
 * Creates a FingerprintService for Expo environments
 * Computes file fingerprints using SHA-256 hashing
 * Supports Blob, File, and URI-based inputs
 */
export function createExpoFingerprintService(): FingerprintService<ExpoUploadInput> {
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
 * Compute fingerprint from a Expo file URI
 * Uses Expo FileSystem to read the file and compute its SHA-256 hash
 */
async function computeFingerprintFromUri(uri: string): Promise<string> {
  try {
    // Use Expo FileSystem to read the file as base64
    const FileSystem = await getExpoFileSystem();
    const fileInfo = await FileSystem.getInfoAsync(uri);

    if (!fileInfo.exists) {
      throw new Error(`File does not exist at URI: ${uri}`);
    }

    // Read the entire file as base64
    const base64String = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to Uint8Array
    const uint8Array = base64ToUint8Array(base64String);

    // Compute SHA-256 hash directly on the Uint8Array
    const hashBuffer = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      uint8Array,
    );

    // Convert hash to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  } catch (error) {
    throw new Error(
      `Failed to compute fingerprint from URI ${uri}: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Dynamically import Expo FileSystem
 * This allows the service to work even if expo-file-system is not installed
 */
async function getExpoFileSystem() {
  try {
    return require("expo-file-system");
  } catch (_error) {
    throw new Error(
      "expo-file-system is required for URI-based fingerprinting. " +
        "Please install it with: npx expo install expo-file-system",
    );
  }
}

/**
 * Convert base64 string to Uint8Array
 * Uses js-base64 library for cross-platform compatibility
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // Use js-base64 for decoding (works in all environments)
  const { fromBase64 } = require("js-base64");
  const binaryString = fromBase64(base64);

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
