<script setup lang="ts">
import { computed, inject } from "vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";
import type { UploadContextValue } from "./Upload.vue";

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error(
    "UploadStartAll must be used within an <Upload> component.",
  );
}

const idleCount = computed(() =>
  uploadContext.value.items.filter((item) => item.state.status === "idle").length,
);

const isDisabled = computed(
  () => uploadContext.value.state.isUploading || idleCount.value === 0,
);

const handleClick = () => {
  uploadContext.value.startAll();
};
</script>

<template>
  <button type="button" :disabled="isDisabled" @click="handleClick">
    <slot />
  </button>
</template>
