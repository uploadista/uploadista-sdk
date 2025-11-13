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
    let result: FilePickResult;

    // Select appropriate media type
    if (options?.mediaType === "video") {
      result = await fileSystemProvider.pickVideo({
        allowMultiple: options?.allowMultiple ?? true,
      });
    } else if (options?.mediaType === "photo") {
      result = await fileSystemProvider.pickImage({
        allowMultiple: options?.allowMultiple ?? true,
      });
    } else {
      // For 'mixed' or default, use pickImage first (can be extended to support both)
      result = await fileSystemProvider.pickImage({
        allowMultiple: options?.allowMultiple ?? true,
      });
    }

    // Handle cancelled picker
    if (result.status === "cancelled") {
      return [];
    }

    // Handle picker error
    if (result.status === "error") {
      console.error("Gallery selection error:", result.error);
      options?.onError?.(result.error);
      return [];
    }

    // Success - add file and start upload
    const itemIds = uploadHook.addFiles([result]);
    await uploadHook.startUploads(itemIds);

    return itemIds;
  }, [
    fileSystemProvider,
    options?.allowMultiple,
    options?.mediaType,
    options?.onError,
    uploadHook,
  ]);

  return {
    ...uploadHook,
    selectAndUpload,
  };
}
