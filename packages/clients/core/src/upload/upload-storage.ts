import type { JsonValue } from "@uploadista/core/types";
import type { IdGenerationService } from "../services/id-generation-service";
import type { ClientStorage } from "../storage/client-storage";
import type { PreviousUpload } from "../types/previous-upload";

/**
 * Find previous uploads by fingerprint
 */
export async function findPreviousUploads(
  clientStorage: ClientStorage,
  fingerprint: string,
): Promise<PreviousUpload[]> {
  return clientStorage.findUploadsByFingerprint(fingerprint);
}

/**
 * Resume from a previous upload
 */
export function resumeFromPreviousUpload(previousUpload: PreviousUpload): {
  uploadId: string | null;
  parallelUploadUrls: string[] | undefined;
  clientStorageKey: string | null;
} {
  return {
    uploadId: previousUpload.uploadId ?? null,
    parallelUploadUrls: previousUpload.parallelUploadUrls,
    clientStorageKey: previousUpload.clientStorageKey,
  };
}

/**
 * Add the upload URL to the URL storage, if possible.
 */
export async function saveUploadInClientStorage({
  clientStorage,
  fingerprint,
  size,
  metadata,
  clientStorageKey,
  storeFingerprintForResuming,
  generateId,
}: {
  clientStorage: ClientStorage;
  fingerprint: string;
  size: number;
  metadata: Record<string, JsonValue>;
  clientStorageKey: string | null;
  storeFingerprintForResuming: boolean;
  generateId: IdGenerationService;
}): Promise<string | undefined> {
  // We do not store the upload key
  // - if it was disabled in the option, or
  // - if no fingerprint was calculated for the input (i.e. a stream), or
  // - if the key is already stored.
  if (
    !storeFingerprintForResuming ||
    !fingerprint ||
    clientStorageKey != null
  ) {
    return undefined;
  }

  const storedUpload: PreviousUpload = {
    size,
    metadata,
    creationTime: new Date().toString(),
    clientStorageKey: fingerprint,
  };

  const newClientStorageKey = await clientStorage.addUpload(
    fingerprint,
    storedUpload,
    { generateId },
  );

  return newClientStorageKey;
}

/**
 * Remove the entry in the URL storage, if it has been saved before.
 */
export async function removeFromClientStorage(
  clientStorage: ClientStorage,
  clientStorageKey: string,
): Promise<void> {
  if (!clientStorageKey) return;
  await clientStorage.removeUpload(clientStorageKey);
}
