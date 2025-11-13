import type { UploadOptions } from "@uploadista/client-browser";
import type { UploadMetrics } from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { computed, readonly, ref } from "vue";
import type { UploadInput, UploadState, UploadStatus } from "./useUpload";
import { useUploadistaClient } from "./useUploadistaClient";

export interface UploadItem {
  id: string;
  file: UploadInput;
  state: UploadState;
}

export interface MultiUploadOptions
  extends Omit<UploadOptions, "onSuccess" | "onError" | "onProgress"> {
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

/**
 * Vue composable for managing multiple file uploads with queue management,
 * concurrent upload limits, and batch operations.
 *
 * Must be used within a component tree that has the Uploadista plugin installed.
 *
 * @param options - Multi-upload configuration and event handlers
 * @returns Multi-upload state and control methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useMultiUpload } from '@uploadista/vue';
 *
 * const multiUpload = useMultiUpload({
 *   maxConcurrent: 3,
 *   onUploadSuccess: (item, result) => {
 *     console.log(`${item.file.name} uploaded successfully`);
 *   },
 *   onComplete: (results) => {
 *     console.log(`Upload batch complete: ${results.successful.length}/${results.total} successful`);
 *   },
 * });
 *
 * const handleFileChange = (event: Event) => {
 *   const files = (event.target as HTMLInputElement).files;
 *   if (files) {
 *     multiUpload.addFiles(Array.from(files));
 *   }
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <input type="file" multiple @change="handleFileChange" />
 *
 *     <div>Progress: {{ multiUpload.state.progress }}%</div>
 *     <div>
 *       {{ multiUpload.state.uploading }} uploading,
 *       {{ multiUpload.state.successful }} successful,
 *       {{ multiUpload.state.failed }} failed
 *     </div>
 *
 *     <button @click="multiUpload.startAll" :disabled="multiUpload.state.isUploading">
 *       Start All
 *     </button>
 *     <button @click="multiUpload.abortAll" :disabled="!multiUpload.state.isUploading">
 *       Abort All
 *     </button>
 *     <button @click="multiUpload.retryFailed" :disabled="multiUpload.state.failed === 0">
 *       Retry Failed
 *     </button>
 *
 *     <div v-for="item in multiUpload.items" :key="item.id">
 *       {{ item.file.name }}: {{ item.state.status }} ({{ item.state.progress }}%)
 *     </div>
 *   </div>
 * </template>
 * ```
 */
export function useMultiUpload(options: MultiUploadOptions = {}) {
  const uploadClient = useUploadistaClient();
  const { maxConcurrent = 3 } = options;
  const items = ref<UploadItem[]>([]);
  const nextId = ref(0);
  const activeUploads = ref(new Set<string>());

  // Store abort controllers for each upload
  const abortControllers = ref<Map<string, { abort: () => void }>>(new Map());

  // Generate a unique ID for each upload item
  const generateId = () => {
    return `upload-${Date.now()}-${nextId.value++}`;
  };

  // State update callback for individual uploads
  const onStateUpdate = (id: string, state: Partial<UploadState>) => {
    items.value = items.value.map((item) =>
      item.id === id ? { ...item, state: { ...item.state, ...state } } : item,
    );
  };

  // Check if all uploads are complete and trigger completion callback
  const checkForCompletion = () => {
    const allComplete = items.value.every((item) =>
      ["success", "error", "aborted"].includes(item.state.status),
    );

    if (allComplete && items.value.length > 0) {
      const successful = items.value.filter(
        (item) => item.state.status === "success",
      );
      const failed = items.value.filter((item) =>
        ["error", "aborted"].includes(item.state.status),
      );

      options.onComplete?.({
        successful,
        failed,
        total: items.value.length,
      });
    }
  };

  // Start the next available upload if we have capacity
  const startNextUpload = async () => {
    if (activeUploads.value.size >= maxConcurrent) {
      return;
    }

    const nextItem = items.value.find(
      (item) =>
        item.state.status === "idle" && !activeUploads.value.has(item.id),
    );

    if (!nextItem) {
      return;
    }

    activeUploads.value.add(nextItem.id);
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
          activeUploads.value.delete(nextItem.id);
          abortControllers.value.delete(nextItem.id);
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
          activeUploads.value.delete(nextItem.id);
          abortControllers.value.delete(nextItem.id);
          startNextUpload();
          checkForCompletion();
        },

        onShouldRetry: options.onShouldRetry,
      });

      // Store abort controller
      abortControllers.value.set(nextItem.id, controller);
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
      activeUploads.value.delete(nextItem.id);
      abortControllers.value.delete(nextItem.id);
      startNextUpload();
      checkForCompletion();
    }
  };

  // Calculate overall state
  const state = computed<MultiUploadState>(() => {
    const itemsList = items.value;
    return {
      total: itemsList.length,
      completed: itemsList.filter((item) =>
        ["success", "error", "aborted"].includes(item.state.status),
      ).length,
      successful: itemsList.filter((item) => item.state.status === "success")
        .length,
      failed: itemsList.filter((item) =>
        ["error", "aborted"].includes(item.state.status),
      ).length,
      uploading: itemsList.filter((item) => item.state.status === "uploading")
        .length,
      progress:
        itemsList.length > 0
          ? Math.round(
              itemsList.reduce((sum, item) => sum + item.state.progress, 0) /
                itemsList.length,
            )
          : 0,
      totalBytesUploaded: itemsList.reduce(
        (sum, item) => sum + item.state.bytesUploaded,
        0,
      ),
      totalBytes: itemsList.reduce(
        (sum, item) => sum + (item.state.totalBytes || 0),
        0,
      ),
      isUploading: itemsList.some((item) => item.state.status === "uploading"),
      isComplete:
        itemsList.length > 0 &&
        itemsList.every((item) =>
          ["success", "error", "aborted"].includes(item.state.status),
        ),
    };
  });

  const addFiles = (files: UploadInput[]) => {
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

    items.value = [...items.value, ...newItems];
  };

  const removeItem = (id: string) => {
    const item = items.value.find((i) => i.id === id);
    if (item && item.state.status === "uploading") {
      // Abort before removing
      const controller = abortControllers.value.get(id);
      if (controller) {
        controller.abort();
        abortControllers.value.delete(id);
      }
    }

    items.value = items.value.filter((item) => item.id !== id);
    activeUploads.value.delete(id);
  };

  const abortUpload = (id: string) => {
    const item = items.value.find((i) => i.id === id);
    if (item && item.state.status === "uploading") {
      const controller = abortControllers.value.get(id);
      if (controller) {
        controller.abort();
        abortControllers.value.delete(id);
      }

      activeUploads.value.delete(id);

      items.value = items.value.map((i) =>
        i.id === id
          ? { ...i, state: { ...i.state, status: "aborted" as const } }
          : i,
      );

      // Try to start next upload in queue
      startNextUpload();
    }
  };

  const retryUpload = (id: string) => {
    const item = items.value.find((i) => i.id === id);
    if (item && ["error", "aborted"].includes(item.state.status)) {
      items.value = items.value.map((i) =>
        i.id === id
          ? {
              ...i,
              state: { ...i.state, status: "idle" as const, error: null },
            }
          : i,
      );

      // Auto-start the upload
      setTimeout(() => startNextUpload(), 0);
    }
  };

  const startAll = () => {
    // Start as many uploads as we can up to the concurrent limit
    const idleItems = items.value.filter(
      (item) => item.state.status === "idle",
    );
    const slotsAvailable = maxConcurrent - activeUploads.value.size;
    const itemsToStart = idleItems.slice(0, slotsAvailable);

    for (const _item of itemsToStart) {
      startNextUpload();
    }
  };

  const abortAll = () => {
    items.value
      .filter((item) => item.state.status === "uploading")
      .forEach((item) => {
        const controller = abortControllers.value.get(item.id);
        if (controller) {
          controller.abort();
          abortControllers.value.delete(item.id);
        }
      });

    activeUploads.value.clear();

    // Update all uploading items to aborted status
    items.value = items.value.map((item) =>
      item.state.status === "uploading"
        ? { ...item, state: { ...item.state, status: "aborted" as const } }
        : item,
    );
  };

  const retryFailed = () => {
    const failedItems = items.value.filter((item) =>
      ["error", "aborted"].includes(item.state.status),
    );

    if (failedItems.length > 0) {
      items.value = items.value.map((item) =>
        failedItems.some((f) => f.id === item.id)
          ? {
              ...item,
              state: { ...item.state, status: "idle" as const, error: null },
            }
          : item,
      );

      // Auto-start uploads if we have capacity
      setTimeout(startAll, 0);
    }
  };

  const clearCompleted = () => {
    items.value = items.value.filter(
      (item) => !["success", "error", "aborted"].includes(item.state.status),
    );
  };

  const clearAll = () => {
    abortAll();
    items.value = [];
    activeUploads.value.clear();
  };

  const getItemsByStatus = (status: UploadStatus) => {
    return items.value.filter((item) => item.state.status === status);
  };

  // Create aggregated metrics object that delegates to the upload client
  const metrics: UploadMetrics = {
    getInsights: () => uploadClient.client.getChunkingInsights(),
    exportMetrics: () => uploadClient.client.exportMetrics(),
    getNetworkMetrics: () => uploadClient.client.getNetworkMetrics(),
    getNetworkCondition: () => uploadClient.client.getNetworkCondition(),
    resetMetrics: () => uploadClient.client.resetMetrics(),
  };

  return {
    state: readonly(state),
    items: readonly(items),
    addFiles,
    removeItem,
    removeFile: removeItem, // Alias for consistency
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
