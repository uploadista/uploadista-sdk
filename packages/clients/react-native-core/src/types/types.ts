/**
 * Core types for React Native Uploadista client
 */

import type { TypedOutput } from "@uploadista/core/flow";
import type { UploadFile } from "@uploadista/core/types";

/**
 * Options for file picker operations
 */
export interface PickerOptions {
  /** Allowed file types/MIME types */
  allowedTypes?: string[];
  /** Allow multiple selection */
  allowMultiple?: boolean;
  /** Maximum file size in bytes */
  maxSize?: number;
}

/**
 * Options for camera operations
 */
export interface CameraOptions {
  /** Camera to use: 'front' or 'back' */
  cameraType?: "front" | "back";
  /** Image quality (0-1) */
  quality?: number;
  /** Maximum width for captured image */
  maxWidth?: number;
  /** Maximum height for captured image */
  maxHeight?: number;
}

/**
 * Successful file pick result containing file information
 */
export interface FilePickSuccess {
  /** URI to the file (platform-specific format) */
  uri: string;
  /** File name with extension */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type of the file (if available) */
  mimeType?: string;
  /** Local file path (if available) */
  localPath?: string;
}

/**
 * Result from a file pick operation that can be success, cancelled, or error
 */
export type FilePickResult =
  | { status: "success"; data: FilePickSuccess }
  | { status: "cancelled" }
  | { status: "error"; error: Error };

/**
 * Information about a file
 */
export interface FileInfo {
  /** URI to the file */
  uri: string;
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
  /** MIME type (if available) */
  mimeType?: string;
  /** Last modified timestamp */
  modificationTime?: number;
}

/**
 * Interface for file system abstraction layer
 * Provides pluggable access to file system APIs across different RN environments
 */
export interface FileSystemProvider {
  /**
   * Opens a document picker for selecting files
   * @param options - Configuration for the picker
   * @returns Promise resolving to picked file information
   */
  pickDocument(options?: PickerOptions): Promise<FilePickResult>;

  /**
   * Opens an image picker for selecting images from gallery
   * @param options - Configuration for the picker
   * @returns Promise resolving to picked image information
   */
  pickImage(options?: PickerOptions): Promise<FilePickResult>;

  /**
   * Opens a video picker for selecting videos from gallery
   * @param options - Configuration for the picker
   * @returns Promise resolving to picked video information
   */
  pickVideo(options?: PickerOptions): Promise<FilePickResult>;

  /**
   * Captures a photo using the device camera
   * @param options - Configuration for camera
   * @returns Promise resolving to captured photo information
   */
  pickCamera(options?: CameraOptions): Promise<FilePickResult>;

  /**
   * Gets a URI for a document that can be read
   * @param filePath - Path to the document
   * @returns Promise resolving to accessible URI
   */
  getDocumentUri(filePath: string): Promise<string>;

  /**
   * Reads file contents as ArrayBuffer
   * @param uri - URI to read from
   * @returns Promise resolving to file contents as ArrayBuffer
   */
  readFile(uri: string): Promise<ArrayBuffer>;

  /**
   * Gets information about a file
   * @param uri - URI of the file
   * @returns Promise resolving to file information
   */
  getFileInfo(uri: string): Promise<FileInfo>;
}

/**
 * Configuration for file system provider
 */
export interface FileSystemProviderConfig {
  /** Type of provider: 'expo' or 'native' */
  type?: "expo" | "native";
  /** Custom provider instance */
  provider?: FileSystemProvider;
}

/**
 * Upload state
 */
export type UploadState =
  | "idle"
  | "pending"
  | "uploading"
  | "success"
  | "error"
  | "cancelled";

/**
 * Upload progress information
 */
export interface UploadProgress {
  /** Current state of upload */
  state: UploadState;
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes uploaded */
  uploadedBytes: number;
  /** Total bytes to upload */
  totalBytes: number;
  /** Upload speed in bytes per second */
  uploadSpeed?: number;
  /** Estimated time remaining in milliseconds */
  timeRemaining?: number;
  /** Error message if state is 'error' */
  error?: Error;
}

/**
 * Single file upload state
 */
export interface SingleUploadState extends UploadProgress {
  /** File name */
  fileName: string;
  /** File size */
  fileSize: number;
  /** Result from server after successful upload */
  result?: unknown;
}

/**
 * Multi-file upload item
 */
