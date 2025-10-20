import * as Crypto from "expo-crypto";

/**
 * Compute SHA-256 checksum using Web Crypto API
 * Compatible with React Native and Expo environments
 *
 * @param data - Uint8Array to hash
 * @returns Promise that resolves to hex-encoded SHA-256 checksum
 */
export async function computeUint8ArraySha256(
  data: Uint8Array,
): Promise<string> {
  try {
    // Compute SHA-256 hash using Web Crypto API
    const hashBuffer = await Crypto.digest(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data,
    );

    // Convert hash to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  } catch (error) {
    throw new Error(
      `Failed to compute checksum: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Compute SHA-256 checksum of a Blob using Web Crypto API
 * Compatible with React Native and Expo Blob objects
 *
 * @param blob - Blob to hash
 * @returns Promise that resolves to hex-encoded SHA-256 checksum
 */
export async function computeblobSha256(blob: Blob): Promise<string> {
  try {
    // Convert Blob to Uint8Array using FileReader for compatibility
    const uint8Array = await blobToUint8Array(blob);
    return computeUint8ArraySha256(uint8Array);
  } catch (error) {
    throw new Error(
      `Failed to compute file checksum: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

/**
 * Convert Blob to Uint8Array using FileReader
 * Works in React Native and Expo environments
 */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error("FileReader result is not an ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
