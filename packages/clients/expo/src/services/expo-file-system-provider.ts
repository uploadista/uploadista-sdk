import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import type {
  CameraOptions,
  FileInfo,
  FilePickResult,
  FileSystemProvider,
  PickerOptions,
} from "../types";

/**
 * File system provider implementation for Expo managed environment
 * Uses Expo DocumentPicker, ImagePicker, Camera, and FileSystem APIs
 */
export class ExpoFileSystemProvider implements FileSystemProvider {
  async pickDocument(options?: PickerOptions): Promise<FilePickResult> {
    try {
      const result = (await DocumentPicker.getDocumentAsync({
        type: options?.allowedTypes || ["*/*"],
        copyToCacheDirectory: true,
      })) as {
        canceled: boolean;
        assets?: Array<{
          uri: string;
          name: string;
          size?: number;
          mimeType?: string;
        }>;
      };

      if (result.canceled) {
        throw new Error("Document picker was cancelled");
      }

      const asset = result.assets?.[0];
      if (!asset) {
        throw new Error("No document selected");
      }

      return {
        uri: asset.uri,
        name: asset.name,
        size: asset.size || 0,
        mimeType: asset.mimeType,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        throw error;
      }
      throw new Error(
        `Failed to pick document: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async pickImage(options?: PickerOptions): Promise<FilePickResult> {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Camera roll permission not granted");
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        // biome-ignore lint/suspicious/noExplicitAny: Expo ImagePicker mediaTypes type compatibility
        mediaTypes: "Images" as any,
        selectionLimit: options?.allowMultiple ? 0 : 1,
        quality: 1,
      });

      if (result.canceled) {
        throw new Error("Image picker was cancelled");
      }

      const asset = result.assets?.[0];
      if (!asset) {
        throw new Error("No image selected");
      }

      return {
        uri: asset.uri,
        name: asset.fileName || `image-${Date.now()}.jpg`,
        size: asset.fileSize || 0,
        mimeType: "image/jpeg",
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        throw error;
      }
      throw new Error(
        `Failed to pick image: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async pickVideo(options?: PickerOptions): Promise<FilePickResult> {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Camera roll permission not granted");
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        // biome-ignore lint/suspicious/noExplicitAny: Expo ImagePicker mediaTypes type compatibility
        mediaTypes: "Videos" as any,
        selectionLimit: options?.allowMultiple ? 0 : 1,
      });

      if (result.canceled) {
        throw new Error("Video picker was cancelled");
      }

      const asset = result.assets?.[0];
      if (!asset) {
        throw new Error("No video selected");
      }

      return {
        uri: asset.uri,
        name: asset.fileName || `video-${Date.now()}.mp4`,
        size: asset.fileSize || 0,
        mimeType: "video/mp4",
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        throw error;
      }
      throw new Error(
        `Failed to pick video: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async pickCamera(options?: CameraOptions): Promise<FilePickResult> {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Camera permission not granted");
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        aspect: [4, 3],
        quality: options?.quality ?? 1,
      });

      if (result.canceled) {
        throw new Error("Camera capture was cancelled");
      }

      const asset = result.assets?.[0];
      if (!asset) {
        throw new Error("No photo captured");
      }

      return {
        uri: asset.uri,
        name: asset.fileName || `photo-${Date.now()}.jpg`,
        size: asset.fileSize || 0,
        mimeType: "image/jpeg",
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("cancelled")) {
        throw error;
      }
      throw new Error(
        `Failed to capture photo: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async readFile(uri: string): Promise<ArrayBuffer> {
    try {
      // Read file as base64
      const base64String = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to ArrayBuffer
      // Use js-base64 for decoding since atob is not available in all RN environments
      const { fromBase64 } = await import("js-base64");
      const binaryString = fromBase64(base64String);
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
    // In Expo, the file path is typically already a URI
    return filePath;
  }

  async getFileInfo(uri: string): Promise<FileInfo> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(uri);

      if (!fileInfo.exists) {
        throw new Error("File does not exist");
      }

      return {
        uri,
        name: uri.split("/").pop() || "unknown",
        size: fileInfo.size ?? 0,
        modificationTime: fileInfo.modificationTime
          ? fileInfo.modificationTime * 1000
          : undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
