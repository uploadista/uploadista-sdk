import { useCallback } from "react";
import type { UseCameraUploadOptions } from "../types";
import { useUpload } from "./use-upload";
import { useUploadistaContext } from "./use-uploadista-context";

/**
 * Hook for capturing photos and uploading them
 * Handles camera permissions and capture flow
 * @param options - Camera upload configuration
 * @returns Upload state and camera capture/upload function
 */
export function useCameraUpload(options?: UseCameraUploadOptions) {
  const { fileSystemProvider } = useUploadistaContext();
  const uploadHook = useUpload({
    metadata: options?.metadata,
    onSuccess: options?.onSuccess,
    onError: options?.onError,
    onProgress: options?.onProgress,
  });

  // Capture and upload photo
  const captureAndUpload = useCallback(async () => {
    try {
      // Capture photo with camera
      const photo = await fileSystemProvider.pickCamera(options?.cameraOptions);

      // Upload captured photo
      await uploadHook.upload(photo);
    } catch (error) {
      console.error("Camera capture error:", error);
    }
  }, [fileSystemProvider, options?.cameraOptions, uploadHook]);

  return {
    ...uploadHook,
    captureAndUpload,
  };
}
