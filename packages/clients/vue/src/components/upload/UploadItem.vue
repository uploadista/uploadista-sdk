<script setup lang="ts">
import { computed, inject, provide } from "vue";
import type { UploadContextValue } from "./Upload.vue";
import {
  UPLOAD_CONTEXT_KEY,
  UPLOAD_ITEM_CONTEXT_KEY,
  type UploadItemContextValue,
} from "./useUploadContext";

/**
 * Props for UploadItem component.
 */
export interface UploadItemProps {
  /** Item ID */
  id: string;
}

/**
 * Slot props for UploadItem component.
 */
export interface UploadItemSlotProps extends UploadItemContextValue {}

const props = defineProps<UploadItemProps>();

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error("UploadItem must be used within an <Upload> component.");
}

const item = computed(() =>
  uploadContext.value.items.find((i) => i.id === props.id),
);

const itemContext = computed<UploadItemContextValue | null>(() => {
  const currentItem = item.value;
  if (!currentItem) return null;

  return {
    id: props.id,
    file: currentItem.file,
    state: currentItem.state,
    abort: () => uploadContext.value.abortUpload(props.id),
    retry: () => uploadContext.value.retryUpload(props.id),
    remove: () => uploadContext.value.removeItem(props.id),
  };
});

// Provide item context for nested components
provide(UPLOAD_ITEM_CONTEXT_KEY, itemContext);
</script>

<template>
  <slot v-if="itemContext" v-bind="itemContext" />
</template>
