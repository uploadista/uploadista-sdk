import { useCallback } from "react";
import type { FilePickResult, UseGalleryUploadOptions } from "../types";
import { useMultiUpload } from "./use-multi-upload";
import { useUploadistaContext } from "./use-uploadista-context";

/**
 * Hook for selecting and uploading photos/videos from gallery
 * Handles batch selection and concurrent uploads
 * @param options - Gallery upload configuration
 * @returns Upload state and gallery selection/upload function
 */
export function useGalleryUpload(options?: UseGalleryUploadOptions) {
  const { fileSystemProvider } = useUploadistaContext();
  const uploadHook = useMultiUpload({
    maxConcurrent: 3,
    metadata: options?.metadata,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
  });

  // Select and upload media from gallery
  const selectAndUpload = useCallback(async () => {
    try {
      let media: FilePickResult | FilePickResult[];

      // Select appropriate media type
      if (options?.mediaType === "video") {
        media = await fileSystemProvider.pickVideo({
          allowMultiple: options?.allowMultiple ?? true,
        });
      } else if (options?.mediaType === "photo") {
        media = await fileSystemProvider.pickImage({
          allowMultiple: options?.allowMultiple ?? true,
        });
      } else {
        // For 'mixed' or default, use pickImage first (can be extended to support both)
        media = await fileSystemProvider.pickImage({
          allowMultiple: options?.allowMultiple ?? true,
        });
      }

      // Handle single or multiple files
      const files = Array.isArray(media) ? media : [media];

      // Add files and start upload
      const itemIds = uploadHook.addFiles(files);
      await uploadHook.startUploads();

      return itemIds;
    } catch (error) {
      console.error("Gallery selection error:", error);
      throw error;
    }
  }, [
    fileSystemProvider,
    options?.allowMultiple,
    options?.mediaType,
    uploadHook,
  ]);

  return {
    ...uploadHook,
    selectAndUpload,
  };
}
