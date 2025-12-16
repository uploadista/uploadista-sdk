import { inject } from "vue";
import type { UploadContextValue } from "./Upload.vue";

/**
 * Injection key for the Upload context
 */
export const UPLOAD_CONTEXT_KEY = "uploadContext";

/**
 * Injection key for the UploadItem context
 */
export const UPLOAD_ITEM_CONTEXT_KEY = "uploadItemContext";

/**
 * Context value for a specific upload item within an Upload.
 */
export interface UploadItemContextValue {
  /** Item ID */
  id: string;
  /** The file being uploaded */
  file: File | Blob;
  /** Current upload state */
  state: {
    status: string;
    progress: number;
    bytesUploaded: number;
    totalBytes: number | null;
    error: Error | null;
    result: unknown;
  };
  /** Abort this upload */
  abort: () => void;
  /** Retry this upload */
  retry: () => void;
  /** Remove this item from the queue */
  remove: () => void;
}

/**
 * Composable to access upload context from within an Upload component.
 * @throws Error if used outside of an Upload component
 */
export function useUploadContext(): UploadContextValue {
  const context = inject<UploadContextValue>(UPLOAD_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "useUploadContext must be used within an <Upload> component. " +
        "Wrap your component tree with <Upload>",
    );
  }
  return context;
}

/**
 * Composable to access upload item context from within an UploadItem component.
 * @throws Error if used outside of an UploadItem component
 */
export function useUploadItemContext(): UploadItemContextValue {
  const context = inject<UploadItemContextValue>(UPLOAD_ITEM_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "useUploadItemContext must be used within an <UploadItem> component. " +
        'Wrap your component with <UploadItem id="...">',
    );
  }
  return context;
}
