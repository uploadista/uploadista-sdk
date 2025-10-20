import { Base64 } from "js-base64";
import { UploadistaError } from "../error";

/**
 * Encodes metadata for upload headers
 */
export function encodeMetadata(
  metadata: Record<string, string | null>,
): string {
  return Object.entries(metadata)
    .map(([key, value]) => `${key} ${Base64.encode(String(value))}`)
    .join(",");
}

/**
 * Checks whether a given status is in the range of the expected category.
 * For example, only a status between 200 and 299 will satisfy the category 200.
 */
export function inStatusCategory(
  status: number,
  category: 100 | 200 | 300 | 400 | 500,
): boolean {
  return status >= category && status < category + 100;
}

export type CalculateFileSizeOptions = {
  uploadLengthDeferred?: boolean;
  uploadSize?: number;
};

/**
 * Calculate the final file size for upload based on options
 */
export function calculateFileSize(
  originalSize: number | null,
  { uploadLengthDeferred, uploadSize }: CalculateFileSizeOptions,
): number | null {
  // First, we look at the uploadLengthDeferred option.
  // Next, we check if the caller has supplied a manual upload size.
  // Finally, we try to use the calculated size from the source object.
  if (uploadLengthDeferred) {
    return null;
  }

  if (uploadSize != null) {
    return uploadSize;
  }

  const size = originalSize;
  if (size == null) {
    throw new UploadistaError({
      name: "UPLOAD_SIZE_NOT_SPECIFIED",
      message:
        "cannot automatically derive upload's size from input. Specify it manually using the `uploadSize` option or use the `uploadLengthDeferred` option",
    });
  }

  return size;
}

/**
 * Calculate segments for parallel upload
 */
export function calculateSegments(
  fileSize: number,
  parallelUploads: number,
  parallelChunkSize?: number,
): { startByte: number; endByte: number; segmentIndex: number }[] {
  if (parallelUploads <= 1) {
    return [{ startByte: 0, endByte: fileSize, segmentIndex: 0 }];
  }

  // Use parallelChunkSize if provided, otherwise divide file equally
  const segments: {
    startByte: number;
    endByte: number;
    segmentIndex: number;
  }[] = [];

  if (parallelChunkSize) {
    // Fixed segment size approach
    let currentByte = 0;
    let segmentIndex = 0;

    while (currentByte < fileSize) {
      const endByte = Math.min(currentByte + parallelChunkSize, fileSize);
      segments.push({
        startByte: currentByte,
        endByte,
        segmentIndex,
      });
      currentByte = endByte;
      segmentIndex++;
    }
  } else {
    // Equal division approach
    const segmentSize = Math.ceil(fileSize / parallelUploads);

    for (let i = 0; i < parallelUploads; i++) {
      const startByte = i * segmentSize;
      const endByte = Math.min(startByte + segmentSize, fileSize);

      if (startByte < fileSize) {
        segments.push({
          startByte,
          endByte,
          segmentIndex: i,
        });
      }
    }
  }

  return segments;
}
