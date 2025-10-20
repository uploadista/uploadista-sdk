/**
 * URI utility functions for React Native file handling
 */

/**
 * Extract file name from URI
 * @param uri - File URI
 * @returns File name extracted from URI
 */
export function getFileNameFromUri(uri: string): string {
  try {
    // Handle different URI formats
    if (uri.startsWith("file://")) {
      // File URI format
      const path = uri.replace("file://", "");
      return path.split("/").pop() || "file";
    }

    if (uri.startsWith("content://")) {
      // Content URI format (Android)
      const parts = uri.split("/");
      return parts[parts.length - 1] || "file";
    }

    // Assume it's a path or other format
    const parts = uri.split("/");
    return parts[parts.length - 1] || "file";
  } catch {
    return "file";
  }
}

/**
 * Convert file path to file URI
 * @param filePath - File path
 * @returns File URI
 */
export function pathToUri(filePath: string): string {
  if (filePath.startsWith("file://")) {
    return filePath;
  }

  if (filePath.startsWith("content://")) {
    return filePath;
  }

  // Convert to file URI
  return `file://${filePath}`;
}

/**
 * Convert file URI to file path
 * @param uri - File URI
 * @returns File path
 */
export function uriToPath(uri: string): string {
  if (uri.startsWith("file://")) {
    return uri.replace("file://", "");
  }

  if (uri.startsWith("content://")) {
    // Content URIs cannot be converted to paths directly
    return uri;
  }

  return uri;
}

/**
 * Get directory from URI
 * @param uri - File URI
 * @returns Directory path
 */
export function getDirectoryFromUri(uri: string): string {
  try {
    const path = uriToPath(uri);
    const parts = path.split("/");
    parts.pop(); // Remove file name
    return parts.join("/");
  } catch {
    return "";
  }
}

/**
 * Check if URI is a content URI (Android specific)
 * @param uri - URI to check
 * @returns True if URI is a content URI
 */
export function isContentUri(uri: string): boolean {
  return uri.startsWith("content://");
}

/**
 * Check if URI is a file URI
 * @param uri - URI to check
 * @returns True if URI is a file URI
 */
export function isFileUri(uri: string): boolean {
  return uri.startsWith("file://");
}

/**
 * Normalize URI for cross-platform compatibility
 * @param uri - URI to normalize
 * @returns Normalized URI
 */
export function normalizeUri(uri: string): string {
  // Remove duplicate slashes (but keep protocol slashes)
  return uri.replace(/([^:]\/)\/+/g, "$1");
}

/**
 * Get MIME type hint from URI
 * @param uri - File URI
 * @returns MIME type hint based on file extension
 */
export function getMimeTypeFromUri(uri: string): string {
  const fileName = getFileNameFromUri(uri);

  const mimeTypes: Record<string, string> = {
    // Images
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".webp": "image/webp",

    // Videos
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",

    // Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aac": "audio/aac",

    // Documents
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".json": "application/json",
  };

  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return mimeTypes[ext] || "application/octet-stream";
}