export interface UploadItem {
  /** Unique identifier for this upload */
  id: string;
  /** File information */
  file: FilePickResult;
  /** Upload progress */
  progress: UploadProgress;
  /** Result from server if successful */
  result?: UploadFile;
}

/**
 * Multi-file upload state
 */
export interface MultiUploadState {
  /** All upload items */
  items: UploadItem[];
  /** Aggregate progress */
  progress: number;
  /** Total uploads */
  total: number;
  /** Completed uploads */
  completed: number;
  /** Failed uploads */
  failed: number;
}

/**
 * Flow upload state
 */
export interface FlowUploadState {
  /** Job ID for the flow */
  jobId?: string;
  /** Overall state */
  state: UploadState;
  /** Progress percentage */
  progress: number;
  /** Flow execution results */
  result?: unknown;
  /** Error if failed */
  error?: Error;
}

/**
 * Options for single upload hook
 */
export interface UseSingleUploadOptions {
  /** Flow ID to use for upload */
  flowId?: string;
  /** Field name for file */
  fieldName?: string;
  /** Additional form data */
  metadata?: Record<string, string>;
  /** Enable retry on failure */
  autoRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
}

/**
 * Options for multi-upload hook
 */
export interface UseMultiUploadOptions {
  /** Max concurrent uploads */
  maxConcurrent?: number;
  /** Additional form data for all uploads */
  metadata?: Record<string, string>;
  /** Called when a file upload succeeds */
  onSuccess?: (result: unknown) => void;
  /** Called when a file upload fails */
  onError?: (error: Error) => void;
}

/**
 * Options for flow upload hook
 */
export interface UseFlowUploadOptions {
  /** Flow ID to execute */
  flowId: string;
  /** Storage ID for the upload */
  storageId: string;
  /** Output node ID for the flow */
  outputNodeId?: string;
  /** Metadata to pass to flow */
  metadata?: Record<string, unknown>;
  /** Called when upload succeeds (receives typed outputs from all output nodes) */
  onSuccess?: (outputs: TypedOutput[]) => void;
  /** Called when the flow completes successfully (receives full flow outputs) */
  onFlowComplete?: (outputs: TypedOutput[]) => void;
  /** Called when upload fails */
  onError?: (error: Error) => void;
  /** Called when upload progress updates */
  onProgress?: (
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
  /** Called when a chunk completes */
  onChunkComplete?: (
    chunkSize: number,
    bytesAccepted: number,
    bytesTotal: number | null,
  ) => void;
}

/**
 * Options for camera upload hook
 */
export interface UseCameraUploadOptions {
  /** Flow ID to use */
  flowId?: string;
  /** Camera options */
  cameraOptions?: CameraOptions;
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Called when upload succeeds */
  onSuccess?: (result: unknown) => void;
  /** Called when upload fails */
  onError?: (error: Error) => void;
  /** Called when upload progress updates */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
}

/**
 * Options for gallery upload hook
 */
export interface UseGalleryUploadOptions {
  /** Flow ID to use */
  flowId?: string;
  /** Allow multiple selection */
  allowMultiple?: boolean;
  /** Media type: 'photo', 'video', or 'mixed' */
  mediaType?: "photo" | "video" | "mixed";
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Called when upload succeeds */
  onSuccess?: (result: unknown) => void;
  /** Called when upload fails */
  onError?: (error: Error) => void;
  /** Called when upload progress updates */
  onProgress?: (
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
}

/**
 * Options for file upload hook
 */
export interface UseFileUploadOptions {
  /** Flow ID to use */
  flowId?: string;
  /** Allowed file types */
  allowedTypes?: string[];
  /** Additional metadata */
  metadata?: Record<string, string>;
  /** Called when upload succeeds */
  onSuccess?: (result: unknown) => void;
  /** Called when upload fails */
  onError?: (error: Error) => void;
  /** Called when upload progress updates */
  onProgress?: (
    uploadId: string,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;
}

/**
 * Metrics for upload performance
 */
export interface UploadMetrics {
  /** Total bytes uploaded */
  totalBytes: number;
  /** Total upload duration in milliseconds */
  durationMs: number;
  /** Average upload speed in bytes/second */
  avgSpeed: number;
  /** Peak upload speed in bytes/second */
  peakSpeed: number;
  /** Number of retries */
  retries: number;
}
