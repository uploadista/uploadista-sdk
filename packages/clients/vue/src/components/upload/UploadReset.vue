<script setup lang="ts">
import { inject } from "vue";
import type { UploadContextValue } from "./Upload.vue";
import { UPLOAD_CONTEXT_KEY } from "./useUploadContext";

const uploadContext = inject<{ value: UploadContextValue }>(UPLOAD_CONTEXT_KEY);
if (!uploadContext) {
  throw new Error("UploadReset must be used within an <Upload> component.");
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
