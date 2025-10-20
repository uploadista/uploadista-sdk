<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "../../utils/cn";

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    "text-xs font-semibold uppercase tracking-wide text-gray-600",
    (attrs as Record<string, unknown> & { class?: unknown }).class as
      | string
      | undefined,
  ),
);

const passthroughAttrs = computed(() => {
  const { class: _class, ...rest } = attrs as Record<string, unknown> & {
    class?: unknown;
  };
  return rest;
});
</script>

<template>
  <label v-bind="passthroughAttrs" :class="classes">
    <slot />
  </label>
</template>
