import type { BrowserUploadInput } from "@uploadista/client-browser";
import type { UploadMetrics } from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";
import type {
  UploadState,
  UploadStatus,
  UseUploadOptions,
} from "./use-upload";

export interface UploadItem {
  id: string;
  file: BrowserUploadInput;
  state: UploadState;
}

export interface MultiUploadOptions
  extends Omit<UseUploadOptions, "onSuccess" | "onError" | "onProgress"> {
  /**
   * Maximum number of concurrent uploads
   */
  maxConcurrent?: number;

  /**
   * Called when an individual file upload starts
   */
  onUploadStart?: (item: UploadItem) => void;

  /**
   * Called when an individual file upload progresses
   */
  onUploadProgress?: (
    item: UploadItem,
    progress: number,
    bytesUploaded: number,
    totalBytes: number | null,
  ) => void;

  /**
   * Called when an individual file upload succeeds
   */
  onUploadSuccess?: (item: UploadItem, result: UploadFile) => void;

  /**
   * Called when an individual file upload fails
   */
  onUploadError?: (item: UploadItem, error: Error) => void;

  /**
   * Called when all uploads complete (successfully or with errors)
   */
  onComplete?: (results: {
    successful: UploadItem[];
    failed: UploadItem[];
    total: number;
  }) => void;
}

export interface MultiUploadState {
  /**
   * Total number of uploads
   */
  total: number;

  /**
   * Number of completed uploads (successful + failed)
   */
  completed: number;

  /**
   * Number of successful uploads
   */
  successful: number;

  /**
   * Number of failed uploads
   */
  failed: number;

  /**
   * Number of currently uploading files
   */
  uploading: number;

  /**
   * Overall progress as a percentage (0-100)
   */
  progress: number;

  /**
   * Total bytes uploaded across all files
   */
  totalBytesUploaded: number;

  /**
   * Total bytes to upload across all files
   */
  totalBytes: number;

  /**
   * Whether any uploads are currently active
   */
  isUploading: boolean;

  /**
   * Whether all uploads have completed
   */
  isComplete: boolean;
}

export interface UseMultiUploadReturn {
  /**
   * Current multi-upload state
   */
  state: MultiUploadState;

  /**
   * Array of all upload items
   */
  items: UploadItem[];

  /**
   * Add files to the upload queue
   */
  addFiles: (files: BrowserUploadInput[]) => void;

  /**
   * Remove an item from the queue (only if not currently uploading)
   */
  removeItem: (id: string) => void;

  /**
   * Remove a file from the queue (alias for removeItem)
   */
  removeFile: (id: string) => void;

  /**
   * Start all pending uploads
   */
  startAll: () => void;

  /**
   * Abort a specific upload by ID
   */
  abortUpload: (id: string) => void;

  /**
   * Abort all active uploads
   */
  abortAll: () => void;

  /**
   * Retry a specific failed upload by ID
   */
  retryUpload: (id: string) => void;

  /**
   * Retry all failed uploads
   */
  retryFailed: () => void;

  /**
   * Clear all completed uploads (successful and failed)
   */
  clearCompleted: () => void;

  /**
   * Clear all items
   */
  clearAll: () => void;

  /**
   * Get items by status
   */
  getItemsByStatus: (status: UploadStatus) => UploadItem[];

  /**
   * Aggregated upload metrics and performance insights from the client
   */
  metrics: UploadMetrics;
}

