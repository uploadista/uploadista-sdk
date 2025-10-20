import type { ChecksumService } from "@uploadista/client-core";
import { computeblobSha256 } from "../utils/hash-util";

export function createChecksumService(): ChecksumService {
  return {
    computeChecksum: async (data: Uint8Array<ArrayBuffer>) => {
      return computeblobSha256(new Blob([data]));
    },
  };
}
