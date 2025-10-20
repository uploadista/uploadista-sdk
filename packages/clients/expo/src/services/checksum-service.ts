import type { ChecksumService } from "@uploadista/client-core";
import { computeUint8ArraySha256 } from "../utils/hash-util";

/**
 * Creates a ChecksumService for Expo environments
 * Computes SHA-256 checksums of file data using Web Crypto API
 */
export function createExpoChecksumService(): ChecksumService {
  return {
    computeChecksum: async (data: Uint8Array<ArrayBuffer>) => {
      return computeUint8ArraySha256(data);
    },
  };
}
