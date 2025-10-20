import type {
  CameraOptions,
  FileInfo,
  FilePickResult,
  FileSystemProvider,
  PickerOptions,
} from "@uploadista/react-native-core";

import * as DocumentPicker from "react-native-document-picker";
import * as ImagePicker from "react-native-image-picker";
import RNFetchBlob from "rn-fetch-blob";

/**
 * File system provider implementation for bare React Native environment
 * Uses react-native-image-picker, react-native-fs, and native APIs
 */
export class NativeFileSystemProvider implements FileSystemProvider {
  async pickDocument(options?: PickerOptions): Promise<FilePickResult> {
    try {
      const result = await DocumentPicker.pick({
        type: options?.allowedTypes || [DocumentPicker.types.allFiles],
        ...(options?.allowMultiple && { isMultiple: true }),
      });

      const file = Array.isArray(result) ? result[0] : result;

      if (!file) {
        throw new Error("No document selected");
      }

      return {
        uri: file.uri,
        name: file.name || "document",
        size: file.size || 0,
        mimeType: file.type || undefined,
        localPath: file.fileCopyUri || undefined,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("cancelled") ||
          error.message.includes("Cancelled"))
      ) {
        throw error;
      }
      throw new Error(
        `Failed to pick document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async pickImage(options?: PickerOptions): Promise<FilePickResult> {
    try {
      return new Promise((resolve, reject) => {
        ImagePicker.launchImageLibrary(
          {
            mediaType: "photo",
            selectionLimit: options?.allowMultiple ? 0 : 1,
            quality: 1,
            // biome-ignore lint/suspicious/noExplicitAny: react-native-image-picker type mismatch
          } as any,
          (response: unknown) => {
            const res = response as {
              didCancel?: boolean;
              errorCode?: string;
              assets?: Array<{
                uri: string;
                fileName?: string;
                fileSize?: number;
                type?: string;
              }>;
            };

            if (res.didCancel) {
              reject(new Error("Image picker was cancelled"));
            } else if (res.errorCode) {
              reject(new Error(`Image picker error: ${res.errorCode}`));
            } else if (res.assets && res.assets.length > 0) {
              const asset = res.assets[0];
              if (asset) {
                resolve({
                  uri: asset.uri,
                  name: asset.fileName || `image-${Date.now()}.jpg`,
                  size: asset.fileSize || 0,
                  mimeType: asset.type || "image/jpeg",
                });
              } else {
                reject(new Error("No image selected"));
              }
            } else {
              reject(new Error("No image selected"));
            }
          },
        );
      });
    } catch (error) {
      throw new Error(
        `Failed to pick image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async pickVideo(options?: PickerOptions): Promise<FilePickResult> {
    try {
      return new Promise((resolve, reject) => {
        ImagePicker.launchImageLibrary(
          {
            mediaType: "video",
            selectionLimit: options?.allowMultiple ? 0 : 1,
          },
          (response: unknown) => {
            const res = response as {
              didCancel?: boolean;
              errorCode?: string;
              assets?: Array<{
                uri: string;
                fileName?: string;
                fileSize?: number;
                type?: string;
              }>;
            };

            if (res.didCancel) {
              reject(new Error("Video picker was cancelled"));
            } else if (res.errorCode) {
              reject(new Error(`Video picker error: ${res.errorCode}`));
            } else if (res.assets && res.assets.length > 0) {
              const asset = res.assets[0];
              if (asset) {
                resolve({
                  uri: asset.uri,
                  name: asset.fileName || `video-${Date.now()}.mp4`,
                  size: asset.fileSize || 0,
                  mimeType: asset.type || "video/mp4",
                });
              } else {
                reject(new Error("No video selected"));
              }
            } else {
              reject(new Error("No video selected"));
            }
          },
        );
      });
    } catch (error) {
      throw new Error(
        `Failed to pick video: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async pickCamera(options?: CameraOptions): Promise<FilePickResult> {
    try {
      return new Promise((resolve, reject) => {
        ImagePicker.launchCamera(
          {
            mediaType: "photo",
            cameraType: options?.cameraType === "front" ? "front" : "back",
            quality: options?.quality ?? 1,
            // biome-ignore lint/suspicious/noExplicitAny: react-native-image-picker type mismatch
          } as any,
          (response: unknown) => {
            const res = response as {
              didCancel?: boolean;
              errorCode?: string;
              assets?: Array<{
                uri: string;
                fileName?: string;
                fileSize?: number;
                type?: string;
              }>;
            };

            if (res.didCancel) {
              reject(new Error("Camera was cancelled"));
            } else if (res.errorCode) {
              reject(new Error(`Camera error: ${res.errorCode}`));
            } else if (res.assets && res.assets.length > 0) {
              const asset = res.assets[0];
              if (asset) {
                resolve({
                  uri: asset.uri,
                  name: asset.fileName || `photo-${Date.now()}.jpg`,
                  size: asset.fileSize || 0,
                  mimeType: asset.type || "image/jpeg",
                });
              } else {
                reject(new Error("No photo captured"));
              }
            } else {
              reject(new Error("No photo captured"));
            }
          },
        );
      });
    } catch (error) {
      throw new Error(
        `Failed to capture photo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async readFile(uri: string): Promise<ArrayBuffer> {
    try {
      // Read file as base64
      const base64Data = await RNFetchBlob.fs.readFile(uri, "base64");

      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes.buffer;
    } catch (error) {
      throw new Error(
        `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async getDocumentUri(filePath: string): Promise<string> {
    // In bare RN with native modules, the path is typically already a URI
    return filePath;
  }

  async getFileInfo(uri: string): Promise<FileInfo> {
    try {
      const stat = await RNFetchBlob.fs.stat(uri);

      return {
        uri,
        name: stat.filename || uri.split("/").pop() || "unknown",
        size: stat.size || 0,
        modificationTime: stat.lastModified
          ? typeof stat.lastModified === "string"
            ? parseInt(stat.lastModified, 10)
            : stat.lastModified
          : undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
