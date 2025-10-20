<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "../../utils/cn";

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    "bg-card text-card-foreground flex flex-col gap-6 rounded-xl border py-6 shadow-sm",
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
  <div v-bind="passthroughAttrs" :class="classes">
    <slot />
  </div>
</template>
