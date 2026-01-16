<script setup lang="ts">
import { computed, inject } from "vue";
import type { UploadContextValue } from "./Upload.vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";

/**
 * Slot props for UploadProgress component.
 */
export interface UploadProgressSlotProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes uploaded so far */
  bytesUploaded: number;
  /** Total bytes to upload */
  totalBytes: number;
  /** Whether any uploads are active */
  isUploading: boolean;
}

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error("UploadProgress must be used within an <Upload> component.");
}

const slotProps = computed<UploadProgressSlotProps>(() => ({
  progress: uploadContext.value.state.progress,
  bytesUploaded: uploadContext.value.state.totalBytesUploaded,
  totalBytes: uploadContext.value.state.totalBytes,
  isUploading: uploadContext.value.state.isUploading,
}));
</script>

<template>
  <slot v-bind="slotProps" />
</template>
