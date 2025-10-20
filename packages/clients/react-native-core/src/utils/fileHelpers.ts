/**
 * File utility functions for React Native uploads
 */

/**
 * Format file size to human readable string
 * @param bytes - Size in bytes
 * @returns Formatted size string (e.g., "1.5 MB")
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

/**
 * Get MIME type from file name
 * @param fileName - File name with extension
 * @returns MIME type or 'application/octet-stream' as fallback
 */
export function getMimeTypeFromFileName(fileName: string): string {
  const mimeTypes: Record<string, string> = {
    // Images
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",

    // Videos
    ".mp4": "video/mp4",
    ".avi": "video/x-msvideo",
    ".mov": "video/quicktime",
    ".wmv": "video/x-ms-wmv",
    ".flv": "video/x-flv",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",

    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",

    // Documents
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".ppt": "application/vnd.ms-powerpoint",
    ".pptx":
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".json": "application/json",
    ".xml": "application/xml",
    ".zip": "application/zip",
  };

  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Check if file type is allowed
 * @param fileName - File name to check
 * @param allowedTypes - Array of allowed MIME types (e.g., ['image/jpeg', 'image/png'])
 * @returns True if file type is allowed
 */
export function isFileTypeAllowed(
  fileName: string,
  allowedTypes: string[],
): boolean {
  if (!allowedTypes || allowedTypes.length === 0) {
    return true;
  }

  const mimeType = getMimeTypeFromFileName(fileName);
  return allowedTypes.some((allowed) => {
    if (allowed.endsWith("/*")) {
      // Handle wildcard patterns like 'image/*'
      const [type] = allowed.split("/");
      return mimeType.startsWith(`${type}/`);
    }
    return allowed === mimeType;
  });
}

/**
 * Check if file size is within limits
 * @param fileSize - File size in bytes
 * @param maxSize - Maximum allowed size in bytes (optional)
 * @param minSize - Minimum allowed size in bytes (optional)
 * @returns True if file size is within limits
 */
export function isFileSizeValid(
  fileSize: number,
  maxSize?: number,
  minSize?: number,
): boolean {
  if (maxSize !== undefined && fileSize > maxSize) {
    return false;
  }

  if (minSize !== undefined && fileSize < minSize) {
    return false;
  }

  return true;
}

/**
 * Get file extension
 * @param fileName - File name
 * @returns File extension without dot (e.g., 'pdf' for 'document.pdf')
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return "";
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Get file name without extension
 * @param fileName - File name
 * @returns File name without extension
 */
export function getFileNameWithoutExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  if (lastDot === -1) return fileName;
  return fileName.slice(0, lastDot);
}

/**
 * Check if file is an image
 * @param fileName - File name
 * @returns True if file is an image
 */
export function isImageFile(fileName: string): boolean {
  const imageExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".webp",
    ".svg",
  ];
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return imageExtensions.includes(ext);
}

/**
 * Check if file is a video
 * @param fileName - File name
 * @returns True if file is a video
 */
export function isVideoFile(fileName: string): boolean {
  const videoExtensions = [
    ".mp4",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".mkv",
    ".webm",
  ];
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return videoExtensions.includes(ext);
}

/**
 * Check if file is a document
 * @param fileName - File name
 * @returns True if file is a document
 */
export function isDocumentFile(fileName: string): boolean {
  const docExtensions = [
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".txt",
    ".csv",
  ];
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return docExtensions.includes(ext);
}
