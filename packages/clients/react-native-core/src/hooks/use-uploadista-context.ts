import { useContext } from "react";
import { UploadistaContext } from "./uploadista-context";

/**
 * Hook to access the Uploadista client instance
 * Must be used within an UploadistaProvider
 * @throws Error if used outside of UploadistaProvider
 * @returns The Uploadista client and file system provider
 */
export function useUploadistaContext() {
  const context = useContext(UploadistaContext);

  if (!context) {
    throw new Error(
      "useUploadistaClient must be used within an UploadistaProvider",
    );
  }

  return context;
}
