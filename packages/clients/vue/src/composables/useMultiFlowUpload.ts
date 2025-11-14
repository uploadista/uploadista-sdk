import type {
  BrowserUploadInput,
  FlowUploadItem,
  MultiFlowUploadOptions,
  MultiFlowUploadState,
} from "@uploadista/client-browser";
import { computed, readonly, ref } from "vue";
import { useUploadistaClient } from "./useUploadistaClient";

/**
 * Vue composable for uploading multiple files through a flow.
 *
 * Must be used within a component tree that has the Uploadista plugin installed.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useMultiFlowUpload } from '@uploadista/vue';
 *
 * const multiFlowUpload = useMultiFlowUpload({
 *   flowConfig: {
 *     flowId: "batch-upload-flow",
 *     inputNodeId: "upload-node",
 *     storageId: "my-storage",
 *   },
 *   maxConcurrent: 3,
 *   onComplete: (items) => {
 *     console.log("All uploads complete:", items);
 *   },
 * });
 *
 * const handleFileChange = (event: Event) => {
 *   const files = (event.target as HTMLInputElement).files;
 *   if (files) {
 *     multiFlowUpload.addFiles(files);
 *     multiFlowUpload.startUpload();
 *   }
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <input type="file" multiple @change="handleFileChange" />
 *
 *     <div v-for="item in multiFlowUpload.state.items" :key="item.id">
 *       <span>{{ item.file.name }}</span>
 *       <progress :value="item.progress" :max="100" />
 *       <button
 *         v-if="item.status === 'uploading'"
 *         @click="multiFlowUpload.abortUpload(item.id)"
 *       >
 *         Cancel
 *       </button>
 *     </div>
 *   </div>
 * </template>
 * ```
 */
export function useMultiFlowUpload(
  options: MultiFlowUploadOptions<BrowserUploadInput>,
) {
  const client = useUploadistaClient();
  const items = ref<FlowUploadItem<BrowserUploadInput>[]>([]);
  const abortFns = ref<Map<string, () => void>>(new Map());
  const queue = ref<string[]>([]);
  const activeCount = ref(0);

  const maxConcurrent = options.maxConcurrent ?? 3;

  const calculateTotalProgress = (
    items: FlowUploadItem<BrowserUploadInput>[],
  ) => {
    if (items.length === 0) return 0;
    const totalProgress = items.reduce((sum, item) => sum + item.progress, 0);
    return Math.round(totalProgress / items.length);
  };

  const processQueue = async () => {
    if (activeCount.value >= maxConcurrent || queue.value.length === 0) {
      return;
    }

    const itemId = queue.value.shift();
    if (!itemId) return;

    const item = items.value.find((i) => i.id === itemId);
    if (!item || item.status !== "pending") {
      processQueue();
      return;
    }

    activeCount.value++;

    items.value = items.value.map((i) =>
      i.id === itemId ? { ...i, status: "uploading" as const } : i,
    );

    try {
      const { abort, jobId } = await client.client.uploadWithFlow(
        item.file,
        options.flowConfig,
        {
          onJobStart: (jobId: string) => {
            items.value = items.value.map((i) =>
              i.id === itemId ? { ...i, jobId } : i,
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

            items.value = items.value.map((i) => {
              if (i.id === itemId) {
                const updated = {
                  ...i,
                  progress,
                  bytesUploaded,
                  totalBytes: totalBytes || 0,
                };
                options.onItemProgress?.(updated);
                return updated;
              }
              return i;
            });
          },
          onSuccess: (outputs) => {
            items.value = items.value.map((i) => {
              if (i.id === itemId) {
                const updated = {
                  ...i,
                  status: "success" as const,
                  result: outputs,
                  progress: 100,
                };
                options.onItemSuccess?.(updated);
                return updated;
              }
              return i;
            });

            // Check if all uploads are complete
            const allComplete = items.value.every(
              (i) =>
                i.status === "success" ||
                i.status === "error" ||
                i.status === "aborted",
            );
            if (allComplete) {
              options.onComplete?.(items.value);
            }

            abortFns.value.delete(itemId);
            activeCount.value--;
            processQueue();
          },
          onError: (error: Error) => {
            items.value = items.value.map((i) => {
              if (i.id === itemId) {
                const updated = { ...i, status: "error" as const, error };
                options.onItemError?.(updated, error);
                return updated;
              }
              return i;
            });

            // Check if all uploads are complete
            const allComplete = items.value.every(
              (i) =>
                i.status === "success" ||
                i.status === "error" ||
                i.status === "aborted",
            );
            if (allComplete) {
              options.onComplete?.(items.value);
            }

            abortFns.value.delete(itemId);
            activeCount.value--;
            processQueue();
          },
          onShouldRetry: options.onShouldRetry,
        },
      );

      abortFns.value.set(itemId, abort);

      items.value = items.value.map((i) =>
        i.id === itemId ? { ...i, jobId } : i,
      );
    } catch (error) {
      items.value = items.value.map((i) =>
        i.id === itemId
          ? { ...i, status: "error" as const, error: error as Error }
          : i,
      );

      activeCount.value--;
      processQueue();
    }
  };

  const addFiles = (files: File[] | FileList) => {
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

    items.value = [...items.value, ...newItems];
  };

  const removeFile = (id: string) => {
    const abortFn = abortFns.value.get(id);
    if (abortFn) {
      abortFn();
      abortFns.value.delete(id);
    }

    items.value = items.value.filter((item) => item.id !== id);
    queue.value = queue.value.filter((queueId) => queueId !== id);
  };

  const startUpload = () => {
    const pendingItems = items.value.filter(
      (item) => item.status === "pending",
    );
    queue.value.push(...pendingItems.map((item) => item.id));

    for (let i = 0; i < maxConcurrent; i++) {
      processQueue();
    }
  };

  const abortUpload = (id: string) => {
    const abortFn = abortFns.value.get(id);
    if (abortFn) {
      abortFn();
      abortFns.value.delete(id);

      items.value = items.value.map((item) =>
        item.id === id ? { ...item, status: "aborted" as const } : item,
      );

      activeCount.value--;
      processQueue();
    }
  };

  const abortAll = () => {
    for (const abortFn of abortFns.value.values()) {
      abortFn();
    }
    abortFns.value.clear();
    queue.value = [];
    activeCount.value = 0;

    items.value = items.value.map((item) =>
      item.status === "uploading"
        ? { ...item, status: "aborted" as const }
        : item,
    );
  };

  const clear = () => {
    abortAll();
    items.value = [];
  };

  const retryUpload = (id: string) => {
    items.value = items.value.map((item) =>
      item.id === id
        ? {
            ...item,
            status: "pending" as const,
            progress: 0,
            bytesUploaded: 0,
            error: null,
          }
        : item,
    );

    queue.value.push(id);
    processQueue();
  };

  const state = computed<MultiFlowUploadState<BrowserUploadInput>>(() => ({
    items: items.value,
    totalProgress: calculateTotalProgress(items.value),
    activeUploads: items.value.filter((item) => item.status === "uploading")
      .length,
    completedUploads: items.value.filter((item) => item.status === "success")
      .length,
    failedUploads: items.value.filter((item) => item.status === "error").length,
  }));

  return {
    state: readonly(state),
    addFiles,
    removeFile,
    startUpload,
    abortUpload,
    abortAll,
    clear,
    retryUpload,
    isUploading: computed(() => state.value.activeUploads > 0),
  };
}
