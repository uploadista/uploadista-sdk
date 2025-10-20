import { useCallback } from "react";
import type { UseFileUploadOptions } from "../types";
import { useUpload } from "./use-upload";
import { useUploadistaContext } from "./use-uploadista-context";

/**
 * Hook for selecting and uploading generic files (documents, etc.)
 * @param options - File upload configuration
 * @returns Upload state and file picker/upload function
 */
export function useFileUpload(options?: UseFileUploadOptions) {
  const { fileSystemProvider } = useUploadistaContext();
  const uploadHook = useUpload({
    metadata: options?.metadata,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    onProgress: options?.onProgress,
  });

  // Pick and upload file
  const pickAndUpload = useCallback(async () => {
    try {
      // Pick file
      const file = await fileSystemProvider.pickDocument({
        allowedTypes: options?.allowedTypes,
      });

      // Upload file
      await uploadHook.upload(file);
    } catch (error) {
      console.error("File selection error:", error);
      throw error;
    }
  }, [fileSystemProvider, options?.allowedTypes, uploadHook]);

  return {
    ...uploadHook,
    pickAndUpload,
  };
}
