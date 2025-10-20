/**
 * Compute SHA-256 checksum of a file using the Web Crypto API
 *
 * @param blob - Blob to hash
 * @returns Promise that resolves to hex-encoded SHA-256 checksum
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
