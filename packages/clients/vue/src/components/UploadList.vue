<script setup lang="ts">
/**
 * UploadList - Display a list of uploads with customizable status grouping and sorting
 *
 * Shows the progress and status of multiple file uploads. Supports filtering, sorting,
 * and status-based grouping. Provides flexible slot-based customization for rendering each item.
 *
 * @component
 * @example
 * // Basic upload list
 * <UploadList :uploads="uploads" />
 *
 * @example
 * // Custom item rendering with status indicators
 * <UploadList :uploads="uploads">
 *   <template #item="{ item, isSuccess, isError }">
 *     <div class="upload-item">
 *       <span>{{ item.filename }}</span>
 *       <progress :value="item.progress" max="100"></progress>
 *       <span :class="{ success: isSuccess, error: isError }">
 *         {{ item.state.status }}
 *       </span>
 *     </div>
 *   </template>
 * </UploadList>
 *
 * @example
 * // With filtering and sorting
 * <UploadList
 *   :uploads="uploads"
 *   :filter="item => item.state.status === 'success'"
 *   :sort-by="(a, b) => a.uploadedAt - b.uploadedAt"
 * />
 */
import type { VNodeChild } from "vue";
import { computed } from "vue";
import type { UploadItem } from "../composables";
import { isBrowserFile } from "../utils";

/**
 * Props for the UploadList component
 * @property {UploadItem[]} uploads - Array of upload items to display
 * @property {Function} filter - Optional filter for which items to display
 * @property {Function} sortBy - Optional sorting function for items (a, b) => number
 */
export interface UploadListProps {
  /**
   * Array of upload items to display
   */
  uploads: UploadItem[];

  /**
   * Optional filter for which items to display
   */
  filter?: (item: UploadItem) => boolean;

  /**
   * Optional sorting function for items
   */
  sortBy?: (a: UploadItem, b: UploadItem) => number;
}

const props = defineProps<UploadListProps>();

defineSlots<{
  item(props: {
    item: UploadItem;
    index: number;
    isUploading: boolean;
    isSuccess: boolean;
    isError: boolean;
    formatFileSize: (bytes: number) => string;
  }): VNodeChild;
  default?(props: {
    items: UploadItem[];
    itemsByStatus: {
      idle: UploadItem[];
      uploading: UploadItem[];
      success: UploadItem[];
      error: UploadItem[];
      aborted: UploadItem[];
    };
  }): VNodeChild;
}>();

// Apply filtering and sorting
const filteredItems = computed(() => {
  let items = props.uploads;

  if (props.filter) {
    items = items.filter(props.filter);
  }

  if (props.sortBy) {
    items = [...items].sort(props.sortBy);
  }

  return items;
});

// Group items by status
const itemsByStatus = computed(() => ({
  idle: filteredItems.value.filter((item) => item.state.status === "idle"),
  uploading: filteredItems.value.filter(
    (item) => item.state.status === "uploading",
  ),
  success: filteredItems.value.filter(
    (item) => item.state.status === "success",
  ),
  error: filteredItems.value.filter((item) => item.state.status === "error"),
  aborted: filteredItems.value.filter(
    (item) => item.state.status === "aborted",
  ),
}));

// Helper function to format file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

// Helper function to get status icon
const getStatusIcon = (status: string): string => {
  switch (status) {
    case "idle":
      return "⏳";
    case "uploading":
      return "📤";
    case "success":
      return "✅";
    case "error":
      return "❌";
    case "aborted":
      return "⏹️";
    default:
      return "❓";
  }
};

// Helper function to get status color
const getStatusColor = (status: string): string => {
  switch (status) {
    case "idle":
      return "#6c757d";
    case "uploading":
      return "#007bff";
    case "success":
      return "#28a745";
    case "error":
      return "#dc3545";
    case "aborted":
      return "#6c757d";
    default:
      return "#6c757d";
  }
};
</script>

<template>
  <div class="upload-list">
    <slot :items="filteredItems" :items-by-status="itemsByStatus">
      <!-- Default rendering: simple list of upload items -->
      <div
        v-for="(item, index) in filteredItems"
        :key="item.id"
        class="upload-list__item"
        :class="`upload-list__item--${item.state.status}`"
      >
        <slot
          name="item"
          :item="item"
          :index="index"
          :is-uploading="item.state.status === 'uploading'"
          :is-success="item.state.status === 'success'"
          :is-error="item.state.status === 'error'"
          :format-file-size="formatFileSize"
        >
          <!-- Default item template -->
          <div class="upload-list__item-header">
            <span class="upload-list__item-icon">
              {{ getStatusIcon(item.state.status) }}
            </span>
            <span class="upload-list__item-name">
              {{ isBrowserFile(item.file) ? item.file.name : 'File' }}
            </span>
            <span
              class="upload-list__item-status"
              :style="{ color: getStatusColor(item.state.status) }"
            >
              {{ item.state.status.toUpperCase() }}
            </span>
          </div>

          <div v-if="item.state.totalBytes" class="upload-list__item-size">
            {{ formatFileSize(item.state.totalBytes) }}
          </div>

          <div v-if="item.state.status === 'uploading'" class="upload-list__item-progress">
            <div class="upload-list__progress-bar">
              <div
                class="upload-list__progress-fill"
                :style="{ width: `${item.state.progress}%` }"
              />
            </div>
            <span class="upload-list__progress-text">{{ item.state.progress }}%</span>
          </div>

          <div v-if="item.state.status === 'error' && item.state.error" class="upload-list__item-error">
            {{ item.state.error.message }}
          </div>
        </slot>
      </div>
    </slot>
  </div>
</template>

<style scoped>
.upload-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.upload-list__item {
  padding: 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 0.375rem;
  background-color: #fff;
}

.upload-list__item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.upload-list__item-icon {
  font-size: 1rem;
}

.upload-list__item-name {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-list__item-status {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.upload-list__item-size {
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.upload-list__item-progress {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.upload-list__progress-bar {
  flex: 1;
  height: 0.375rem;
  background-color: #e0e0e0;
  border-radius: 0.1875rem;
  overflow: hidden;
}

.upload-list__progress-fill {
  height: 100%;
  background-color: #007bff;
  transition: width 0.2s ease;
}

.upload-list__progress-text {
  font-size: 0.75rem;
  color: #666;
  min-width: 3rem;
  text-align: right;
}

.upload-list__item-error {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #f8d7da;
  color: #721c24;
  font-size: 0.75rem;
  border-radius: 0.25rem;
}
</style>
