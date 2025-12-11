<script setup lang="ts">
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

const handleClick = () => {
  flow.execute();
};
</script>

<template>
  <button
    type="button"
    @click="handleClick"
    :disabled="flow.isUploading.value"
    v-bind="$attrs"
  >
    <slot>Execute</slot>
  </button>
</template>

<script lang="ts">
// Disable attribute inheritance so we can spread them manually
export default {
  inheritAttrs: false,
};
</script>
