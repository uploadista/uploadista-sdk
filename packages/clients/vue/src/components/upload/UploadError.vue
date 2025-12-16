<script setup lang="ts">
import { computed, inject } from "vue";
import type { UploadItem } from "../../composables/useMultiUpload";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";
import type { UploadContextValue } from "./Upload.vue";

/**
 * Slot props for UploadError component.
 */
export interface UploadErrorSlotProps {
  /** Whether there are any errors */
  hasError: boolean;
  /** Number of failed uploads */
  failedCount: number;
  /** Failed items */
  failedItems: readonly UploadItem[];
  /** Reset/clear all errors */
  reset: () => void;
}

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error(
    "UploadError must be used within an <Upload> component.",
  );
}

const slotProps = computed<UploadErrorSlotProps>(() => {
  const failedItems = uploadContext.value.items.filter((item) =>
    ["error", "aborted"].includes(item.state.status),
  );

  return {
    hasError: failedItems.length > 0,
    failedCount: failedItems.length,
    failedItems,
    reset: uploadContext.value.clearCompleted,
  };
});
</script>

<template>
  <slot v-bind="slotProps" />
</template>
