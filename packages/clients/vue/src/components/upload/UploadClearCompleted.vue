<script setup lang="ts">
import { computed, inject } from "vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";
import type { UploadContextValue } from "./Upload.vue";

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error(
    "UploadClearCompleted must be used within an <Upload> component.",
  );
}

const isDisabled = computed(() => uploadContext.value.state.completed === 0);

const handleClick = () => {
  uploadContext.value.clearCompleted();
};
</script>

<template>
  <button type="button" :disabled="isDisabled" @click="handleClick">
    <slot />
  </button>
</template>
