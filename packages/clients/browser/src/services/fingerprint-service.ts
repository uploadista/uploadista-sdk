import type { FingerprintService } from "@uploadista/client-core";
import type { BrowserUploadInput } from "../types/upload-input";
import { computeblobSha256 } from "../utils/hash-util";

export function createFingerprintService(): FingerprintService<BrowserUploadInput> {
  return {
    computeFingerprint: async (file, _endpoint) => {
      return computeblobSha256(file);
    },
  };
}
