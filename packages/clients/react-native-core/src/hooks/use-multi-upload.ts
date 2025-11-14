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
  const { client } = useUploadistaContext();
  const [state, setState] = useState<MultiUploadState>(initialState);
  const abortControllersRef = useRef<Map<string, { abort: () => void }>>(
    new Map(),
  );
  const nextIdRef = useRef(0);
  // Use ref to track items synchronously
  const itemsRef = useRef<UploadItemState[]>([]);

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

    // Update ref synchronously
    itemsRef.current = items;

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

      // Update ref synchronously
      const updatedItems = [...itemsRef.current, ...newItems];
      itemsRef.current = updatedItems;

      setState((prev) => {
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
        console.log("Uploading item:", item.file.data.name);
        // Update status to uploading
        const updatedItems = itemsRef.current.map((i) =>
          i.id === item.id ? { ...i, status: "uploading" as const } : i,
        );
        updateAggregateStats(updatedItems);

        // Convert file URI to Blob using fetch (React Native compatible)
        // React Native's Blob doesn't support ArrayBuffer/Uint8Array constructor
        const response = await fetch(item.file.data.uri);
        const blob = await response.blob();

        // Override blob type if we have mimeType from picker
        const uploadInput = item.file.data.mimeType
          ? new Blob([blob], {
              type: item.file.data.mimeType,
              lastModified: Date.now(),
            })
          : blob;

        // Start upload using the client
        console.log("Uploading input:", uploadInput);
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

            const updatedItems = itemsRef.current.map((i) =>
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
          },

          onSuccess: (result: UploadFile) => {
            const updatedItems = itemsRef.current.map((i) =>
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

            options.onSuccess?.(result);
            abortControllersRef.current.delete(item.id);
          },

          onError: (error: Error) => {
            const updatedItems = itemsRef.current.map((i) =>
              i.id === item.id ? { ...i, status: "error" as const, error } : i,
            );
            updateAggregateStats(updatedItems);

            options.onError?.(error);
            abortControllersRef.current.delete(item.id);
          },
        });

        // Store abort controller
        const controller = await uploadPromise;
        abortControllersRef.current.set(item.id, controller);
      } catch (error) {
        console.error("Error uploading item:", error);
        const updatedItems = itemsRef.current.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: "error" as const,
                error: error as Error,
              }
            : i,
        );
        updateAggregateStats(updatedItems);

        options.onError?.(error as Error);
        abortControllersRef.current.delete(item.id);
      }
    },
    [client, options, updateAggregateStats],
  );

  const startUploads = useCallback(
    async (itemIds?: string[]) => {
      const maxConcurrent = options.maxConcurrent || 3;

      // Get items from ref (synchronous access to latest items)
      const itemsToUpload = itemIds
        ? itemsRef.current.filter(
            (item) => itemIds.includes(item.id) && item.status === "idle",
          )
        : itemsRef.current.filter((item) => item.status === "idle");

      console.log("Items to upload:", itemsToUpload.length, itemsToUpload);

      // Process items in batches
      for (let i = 0; i < itemsToUpload.length; i += maxConcurrent) {
        const batch = itemsToUpload.slice(i, i + maxConcurrent);
        await Promise.all(batch.map((item) => uploadSingleItem(item)));
      }
    },
    [options.maxConcurrent, uploadSingleItem],
  );

  const removeItem = useCallback(
    (id: string) => {
      const controller = abortControllersRef.current.get(id);
      if (controller) {
        controller.abort();
        abortControllersRef.current.delete(id);
      }

      const updatedItems = itemsRef.current.filter((item) => item.id !== id);
      updateAggregateStats(updatedItems);
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

      const updatedItems = itemsRef.current.map((item) =>
        item.id === id ? { ...item, status: "aborted" as const } : item,
      );
      updateAggregateStats(updatedItems);
    },
    [updateAggregateStats],
  );

  const clear = useCallback(() => {
    // Abort all active uploads
    abortControllersRef.current.forEach((controller) => {
      controller.abort();
    });
    abortControllersRef.current.clear();

    // Clear ref
    itemsRef.current = [];

    setState(initialState);
  }, []);

  const retryItem = useCallback(
    async (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (item && (item.status === "error" || item.status === "aborted")) {
        // Reset item status to idle
        const updatedItems = itemsRef.current.map((i) =>
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

        // Upload it (get the reset item from the updated items)
        const resetItem = itemsRef.current.find((i) => i.id === id);
        if (resetItem) {
          await uploadSingleItem(resetItem);
        }
      }
    },
    [uploadSingleItem, updateAggregateStats],
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
