import type { R2UploadedPart } from "../types";

export const calcOffsetFromParts = (parts?: Array<R2UploadedPart>): number => {
  return parts && parts.length > 0
    ? parts.reduce((a, b) => a + (b?.size ?? 0), 0)
    : 0;
};

export const calcOptimalPartSize = (
  initSize: number | undefined,
  preferredPartSize: number,
  minPartSize: number,
  maxMultipartParts: number,
  maxUploadSize = 5_497_558_138_880, // 5TiB
): number => {
  const size = initSize ?? maxUploadSize;
  let optimalPartSize: number;

  if (size <= preferredPartSize) {
    // For files smaller than preferred part size, use the file size
    // but ensure it meets S3's minimum requirements for multipart uploads
    optimalPartSize = size;
  } else if (size <= preferredPartSize * maxMultipartParts) {
    // File fits within max parts limit using preferred part size
    optimalPartSize = preferredPartSize;
  } else {
    // File is too large for preferred part size, calculate minimum needed
    optimalPartSize = Math.ceil(size / maxMultipartParts);
  }

  // Ensure we respect minimum part size for multipart uploads
  // Exception: if the file is smaller than minPartSize, use the file size directly
  const finalPartSize =
    initSize && initSize < minPartSize
      ? optimalPartSize // Single part upload for small files
      : Math.max(optimalPartSize, minPartSize); // Enforce minimum for multipart

  // Round up to ensure consistent part sizes and align to reasonable boundaries
  // This helps ensure all parts except the last one will have exactly the same size
  const alignment = 1024; // 1KB alignment for better consistency
  return Math.ceil(finalPartSize / alignment) * alignment;
};

export const partKey = (id: string): string => {
  return `${id}.part`;
};

export const shouldUseExpirationTags = (
  expirationPeriodInMilliseconds: number,
  useTags: boolean,
): boolean => {
  return expirationPeriodInMilliseconds !== 0 && useTags;
};

export const getExpirationDate = (
  createdAt: string,
  expirationPeriodInMilliseconds: number,
): Date => {
  const date = new Date(createdAt);
  return new Date(date.getTime() + expirationPeriodInMilliseconds);
};
