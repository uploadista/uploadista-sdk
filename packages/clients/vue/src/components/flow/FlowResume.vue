<script setup lang="ts">
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

const handleClick = () => {
  flow.resume();
};
</script>

<template>
  <button
    type="button"
    @click="handleClick"
    v-bind="$attrs"
  >
    <slot>Resume</slot>
  </button>
</template>

<script lang="ts">
// Disable attribute inheritance so we can spread them manually
export default {
  inheritAttrs: false,
};
</script>
