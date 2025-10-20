<script setup lang="ts">
import { computed, useAttrs } from "vue";
import { cn } from "../../utils/cn";

interface SelectOption {
  label: string;
  value: string;
}

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    options?: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: undefined,
    options: () => [],
    placeholder: undefined,
    disabled: false,
  },
);

const emit = defineEmits<{
  (event: "update:modelValue", value: string): void;
  (event: "change", value: string): void;
}>();

const attrs = useAttrs();

const classes = computed(() =>
  cn(
    "w-full rounded-xl border-2 border-gray-200 bg-white px-4 py-3 text-base font-medium text-gray-800 transition-all focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60",
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

const handleChange = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  emit("update:modelValue", value);
  emit("change", value);
};
</script>

<template>
  <select
    v-bind="passthroughAttrs"
    :value="modelValue"
    :disabled="disabled"
    :class="classes"
    @change="handleChange"
  >
    <option v-if="placeholder && !modelValue" value="" disabled>
      {{ placeholder }}
    </option>
    <template v-if="options && options.length">
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </template>
    <slot />
  </select>
</template>
