/**
 * Utility functions for the Vue upload client
 */

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Format upload speed in human-readable format
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return `${Number.parseFloat((bytesPerSecond / k ** i).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${Math.round(milliseconds)}ms`;
  }

  if (milliseconds < 60000) {
    return `${Math.round(milliseconds / 1000)}s`;
  }

  if (milliseconds < 3600000) {
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.round((milliseconds % 60000) / 1000);
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(milliseconds / 3600000);
  const minutes = Math.round((milliseconds % 3600000) / 60000);
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

/**
 * Validate file type against accepted types
 */
export function validateFileType(file: File, accept: string[]): boolean {
  if (!accept || accept.length === 0) return true;

  return accept.some((acceptType) => {
    if (acceptType.startsWith(".")) {
      // File extension check
      return file.name.toLowerCase().endsWith(acceptType.toLowerCase());
    }

    // MIME type check (supports wildcards like image/*)
    if (acceptType.endsWith("/*")) {
      const baseType = acceptType.slice(0, -2);
      return file.type.startsWith(baseType);
    }

    return file.type === acceptType;
  });
}

/**
 * Generate a unique ID for upload items
 */
export function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot !== -1 ? filename.substring(lastDot + 1).toLowerCase() : "";
}

/**
 * Check if a file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Check if a file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * Check if a file is an audio file
 */
export function isAudioFile(file: File): boolean {
  return file.type.startsWith("audio/");
}

/**
 * Check if a file is a document
 */
export function isDocumentFile(file: File): boolean {
  const documentTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/rtf",
  ];

  return documentTypes.includes(file.type);
}

/**
 * Create a preview URL for a file (if supported)
 */
export function createFilePreview(file: File): string | null {
  if (isImageFile(file) || isVideoFile(file) || isAudioFile(file)) {
    return URL.createObjectURL(file);
  }
  return null;
}

/**
 * Clean up a preview URL created with createFilePreview
 */
export function revokeFilePreview(previewUrl: string): void {
  URL.revokeObjectURL(previewUrl);
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(current: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, Math.max(0, Math.round((current / total) * 100)));
}

/**
 * Check if a value is a browser file
 */
export * from "./is-browser-file";
