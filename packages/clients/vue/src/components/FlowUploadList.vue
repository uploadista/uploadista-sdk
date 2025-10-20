<script setup lang="ts">
import type {
  BrowserUploadInput,
  FlowUploadItem,
} from "@uploadista/client-browser";
import { computed } from "vue";
import { isBrowserFile } from "../utils";

export interface FlowUploadListProps {
  /**
   * Array of flow upload items to display
   */
  uploads: FlowUploadItem<BrowserUploadInput>[];

  /**
   * Optional filter for which items to display
   */
  filter?: (item: FlowUploadItem<BrowserUploadInput>) => boolean;

  /**
   * Optional sorting function for items
   */
  sortBy?: (
    a: FlowUploadItem<BrowserUploadInput>,
    b: FlowUploadItem<BrowserUploadInput>,
  ) => number;
}

const props = defineProps<FlowUploadListProps>();

defineSlots<{
  item(props: {
    item: FlowUploadItem<BrowserUploadInput>;
    index: number;
    isPending: boolean;
    isUploading: boolean;
    isSuccess: boolean;
    isError: boolean;
    isAborted: boolean;
    formatFileSize: (bytes: number) => string;
  }): any;
  default?(props: {
    items: FlowUploadItem<BrowserUploadInput>[];
    itemsByStatus: {
      pending: FlowUploadItem<BrowserUploadInput>[];
      uploading: FlowUploadItem<BrowserUploadInput>[];
      success: FlowUploadItem<BrowserUploadInput>[];
      error: FlowUploadItem<BrowserUploadInput>[];
      aborted: FlowUploadItem<BrowserUploadInput>[];
    };
  }): any;
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
// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const itemsByStatus = computed(() => ({
  pending: filteredItems.value.filter((item) => item.status === "pending"),
  uploading: filteredItems.value.filter((item) => item.status === "uploading"),
  success: filteredItems.value.filter((item) => item.status === "success"),
  error: filteredItems.value.filter((item) => item.status === "error"),
  aborted: filteredItems.value.filter((item) => item.status === "aborted"),
}));

// Helper function to format file sizes
// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

// Helper function to get status icon
// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const getStatusIcon = (status: string): string => {
  switch (status) {
    case "pending":
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
// biome-ignore lint/correctness/noUnusedVariables: Used in slot templates
const getStatusColor = (status: string): string => {
  switch (status) {
    case "pending":
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
  <div class="flow-upload-list">
    <slot :items="filteredItems" :items-by-status="itemsByStatus">
      <!-- Default rendering: simple list of flow upload items -->
      <div
        v-for="(item, index) in filteredItems"
        :key="item.id"
        class="flow-upload-list__item"
        :class="`flow-upload-list__item--${item.status}`"
      >
        <slot
          name="item"
          :item="item"
          :index="index"
          :is-pending="item.status === 'pending'"
          :is-uploading="item.status === 'uploading'"
          :is-success="item.status === 'success'"
          :is-error="item.status === 'error'"
          :is-aborted="item.status === 'aborted'"
          :format-file-size="formatFileSize"
        >
          <!-- Default item template -->
          <div class="flow-upload-list__item-header">
            <span class="flow-upload-list__item-icon">
              {{ getStatusIcon(item.status) }}
            </span>
            <span class="flow-upload-list__item-name">
              {{ isBrowserFile(item.file) ? item.file.name : 'File' }}
            </span>
            <span
              class="flow-upload-list__item-status"
              :style="{ color: getStatusColor(item.status) }"
            >
              {{ item.status.toUpperCase() }}
            </span>
          </div>

          <div class="flow-upload-list__item-details">
            <span class="flow-upload-list__item-size">
              {{ formatFileSize(item.totalBytes) }}
            </span>
            <span v-if="item.jobId" class="flow-upload-list__item-job">
              Job: {{ item.jobId.slice(0, 8) }}...
            </span>
          </div>

          <div v-if="item.status === 'uploading'" class="flow-upload-list__item-progress">
            <div class="flow-upload-list__progress-bar">
              <div
                class="flow-upload-list__progress-fill"
                :style="{ width: `${item.progress}%` }"
              />
            </div>
            <span class="flow-upload-list__progress-text">
              {{ item.progress }}% • {{ formatFileSize(item.bytesUploaded) }} / {{ formatFileSize(item.totalBytes) }}
            </span>
          </div>

          <div v-if="item.status === 'error' && item.error" class="flow-upload-list__item-error">
            {{ item.error.message }}
          </div>

          <div v-if="item.status === 'success'" class="flow-upload-list__item-success">
            Upload complete
          </div>
        </slot>
      </div>
    </slot>
  </div>
</template>

<style scoped>
.flow-upload-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.flow-upload-list__item {
  padding: 0.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 0.375rem;
  background-color: #fff;
}

.flow-upload-list__item-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.flow-upload-list__item-icon {
  font-size: 1rem;
}

.flow-upload-list__item-name {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.flow-upload-list__item-status {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.flow-upload-list__item-details {
  display: flex;
  gap: 1rem;
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 0.5rem;
}

.flow-upload-list__item-size {
  font-weight: 500;
}

.flow-upload-list__item-job {
  color: #999;
  font-family: monospace;
}

.flow-upload-list__item-progress {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.flow-upload-list__progress-bar {
  width: 100%;
  height: 0.375rem;
  background-color: #e0e0e0;
  border-radius: 0.1875rem;
  overflow: hidden;
}

.flow-upload-list__progress-fill {
  height: 100%;
  background-color: #007bff;
  transition: width 0.2s ease;
}

.flow-upload-list__progress-text {
  font-size: 0.75rem;
  color: #666;
}

.flow-upload-list__item-error {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #f8d7da;
  color: #721c24;
  font-size: 0.75rem;
  border-radius: 0.25rem;
}

.flow-upload-list__item-success {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #d4edda;
  color: #155724;
  font-size: 0.75rem;
  border-radius: 0.25rem;
}
</style>
