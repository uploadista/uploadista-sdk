<script setup lang="ts">
import { computed, inject } from "vue";
import type { UploadItem } from "../../composables/useMultiUpload";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";
import type { UploadContextValue } from "./Upload.vue";

/**
 * Slot props for UploadItems component.
 */
export interface UploadItemsSlotProps {
  /** All upload items */
  items: readonly UploadItem[];
  /** Whether there are any items */
  hasItems: boolean;
  /** Whether items array is empty */
  isEmpty: boolean;
}

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error(
    "UploadItems must be used within an <Upload> component.",
  );
}

const slotProps = computed<UploadItemsSlotProps>(() => ({
  items: uploadContext.value.items,
  hasItems: uploadContext.value.items.length > 0,
  isEmpty: uploadContext.value.items.length === 0,
}));
</script>

<template>
  <slot v-bind="slotProps" />
</template>
