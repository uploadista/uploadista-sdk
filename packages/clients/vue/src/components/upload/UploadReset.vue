<script setup lang="ts">
import { inject } from "vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";
import type { UploadContextValue } from "./Upload.vue";

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error(
    "UploadReset must be used within an <Upload> component.",
  );
}

const handleClick = () => {
  uploadContext.value.clearAll();
};
</script>

<template>
  <button type="button" @click="handleClick">
    <slot />
  </button>
</template>
