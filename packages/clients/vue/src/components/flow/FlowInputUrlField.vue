<script setup lang="ts">
import { computed } from "vue";
import { useFlowInputContext } from "./useFlowContext";

/**
 * Props for FlowInputUrlField component.
 */
export interface FlowInputUrlFieldProps {
  /** Placeholder text */
  placeholder?: string;
}

const props = withDefaults(defineProps<FlowInputUrlFieldProps>(), {
  placeholder: "https://example.com/file",
});

const input = useFlowInputContext();

// Check if value is a URL string
const isUrl = computed(() => typeof input.value === "string");
const urlValue = computed(() => (isUrl.value ? (input.value as string) : ""));

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  input.setValue(target.value);
};
</script>

<template>
  <input
    type="url"
    :value="urlValue"
    @input="handleInput"
    :placeholder="placeholder"
    v-bind="$attrs"
  />
</template>

<script lang="ts">
// Disable attribute inheritance so we can spread them manually
export default {
  inheritAttrs: false,
};
</script>
