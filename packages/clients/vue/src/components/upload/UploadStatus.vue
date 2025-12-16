<script setup lang="ts">
import { computed, inject } from "vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";
import type { UploadContextValue } from "./Upload.vue";

/**
 * Slot props for UploadStatus component.
 */
export interface UploadStatusSlotProps {
  /** Overall status */
  status: "idle" | "uploading" | "success" | "error";
  /** Whether idle (no uploads active or completed) */
  isIdle: boolean;
  /** Whether uploading */
  isUploading: boolean;
  /** Whether all uploads succeeded */
  isSuccess: boolean;
  /** Whether any upload failed */
  isError: boolean;
  /** Whether all uploads completed (success or failure) */
  isComplete: boolean;
  /** Number of total items */
  total: number;
  /** Number of successful uploads */
  successful: number;
  /** Number of failed uploads */
  failed: number;
  /** Number of currently uploading */
  uploading: number;
}

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error(
    "UploadStatus must be used within an <Upload> component.",
  );
}

const slotProps = computed<UploadStatusSlotProps>(() => {
  const state = uploadContext.value.state;

  // Derive overall status
  let status: "idle" | "uploading" | "success" | "error" = "idle";
  if (state.isUploading) {
    status = "uploading";
  } else if (state.isComplete) {
    status = state.failed > 0 ? "error" : "success";
  }

  return {
    status,
    isIdle: status === "idle",
    isUploading: state.isUploading,
    isSuccess: state.isComplete && state.failed === 0,
    isError: state.failed > 0,
    isComplete: state.isComplete,
    total: state.total,
    successful: state.successful,
    failed: state.failed,
    uploading: state.uploading,
  };
});
</script>

<template>
  <slot v-bind="slotProps" />
</template>
