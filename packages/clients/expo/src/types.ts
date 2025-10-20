/**
 * Core types for Expo Uploadista client
 */

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
 * Result from a file pick operation
 */
export interface FilePickResult {
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
 * Provides pluggable access to file system APIs across different Expo environments
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
