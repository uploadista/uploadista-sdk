/**
 * Framework Integration Utilities
 *
 * This module provides TypeScript utilities and helper types for building
 * framework-specific wrappers around the Uploadista client.
 *
 * @module framework-utils
 */

import type { FlowResult, UploadResult } from "@uploadista/client-core";
import type { FlowEvent } from "@uploadista/core/flow";
import type { UploadEvent, UploadFile } from "@uploadista/core/types";

/**
 * Base upload state that framework wrappers should implement
 */
export interface BaseUploadState {
  status: "idle" | "uploading" | "success" | "error" | "aborted";
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  error?: Error;
  result?: UploadResult<UploadFile>;
}

/**
 * Base flow upload state
 */
export interface BaseFlowUploadState extends BaseUploadState {
  jobId?: string;
  flowStatus?: "pending" | "processing" | "completed" | "failed";
  flowResult?: FlowResult<unknown>;
}

/**
 * Progress callback signature
 */
export type ProgressCallback = (
  uploadId: string,
  bytesUploaded: number,
  totalBytes: number,
) => void;

/**
 * Complete callback signature
 */
export type CompleteCallback = (uploadId: string, result: UploadResult) => void;

/**
 * Error callback signature
 */
export type ErrorCallback = (uploadId: string, error: Error) => void;

/**
 * Abort callback signature
 */
export type AbortCallback = (uploadId: string) => void;

/**
 * Event handler signature for framework wrappers
 */
export type EventHandler<T = unknown> = (event: T) => void;

/**
 * WebSocket event handler signature
 */
export type WebSocketEventHandler = (event: UploadEvent | FlowEvent) => void;

/**
 * Framework state updater function signature
 * @template T - The state type
 */
export type StateUpdater<T> = (updater: (prevState: T) => T) => void;

/**
 * Cleanup function returned by setup functions
 */
export type CleanupFunction = () => void;

/**
 * Upload item for multi-upload tracking
 */
export interface UploadItem {
  id: string;
  file: File;
  status: BaseUploadState["status"];
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  error?: Error;
  result?: UploadResult;
}

/**
 * Multi-upload aggregate statistics
 */
export interface MultiUploadStats {
  totalFiles: number;
  completedFiles: number;
  failedFiles: number;
  totalBytes: number;
  uploadedBytes: number;
  totalProgress: number;
  allComplete: boolean;
  hasErrors: boolean;
}

/**
 * Drag and drop state
 */
export interface DragDropState {
  isDragging: boolean;
  isOver: boolean;
  files: File[];
}

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * File validation function signature
 */
export type FileValidator = (file: File) => FileValidationResult;

/**
 * Utility: Calculate aggregate upload statistics
 */
export function calculateMultiUploadStats(
  uploads: UploadItem[],
): MultiUploadStats {
  const totalFiles = uploads.length;
  const completedFiles = uploads.filter((u) => u.status === "success").length;
  const failedFiles = uploads.filter((u) => u.status === "error").length;
  const totalBytes = uploads.reduce((sum, u) => sum + u.totalBytes, 0);
  const uploadedBytes = uploads.reduce((sum, u) => sum + u.bytesUploaded, 0);
  const totalProgress = totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0;
  const allComplete = uploads.every((u) => u.status === "success");
  const hasErrors = uploads.some((u) => u.status === "error");

  return {
    totalFiles,
    completedFiles,
    failedFiles,
    totalBytes,
    uploadedBytes,
    totalProgress,
    allComplete,
    hasErrors,
  };
}

/**
 * Utility: Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Utility: Format progress percentage
 */
export function formatProgress(progress: number): string {
  return `${Math.round(progress)}%`;
}

/**
 * Utility: Get file extension
 */
export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot === -1 ? "" : filename.slice(lastDot + 1).toLowerCase();
}

/**
 * Utility: Check if file is an image
 */
export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

/**
 * Utility: Check if file is a video
 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/**
 * Utility: Create file size validator
 */
export function createFileSizeValidator(maxSizeBytes: number): FileValidator {
  return (file: File): FileValidationResult => {
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${formatFileSize(maxSizeBytes)}`,
      };
    }
    return { valid: true };
  };
}

/**
 * Utility: Create file type validator
 */
export function createFileTypeValidator(allowedTypes: string[]): FileValidator {
  return (file: File): FileValidationResult => {
    const fileType = file.type.toLowerCase();
    const fileExt = getFileExtension(file.name);

    const isAllowed = allowedTypes.some((type) => {
      if (type.startsWith(".")) {
        return type.slice(1) === fileExt;
      }
      if (type.includes("*")) {
        const pattern = type.replace("*", "");
        return fileType.startsWith(pattern);
      }
      return fileType === type;
    });

    if (!isAllowed) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${allowedTypes.join(", ")}`,
      };
    }
    return { valid: true };
  };
}

/**
 * Utility: Compose multiple validators
 */
export function composeValidators(
  ...validators: FileValidator[]
): FileValidator {
  return (file: File): FileValidationResult => {
    for (const validator of validators) {
      const result = validator(file);
      if (!result.valid) {
        return result;
      }
    }
    return { valid: true };
  };
}

/**
 * Utility: Generate unique upload ID
 */
export function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Utility: Create delay promise for retry logic
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Utility: Calculate exponential backoff delay
 */
export function calculateBackoff(
  attempt: number,
  baseDelay = 1000,
  maxDelay = 30000,
): number {
  const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
  // Add jitter to prevent thundering herd
  return delay + Math.random() * 1000;
}

/**
 * Utility: Create retry wrapper for upload function
 */
export function createRetryWrapper<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  shouldRetry: (error: unknown) => boolean = () => true,
): () => Promise<T> {
  return async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts - 1 && shouldRetry(error)) {
          const delayMs = calculateBackoff(attempt);
          await delay(delayMs);
          continue;
        }
        break;
      }
    }
    throw lastError;
  };
}

/**
 * Type guard: Check if error is network-related (should retry)
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("connection") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ETIMEDOUT")
    );
  }
  return false;
}

/**
 * Type guard: Check if error is abort-related (should not retry)
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.includes("abort");
  }
  return false;
}

/**
 * Format upload speed in human-readable format
 */
export function formatSpeed(bytesPerSecond: number): string {
  if (bytesPerSecond === 0) return "0 B/s";
  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
  return `${parseFloat((bytesPerSecond / k ** i).toFixed(1))} ${sizes[i]}`;
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