/**
 * React hook for managing multiple file uploads with queue management,
 * concurrent upload limits, and batch operations.
 *
 * Must be used within an UploadistaProvider.
 *
 * @param options - Multi-upload configuration and event handlers
 * @returns Multi-upload state and control methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const multiUpload = useMultiUpload({
 *     maxConcurrent: 3,
 *     onUploadSuccess: (item, result) => {
 *       console.log(`${item.file.name} uploaded successfully`);
 *     },
 *     onComplete: (results) => {
 *       console.log(`Upload batch complete: ${results.successful.length}/${results.total} successful`);
 *     },
 *   });
 *
 *   return (
 *     <div>
 *       <input
 *         type="file"
 *         multiple
 *         onChange={(e) => {
 *           if (e.target.files) {
 *             multiUpload.addFiles(Array.from(e.target.files));
 *           }
 *         }}
 *       />
 *
 *       <div>Progress: {multiUpload.state.progress}%</div>
 *       <div>
 *         {multiUpload.state.uploading} uploading, {multiUpload.state.successful} successful,
 *         {multiUpload.state.failed} failed
 *       </div>
 *
 *       <button onClick={multiUpload.startAll} disabled={multiUpload.state.isUploading}>
 *         Start All
 *       </button>
 *       <button onClick={multiUpload.abortAll} disabled={!multiUpload.state.isUploading}>
 *         Abort All
 *       </button>
 *       <button onClick={multiUpload.retryFailed} disabled={multiUpload.state.failed === 0}>
 *         Retry Failed
 *       </button>
 *
 *       {multiUpload.items.map((item) => (
 *         <div key={item.id}>
 *           {item.file.name}: {item.state.status} ({item.state.progress}%)
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

export function useMultiUpload(
  options: MultiUploadOptions = {},
): UseMultiUploadReturn {
  const uploadClient = useUploadistaContext();
  const { maxConcurrent = 3 } = options;
  const [items, setItems] = useState<UploadItem[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const nextIdRef = useRef(0);
  const activeUploadsRef = useRef(new Set<string>());

  // Store abort controllers for each upload
  const abortControllersRef = useRef<Map<string, { abort: () => void }>>(
    new Map(),
  );

  // Keep ref in sync with state (also updated synchronously in setItems callbacks)
  itemsRef.current = items;

  // Generate a unique ID for each upload item
  const generateId = useCallback(() => {
    return `upload-${Date.now()}-${nextIdRef.current++}`;
  }, []);

  // State update callback for individual uploads
  const onStateUpdate = useCallback(
    (id: string, state: Partial<UploadState>) => {
      setItems((prev) => {
        const updated = prev.map((item) =>
          item.id === id
            ? { ...item, state: { ...item.state, ...state } }
            : item,
        );
        itemsRef.current = updated;
        return updated;
      });
    },
    [],
  );

  // Check if all uploads are complete and trigger completion callback
  const checkForCompletion = useCallback(() => {
    const currentItems = itemsRef.current;
    const allComplete = currentItems.every((item) =>
      ["success", "error", "aborted"].includes(item.state.status),
    );

    if (allComplete && currentItems.length > 0) {
      const successful = currentItems.filter(
        (item) => item.state.status === "success",
      );
      const failed = currentItems.filter((item) =>
        ["error", "aborted"].includes(item.state.status),
      );

      options.onComplete?.({
        successful,
        failed,
        total: currentItems.length,
      });
    }
  }, [options]);

  // Start the next available upload if we have capacity
  const startNextUpload = useCallback(() => {
    if (activeUploadsRef.current.size >= maxConcurrent) {
      return;
    }

    const currentItems = itemsRef.current;
    const nextItem = currentItems.find(
      (item) =>
        item.state.status === "idle" && !activeUploadsRef.current.has(item.id),
    );

    if (!nextItem) {
      return;
    }

    // Perform upload inline to avoid circular dependency
    const performUploadInline = async () => {
      activeUploadsRef.current.add(nextItem.id);
      options.onUploadStart?.(nextItem);

      // Update state to uploading
      onStateUpdate(nextItem.id, { status: "uploading" });

      try {
        const controller = await uploadClient.client.upload(nextItem.file, {
          metadata: options.metadata,
          uploadLengthDeferred: options.uploadLengthDeferred,
          uploadSize: options.uploadSize,

          onProgress: (
            _uploadId: string,
            bytesUploaded: number,
            totalBytes: number | null,
          ) => {
            const progress = totalBytes
              ? Math.round((bytesUploaded / totalBytes) * 100)
              : 0;

            onStateUpdate(nextItem.id, {
              progress,
              bytesUploaded,
              totalBytes,
            });

            options.onUploadProgress?.(
              nextItem,
              progress,
              bytesUploaded,
              totalBytes,
            );
          },

          onChunkComplete: () => {
            // Optional: could expose this as an option
          },

          onSuccess: (result: UploadFile) => {
            onStateUpdate(nextItem.id, {
              status: "success",
              result,
              progress: 100,
            });

            const updatedItem = {
              ...nextItem,
              state: { ...nextItem.state, status: "success" as const, result },
            };
            options.onUploadSuccess?.(updatedItem, result);

            // Mark complete and start next
            activeUploadsRef.current.delete(nextItem.id);
            abortControllersRef.current.delete(nextItem.id);
            startNextUpload();
            checkForCompletion();
          },

          onError: (error: Error) => {
            onStateUpdate(nextItem.id, {
              status: "error",
              error,
            });

            const updatedItem = {
              ...nextItem,
              state: { ...nextItem.state, status: "error" as const, error },
            };
            options.onUploadError?.(updatedItem, error);

            // Mark complete and start next
            activeUploadsRef.current.delete(nextItem.id);
            abortControllersRef.current.delete(nextItem.id);
            startNextUpload();
            checkForCompletion();
          },

          onShouldRetry: options.onShouldRetry,
        });

        // Store abort controller
        abortControllersRef.current.set(nextItem.id, controller);
      } catch (error) {
        onStateUpdate(nextItem.id, {
          status: "error",
          error: error as Error,
        });

        const updatedItem = {
          ...nextItem,
          state: {
            ...nextItem.state,
            status: "error" as const,
            error: error as Error,
          },
        };
        options.onUploadError?.(updatedItem, error as Error);

        // Mark complete and start next
        activeUploadsRef.current.delete(nextItem.id);
        abortControllersRef.current.delete(nextItem.id);
        startNextUpload();
        checkForCompletion();
      }
    };

    performUploadInline();
  }, [maxConcurrent, uploadClient, options, onStateUpdate, checkForCompletion]);

  // Calculate overall state
  const state: MultiUploadState = {
    total: items.length,
    completed: items.filter((item) =>
      ["success", "error", "aborted"].includes(item.state.status),
    ).length,
    successful: items.filter((item) => item.state.status === "success").length,
    failed: items.filter((item) =>
      ["error", "aborted"].includes(item.state.status),
    ).length,
    uploading: items.filter((item) => item.state.status === "uploading").length,
    progress:
      items.length > 0
        ? Math.round(
            items.reduce((sum, item) => sum + item.state.progress, 0) /
              items.length,
          )
        : 0,
    totalBytesUploaded: items.reduce(
      (sum, item) => sum + item.state.bytesUploaded,
      0,
    ),
    totalBytes: items.reduce(
      (sum, item) => sum + (item.state.totalBytes || 0),
      0,
    ),
    isUploading: items.some((item) => item.state.status === "uploading"),
    isComplete:
      items.length > 0 &&
      items.every((item) =>
        ["success", "error", "aborted"].includes(item.state.status),
      ),
  };

  const addFiles = useCallback(
    (files: BrowserUploadInput[]) => {
      const newItems: UploadItem[] = files.map((file) => {
        const id = generateId();
        return {
          id,
          file,
          state: {
            status: "idle",
            progress: 0,
            bytesUploaded: 0,
            totalBytes: file instanceof File ? file.size : null,
            error: null,
            result: null,
          },
        };
      });

      console.log("addFiles: Adding", newItems.length, "files");

      // Update ref synchronously BEFORE setItems
      const updated = [...itemsRef.current, ...newItems];
      itemsRef.current = updated;
      console.log(
        "addFiles: Updated itemsRef.current to",
        updated.length,
        "items",
      );

      setItems(updated);
    },
    [generateId],
  );

  const removeItem = useCallback((id: string) => {
    const currentItems = itemsRef.current;
    const item = currentItems.find((i) => i.id === id);
    if (item && item.state.status === "uploading") {
      // Abort before removing
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(id);
      }
    }

    setItems((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      itemsRef.current = updated;
      return updated;
    });
    activeUploadsRef.current.delete(id);
  }, []);

  const abortUpload = useCallback(
    (id: string) => {
      const currentItems = itemsRef.current;
      const item = currentItems.find((i) => i.id === id);
      if (item && item.state.status === "uploading") {
        const controller = abortControllersRef.current.get(id);
        if (controller) {
          controller.abort();
          abortControllersRef.current.delete(id);
        }

        activeUploadsRef.current.delete(id);

        setItems((prev) => {
          const updated = prev.map((i) =>
            i.id === id
              ? { ...i, state: { ...i.state, status: "aborted" as const } }
              : i,
          );
          itemsRef.current = updated;
          return updated;
        });

        // Try to start next upload in queue
        startNextUpload();
      }
    },
    [startNextUpload],
  );

  const retryUpload = useCallback(
    (id: string) => {
      const currentItems = itemsRef.current;
      const item = currentItems.find((i) => i.id === id);
      if (item && ["error", "aborted"].includes(item.state.status)) {
        setItems((prev) => {
          const updated = prev.map((i) =>
            i.id === id
              ? {
                  ...i,
                  state: { ...i.state, status: "idle" as const, error: null },
                }
              : i,
          );
          itemsRef.current = updated;
          return updated;
        });

        // Auto-start the upload
        setTimeout(() => startNextUpload(), 0);
      }
    },
    [startNextUpload],
  );

  const startAll = useCallback(() => {
    const currentItems = itemsRef.current;
    console.log("Starting all uploads", currentItems);
    // Start as many uploads as we can up to the concurrent limit
    const idleItems = currentItems.filter(
      (item) => item.state.status === "idle",
    );
    const slotsAvailable = maxConcurrent - activeUploadsRef.current.size;
    const itemsToStart = idleItems.slice(0, slotsAvailable);

    for (const item of itemsToStart) {
      console.log("Starting next upload", item);
      startNextUpload();
    }
  }, [maxConcurrent, startNextUpload]);

  const abortAll = useCallback(() => {
    const currentItems = itemsRef.current;
    currentItems
      .filter((item) => item.state.status === "uploading")
      .forEach((item) => {
        const controller = abortControllersRef.current.get(item.id);
        if (controller) {
          controller.abort();
          abortControllersRef.current.delete(item.id);
        }
      });

    activeUploadsRef.current.clear();

    // Update all uploading items to aborted status
    setItems((prev) => {
      const updated = prev.map((item) =>
        item.state.status === "uploading"
          ? { ...item, state: { ...item.state, status: "aborted" as const } }
          : item,
      );
      itemsRef.current = updated;
      return updated;
    });
  }, []);

  const retryFailed = useCallback(() => {
    const currentItems = itemsRef.current;
    const failedItems = currentItems.filter((item) =>
      ["error", "aborted"].includes(item.state.status),
    );

    if (failedItems.length > 0) {
      setItems((prev) => {
        const updated = prev.map((item) =>
          failedItems.some((f) => f.id === item.id)
            ? {
                ...item,
                state: { ...item.state, status: "idle" as const, error: null },
              }
            : item,
        );
        itemsRef.current = updated;
        return updated;
      });

      // Auto-start uploads if we have capacity
      setTimeout(startAll, 0);
    }
  }, [startAll]);

  const clearCompleted = useCallback(() => {
    setItems((prev) => {
      const updated = prev.filter(
        (item) => !["success", "error", "aborted"].includes(item.state.status),
      );
      itemsRef.current = updated;
      return updated;
    });
  }, []);

  const clearAll = useCallback(() => {
    abortAll();
    setItems([]);
    itemsRef.current = [];
    activeUploadsRef.current.clear();
  }, [abortAll]);

  const getItemsByStatus = useCallback((status: UploadStatus) => {
    return itemsRef.current.filter((item) => item.state.status === status);
  }, []);

  // Create aggregated metrics object that delegates to the upload client
  const metrics: UploadMetrics = {
    getInsights: () => uploadClient.client.getChunkingInsights(),
    exportMetrics: () => uploadClient.client.exportMetrics(),
    getNetworkMetrics: () => uploadClient.client.getNetworkMetrics(),
    getNetworkCondition: () => uploadClient.client.getNetworkCondition(),
    resetMetrics: () => uploadClient.client.resetMetrics(),
  };

  return {
    state,
    items,
    addFiles,
    removeItem,
    removeFile: removeItem, // Alias for consistency with MultiUploadExample
    startAll,
    abortUpload,
    abortAll,
    retryUpload,
    retryFailed,
    clearCompleted,
    clearAll,
    getItemsByStatus,
    metrics,
  };
}
