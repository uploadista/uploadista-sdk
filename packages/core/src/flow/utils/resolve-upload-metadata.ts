import type { UploadFile } from "../../types";

type FileMetadata = UploadFile["metadata"];

export type ResolvedUploadMetadata = {
  type: string;
  fileName: string;
  metadata: FileMetadata;
  metadataJson: string | undefined;
};

export function resolveUploadMetadata(
  metadata: FileMetadata,
): ResolvedUploadMetadata {
  if (!metadata) {
    return {
      type: "",
      fileName: "",
      metadata: undefined,
      metadataJson: undefined,
    };
  }

  const normalized = { ...metadata };
  const type = String(
    normalized.type || normalized.mimeType || normalized["content-type"] || ""
  );
  if (type) {
    normalized.type ||= type;
    normalized.mimeType ||= type;
  }

  const fileName = String(
    normalized.fileName || normalized.originalName || normalized.name || ""
  );
  if (fileName) {
    normalized.fileName ||= fileName;
    normalized.originalName ||= fileName;
    normalized.name ||= fileName;
  }

  return {
    type,
    fileName,
    metadata: normalized,
    metadataJson: JSON.stringify(normalized),
  };
}
