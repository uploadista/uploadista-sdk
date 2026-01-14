<script setup lang="ts">
import { computed, inject } from "vue";
import type { UploadContextValue } from "./Upload.vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error("UploadCancel must be used within an <Upload> component.");
}

const isDisabled = computed(() => !uploadContext.value.state.isUploading);

const handleClick = () => {
  uploadContext.value.abortAll();
};
</script>

<template>
  <button type="button" :disabled="isDisabled" @click="handleClick">
    <slot />
  </button>
</template>
