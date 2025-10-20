import type {
  BrowserUploadInput,
  FlowUploadItem,
  MultiFlowUploadOptions,
  MultiFlowUploadState,
} from "@uploadista/client-browser";
import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useRef, useState } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

export interface UseMultiFlowUploadReturn {
  /**
   * Current upload state
   */
  state: MultiFlowUploadState<BrowserUploadInput>;

  /**
   * Add files to upload queue
   */
  addFiles: (files: File[] | FileList) => void;

  /**
   * Remove a file from the queue
   */
  removeFile: (id: string) => void;

  /**
   * Start uploading all pending files
   */
  startUpload: () => void;

  /**
   * Abort a specific upload by ID
   */
  abortUpload: (id: string) => void;

  /**
   * Abort all active uploads
   */
  abortAll: () => void;

  /**
   * Clear all items (aborts any active uploads first)
   */
  clear: () => void;

  /**
   * Retry a specific failed upload by ID
   */
  retryUpload: (id: string) => void;

  /**
   * Whether uploads are in progress
   */
  isUploading: boolean;
}

/**
 * Hook for uploading multiple files through a flow
 *
 * Must be used within an UploadistaProvider.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const multiFlowUpload = useMultiFlowUpload({
 *     flowConfig: {
 *       flowId: "batch-upload-flow",
 *       inputNodeId: "upload-node",
 *       storageId: "my-storage",
 *     },
 *     maxConcurrent: 3,
 *     onComplete: (items) => {
 *       console.log("All uploads complete:", items);
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
 *             multiFlowUpload.addFiles(e.target.files);
 *             multiFlowUpload.startUpload();
 *           }
 *         }}
 *       />
 *
 *       {multiFlowUpload.state.items.map((item) => (
 *         <div key={item.id}>
 *           <span>{item.file.name}</span>
 *           <progress value={item.progress} max={100} />
 *           {item.status === "uploading" && (
 *             <button onClick={() => multiFlowUpload.abortUpload(item.id)}>
 *               Cancel
 *             </button>
 *           )}
 *         </div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useMultiFlowUpload(
  options: MultiFlowUploadOptions<BrowserUploadInput>,
): UseMultiFlowUploadReturn {
  const client = useUploadistaContext();
  const [items, setItems] = useState<FlowUploadItem<BrowserUploadInput>[]>([]);
  const abortFnsRef = useRef<Map<string, () => void>>(new Map());
  const queueRef = useRef<string[]>([]);
  const activeCountRef = useRef(0);

  const maxConcurrent = options.maxConcurrent ?? 3;

  const calculateTotalProgress = useCallback(
    (items: FlowUploadItem<BrowserUploadInput>[]) => {
      if (items.length === 0) return 0;
      const totalProgress = items.reduce((sum, item) => sum + item.progress, 0);
      return Math.round(totalProgress / items.length);
    },
    [],
  );

  const processQueue = useCallback(async () => {
    if (
      activeCountRef.current >= maxConcurrent ||
      queueRef.current.length === 0
    ) {
      return;
    }

    const itemId = queueRef.current.shift();
    if (!itemId) return;

    const item = items.find((i) => i.id === itemId);
    if (!item || item.status !== "pending") {
      processQueue();
      return;
    }

    activeCountRef.current++;

    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId ? { ...i, status: "uploading" as const } : i,
      ),
    );

    try {
      const { abort, jobId } = await client.client.uploadWithFlow(
        item.file,
        options.flowConfig,
        {
          onJobStart: (jobId: string) => {
            setItems((prev) =>
              prev.map((i) => (i.id === itemId ? { ...i, jobId } : i)),
            );
          },
          onProgress: (
            _uploadId: string,
            bytesUploaded: number,
            totalBytes: number | null,
          ) => {
            const progress = totalBytes
              ? Math.round((bytesUploaded / totalBytes) * 100)
              : 0;

            setItems((prev) => {
              const updated = prev.map((i) =>
                i.id === itemId
                  ? {
                      ...i,
                      progress,
                      bytesUploaded,
                      totalBytes: totalBytes || 0,
                    }
                  : i,
              );
              const updatedItem = updated.find((i) => i.id === itemId);
              if (updatedItem) {
                options.onItemProgress?.(updatedItem);
              }
              return updated;
            });
          },
          onSuccess: (result: UploadFile) => {
            setItems((prev) => {
              const updated = prev.map((i) =>
                i.id === itemId
                  ? { ...i, status: "success" as const, result, progress: 100 }
                  : i,
              );
              const updatedItem = updated.find((i) => i.id === itemId);
              if (updatedItem) {
                options.onItemSuccess?.(updatedItem);
              }

              // Check if all uploads are complete
              const allComplete = updated.every(
                (i) =>
                  i.status === "success" ||
                  i.status === "error" ||
                  i.status === "aborted",
              );
              if (allComplete) {
                options.onComplete?.(updated);
              }

              return updated;
            });

            abortFnsRef.current.delete(itemId);
            activeCountRef.current--;
            processQueue();
          },
          onError: (error: Error) => {
            setItems((prev) => {
              const updated = prev.map((i) =>
                i.id === itemId ? { ...i, status: "error" as const, error } : i,
              );
              const updatedItem = updated.find((i) => i.id === itemId);
              if (updatedItem) {
                options.onItemError?.(updatedItem, error);
              }

              // Check if all uploads are complete
              const allComplete = updated.every(
                (i) =>
                  i.status === "success" ||
                  i.status === "error" ||
                  i.status === "aborted",
              );
              if (allComplete) {
                options.onComplete?.(updated);
              }

              return updated;
            });

            abortFnsRef.current.delete(itemId);
            activeCountRef.current--;
            processQueue();
          },
          onShouldRetry: options.onShouldRetry,
        },
      );

      abortFnsRef.current.set(itemId, abort);

      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, jobId } : i)),
      );
    } catch (error) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === itemId
            ? { ...i, status: "error" as const, error: error as Error }
            : i,
        ),
      );

      activeCountRef.current--;
      processQueue();
    }
  }, [client, items, maxConcurrent, options]);

  const addFiles = useCallback((files: File[] | FileList) => {
    const fileArray = Array.from(files);
    const newItems: FlowUploadItem<BrowserUploadInput>[] = fileArray.map(
      (file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        status: "pending",
        progress: 0,
        bytesUploaded: 0,
        totalBytes: file.size,
        error: null,
        result: null,
        jobId: null,
      }),
    );

    setItems((prev) => [...prev, ...newItems]);
  }, []);

  const removeFile = useCallback((id: string) => {
    const abortFn = abortFnsRef.current.get(id);
    if (abortFn) {
      abortFn();
      abortFnsRef.current.delete(id);
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
    queueRef.current = queueRef.current.filter((queueId) => queueId !== id);
  }, []);

  const startUpload = useCallback(() => {
    const pendingItems = items.filter((item) => item.status === "pending");
    queueRef.current.push(...pendingItems.map((item) => item.id));

    for (let i = 0; i < maxConcurrent; i++) {
      processQueue();
    }
  }, [items, maxConcurrent, processQueue]);

  const abortUpload = useCallback(
    (id: string) => {
      const abortFn = abortFnsRef.current.get(id);
      if (abortFn) {
        abortFn();
        abortFnsRef.current.delete(id);

        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, status: "aborted" as const } : item,
          ),
        );

        activeCountRef.current--;
        processQueue();
      }
    },
    [processQueue],
  );

  const abortAll = useCallback(() => {
    for (const abortFn of abortFnsRef.current.values()) {
      abortFn();
    }
    abortFnsRef.current.clear();
    queueRef.current = [];
    activeCountRef.current = 0;

    setItems((prev) =>
      prev.map((item) =>
        item.status === "uploading"
          ? { ...item, status: "aborted" as const }
          : item,
      ),
    );
  }, []);

  const clear = useCallback(() => {
    abortAll();
    setItems([]);
  }, [abortAll]);

  const retryUpload = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "pending" as const,
                progress: 0,
                bytesUploaded: 0,
                error: null,
              }
            : item,
        ),
      );

      queueRef.current.push(id);
      processQueue();
    },
    [processQueue],
  );

  const state: MultiFlowUploadState<BrowserUploadInput> = {
    items,
    totalProgress: calculateTotalProgress(items),
    activeUploads: items.filter((item) => item.status === "uploading").length,
    completedUploads: items.filter((item) => item.status === "success").length,
    failedUploads: items.filter((item) => item.status === "error").length,
  };

  return {
    state,
    addFiles,
    removeFile,
    startUpload,
    abortUpload,
    abortAll,
    clear,
    retryUpload,
    isUploading: state.activeUploads > 0,
  };
}
