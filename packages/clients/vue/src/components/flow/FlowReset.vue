<script setup lang="ts">
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

const handleClick = () => {
  flow.reset();
};
</script>

<template>
  <button
    type="button"
    @click="handleClick"
    v-bind="$attrs"
  >
    <slot>Reset</slot>
  </button>
</template>

<script lang="ts">
// Disable attribute inheritance so we can spread them manually
export default {
  inheritAttrs: false,
};
</script>
