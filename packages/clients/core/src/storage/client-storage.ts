import type { IdGenerationService } from "../services/id-generation-service";
import type { StorageService } from "../services/storage-service";
import {
  type PreviousUpload,
  previousUploadSchema,
} from "../types/previous-upload";

export type ClientStorage = {
  findAllUploads: () => Promise<PreviousUpload[]>;
  findUploadsByFingerprint: (fingerprint: string) => Promise<PreviousUpload[]>;

  removeUpload: (clientStorageKey: string) => Promise<void>;

  // Returns the storage key, which can be used for removing the upload.
  addUpload: (
    fingerprint: string,
    upload: PreviousUpload,
    { generateId }: { generateId: IdGenerationService },
  ) => Promise<string | undefined>;
};

export function createClientStorage(
  storageService: StorageService,
): ClientStorage {
  return {
    findAllUploads: async () => {
      const items = await storageService.find("uploadista::");
      return Object.values(items).map((item) =>
        previousUploadSchema.parse(JSON.parse(item)),
      );
    },
    findUploadsByFingerprint: async (fingerprint: string) => {
      const items = await storageService.find(`uploadista::${fingerprint}`);
      return Object.values(items).map((item) =>
        previousUploadSchema.parse(JSON.parse(item)),
      );
    },
    removeUpload: (clientStorageKey: string) =>
      storageService.removeItem(clientStorageKey),
    addUpload: async (
      fingerprint: string,
      upload: PreviousUpload,
      { generateId }: { generateId: IdGenerationService },
    ) => {
      const key = generateId.generate();
      const clientStorageKey = `uploadista::${fingerprint}::${key}`;
      await storageService.setItem(clientStorageKey, JSON.stringify(upload));
      return clientStorageKey;
    },
  };
}
