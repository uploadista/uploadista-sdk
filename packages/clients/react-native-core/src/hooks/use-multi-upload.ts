import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useRef, useState } from "react";
import type { FilePickResult, UseMultiUploadOptions } from "../types";
import { useUploadistaContext } from "./use-uploadista-context";

export interface UploadItemState {
  id: string;
  file: Extract<FilePickResult, { status: "success" }>;
  status: "idle" | "uploading" | "success" | "error" | "aborted";
  progress: number;
  bytesUploaded: number;
  totalBytes: number;
  error: Error | null;
  result: UploadFile | null;
}

export interface MultiUploadState {
  items: UploadItemState[];
  totalProgress: number;
  totalUploaded: number;
  totalBytes: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
}

const initialState: MultiUploadState = {
  items: [],
  totalProgress: 0,
  totalUploaded: 0,
  totalBytes: 0,
  activeCount: 0,
  completedCount: 0,
  failedCount: 0,
};

/**
 * Hook for managing multiple concurrent file uploads with progress tracking.
 * Each file is uploaded independently using the core upload client.
 *
 * Must be used within an UploadistaProvider.
 *
 * @param options - Multi-upload configuration options
 * @returns Multi-upload state and control methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const multiUpload = useMultiUpload({
 *     maxConcurrent: 3,
 *     onSuccess: (result) => console.log('File uploaded:', result),
 *     onError: (error) => console.error('Upload failed:', error),
 *   });
 *
 *   const handlePickFiles = async () => {
 *     const files = await fileSystemProvider.pickImage({ allowMultiple: true });
 *     multiUpload.addFiles(files);
 *     await multiUpload.startUploads();
 *   };
 *
 *   return (
 *     <View>
 *       <Button title="Pick Files" onPress={handlePickFiles} />
 *       <Text>Progress: {multiUpload.state.totalProgress}%</Text>
 *       <Text>Active: {multiUpload.state.activeCount}</Text>
 *       <Text>Completed: {multiUpload.state.completedCount}/{multiUpload.state.items.length}</Text>
 *     </View>
 *   );
 * }
 * ```
 */
