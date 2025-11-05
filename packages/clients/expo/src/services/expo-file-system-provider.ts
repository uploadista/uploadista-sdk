import type {
  CameraOptions,
  FileInfo,
  FilePickResult,
  FileSystemProvider,
  PickerOptions,
} from "@uploadista/react-native-core";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

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
        return { status: "cancelled" };
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return { status: "cancelled" };
      }

      return {
        status: "success",
        data: {
          uri: asset.uri,
          name: asset.name,
          size: asset.size || 0,
          mimeType: asset.mimeType,
        },
      };
    } catch (error) {
      return {
        status: "error",
        error:
          error instanceof Error
            ? error
            : new Error(
                `Failed to pick document: ${error instanceof Error ? error.message : String(error)}`,
              ),
      };
    }
  }

  async pickImage(options?: PickerOptions): Promise<FilePickResult> {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        return {
          status: "error",
          error: new Error("Camera roll permission not granted"),
        };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        selectionLimit: options?.allowMultiple ? 0 : 1,
        quality: 1,
      });

      if (result.canceled) {
        return { status: "cancelled" };
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return { status: "cancelled" };
      }

      return {
        status: "success",
        data: {
          uri: asset.uri,
          name: asset.fileName || `image-${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          mimeType: "image/jpeg",
        },
      };
    } catch (error) {
      return {
        status: "error",
        error:
          error instanceof Error
            ? error
            : new Error(
                `Failed to pick image: ${error instanceof Error ? error.message : String(error)}`,
              ),
      };
    }
  }

  async pickVideo(options?: PickerOptions): Promise<FilePickResult> {
    try {
      // Request permissions
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        return {
          status: "error",
          error: new Error("Camera roll permission not granted"),
        };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "videos",
        selectionLimit: options?.allowMultiple ? 0 : 1,
      });

      if (result.canceled) {
        return { status: "cancelled" };
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return { status: "cancelled" };
      }

      return {
        status: "success",
        data: {
          uri: asset.uri,
          name: asset.fileName || `video-${Date.now()}.mp4`,
          size: asset.fileSize || 0,
          mimeType: "video/mp4",
        },
      };
    } catch (error) {
      return {
        status: "error",
        error:
          error instanceof Error
            ? error
            : new Error(
                `Failed to pick video: ${error instanceof Error ? error.message : String(error)}`,
              ),
      };
    }
  }

  async pickCamera(options?: CameraOptions): Promise<FilePickResult> {
    try {
      // Request camera permissions
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        return {
          status: "error",
          error: new Error("Camera permission not granted"),
        };
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        aspect: [4, 3],
        quality: options?.quality ?? 1,
      });

      if (result.canceled) {
        return { status: "cancelled" };
      }

      const asset = result.assets?.[0];
      if (!asset) {
        return { status: "cancelled" };
      }

      return {
        status: "success",
        data: {
          uri: asset.uri,
          name: asset.fileName || `photo-${Date.now()}.jpg`,
          size: asset.fileSize || 0,
          mimeType: "image/jpeg",
        },
      };
    } catch (error) {
      return {
        status: "error",
        error:
          error instanceof Error
            ? error
            : new Error(
                `Failed to capture photo: ${error instanceof Error ? error.message : String(error)}`,
              ),
      };
    }
  }

  async readFile(uri: string): Promise<ArrayBuffer> {
    try {
      const file = new FileSystem.File(uri);
      if (!file.exists) {
        throw new Error("File does not exist");
      }
      const bytes = await file.bytes();

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
      const file = new FileSystem.File(uri);

      if (!file.exists) {
        throw new Error("File does not exist");
      }

      return {
        uri,
        name: uri.split("/").pop() || "unknown",
        size: file.size ?? 0,
        modificationTime: file.modificationTime
          ? file.modificationTime * 1000
          : undefined,
      };
    } catch (error) {
      throw new Error(
        `Failed to get file info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