export function useMultiUpload(options: UseMultiUploadOptions = {}) {
  const { client, fileSystemProvider } = useUploadistaContext();
  const [state, setState] = useState<MultiUploadState>(initialState);
  const abortControllersRef = useRef<Map<string, { abort: () => void }>>(
    new Map(),
  );
  const nextIdRef = useRef(0);

  const generateId = useCallback(() => {
    return `upload-${Date.now()}-${nextIdRef.current++}`;
  }, []);

  const updateAggregateStats = useCallback((items: UploadItemState[]) => {
    const totalBytes = items.reduce((sum, item) => sum + item.totalBytes, 0);
    const totalUploaded = items.reduce(
      (sum, item) => sum + item.bytesUploaded,
      0,
    );
    const totalProgress =
      totalBytes > 0 ? Math.round((totalUploaded / totalBytes) * 100) : 0;
    const activeCount = items.filter(
      (item) => item.status === "uploading",
    ).length;
    const completedCount = items.filter(
      (item) => item.status === "success",
    ).length;
    const failedCount = items.filter((item) => item.status === "error").length;

    setState((prev) => ({
      ...prev,
      items,
      totalProgress,
      totalUploaded,
      totalBytes,
      activeCount,
      completedCount,
      failedCount,
    }));
  }, []);

  const addFiles = useCallback(
    (files: FilePickResult[]) => {
      // Filter out cancelled and error results, only keep successful picks
      const successfulFiles = files.filter(
        (file): file is Extract<FilePickResult, { status: "success" }> =>
          file.status === "success",
      );

      const newItems: UploadItemState[] = successfulFiles.map((file) => ({
        id: generateId(),
        file,
        status: "idle" as const,
        progress: 0,
        bytesUploaded: 0,
        totalBytes: file.data.size,
        error: null,
        result: null,
      }));

      setState((prev) => {
        const updatedItems = [...prev.items, ...newItems];
        const totalBytes = updatedItems.reduce(
          (sum, item) => sum + item.totalBytes,
          0,
        );
        return {
          ...prev,
          items: updatedItems,
          totalBytes,
        };
      });

      return newItems.map((item) => item.id);
    },
    [generateId],
  );

  const uploadSingleItem = useCallback(
    async (item: UploadItemState) => {
      try {
        // Update status to uploading
        setState((prev) => {
          const updatedItems = prev.items.map((i) =>
            i.id === item.id ? { ...i, status: "uploading" as const } : i,
          );
          updateAggregateStats(updatedItems);
          return prev;
        });

        // Read file content
        const fileContent = await fileSystemProvider.readFile(
          item.file.data.uri,
        );

        // Create a Blob from the file content
        // Convert ArrayBuffer to Uint8Array for better compatibility
        const data =
          fileContent instanceof ArrayBuffer
            ? new Uint8Array(fileContent)
            : fileContent;
        // Note: Using any cast here because React Native Blob accepts BufferSource
        // but TypeScript's lib.dom.d.ts Blob type doesn't include it
        // biome-ignore lint/suspicious/noExplicitAny: React Native Blob accepts BufferSource
        const blob = new Blob([data as any], {
          type: item.file.data.mimeType || "application/octet-stream",
          // biome-ignore lint/suspicious/noExplicitAny: BlobPropertyBag type differs by platform
        } as any);

        // use the Blob (for React Native)
        const uploadInput = blob;

        // Start upload using the client
        const uploadPromise = client.upload(uploadInput, {
          metadata: options.metadata,

          onProgress: (
            _uploadId: string,
            bytesUploaded: number,
            totalBytes: number | null,
          ) => {
            const progress = totalBytes
              ? Math.round((bytesUploaded / totalBytes) * 100)
              : 0;

            setState((prev) => {
              const updatedItems = prev.items.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      progress,
                      bytesUploaded,
                      totalBytes: totalBytes || i.totalBytes,
                    }
                  : i,
              );
              updateAggregateStats(updatedItems);
              return prev;
            });
          },

          onSuccess: (result: UploadFile) => {
            setState((prev) => {
              const updatedItems = prev.items.map((i) =>
                i.id === item.id
                  ? {
                      ...i,
                      status: "success" as const,
                      progress: 100,
                      result,
                      bytesUploaded: result.size || i.totalBytes,
                    }
                  : i,
              );
              updateAggregateStats(updatedItems);
              return prev;
            });

            options.onSuccess?.(result);
            abortControllersRef.current.delete(item.id);
          },

          onError: (error: Error) => {
            setState((prev) => {
              const updatedItems = prev.items.map((i) =>
                i.id === item.id
                  ? { ...i, status: "error" as const, error }
                  : i,
              );
              updateAggregateStats(updatedItems);
              return prev;
            });

            options.onError?.(error);
            abortControllersRef.current.delete(item.id);
          },
        });

        // Store abort controller
        const controller = await uploadPromise;
        abortControllersRef.current.set(item.id, controller);
      } catch (error) {
        setState((prev) => {
          const updatedItems = prev.items.map((i) =>
            i.id === item.id
              ? {
                  ...i,
                  status: "error" as const,
                  error: error as Error,
                }
              : i,
          );
          updateAggregateStats(updatedItems);
          return prev;
        });

        options.onError?.(error as Error);
        abortControllersRef.current.delete(item.id);
      }
    },
    [client, fileSystemProvider, options, updateAggregateStats],
  );

  const startUploads = useCallback(async () => {
    const maxConcurrent = options.maxConcurrent || 3;
    const itemsToUpload = state.items.filter((item) => item.status === "idle");

    // Process items in batches
    for (let i = 0; i < itemsToUpload.length; i += maxConcurrent) {
      const batch = itemsToUpload.slice(i, i + maxConcurrent);
      await Promise.all(batch.map((item) => uploadSingleItem(item)));
    }
  }, [state.items, options.maxConcurrent, uploadSingleItem]);

  const removeItem = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(id);
      }

      setState((prev) => {
        const updatedItems = prev.items.filter((item) => item.id !== id);
        updateAggregateStats(updatedItems);
        return prev;
      });
    },
    [updateAggregateStats],
  );

  const abortItem = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(id);
      }

      setState((prev) => {
        const updatedItems = prev.items.map((item) =>
          item.id === id ? { ...item, status: "aborted" as const } : item,
        );
        updateAggregateStats(updatedItems);
        return prev;
      });
    },
    [updateAggregateStats],
  );

  const clear = useCallback(() => {
    // Abort all active uploads
    abortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    abortControllersRef.current.clear();

    setState(initialState);
  }, []);

  const retryItem = useCallback(
    async (id: string) => {
      const item = state.items.find((i) => i.id === id);
      if (item && (item.status === "error" || item.status === "aborted")) {
        // Reset item status to idle
        setState((prev) => {
          const updatedItems = prev.items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  status: "idle" as const,
                  progress: 0,
                  bytesUploaded: 0,
                  error: null,
                }
              : i,
          );
          updateAggregateStats(updatedItems);
          return prev;
        });

        // Upload it
        const resetItem = state.items.find((i) => i.id === id);
        if (resetItem) {
          await uploadSingleItem(resetItem);
        }
      }
    },
    [state.items, uploadSingleItem, updateAggregateStats],
  );

  return {
    state,
    addFiles,
    startUploads,
    removeItem,
    abortItem,
    retryItem,
    clear,
  };
}
