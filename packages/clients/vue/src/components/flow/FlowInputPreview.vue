<script setup lang="ts">
import { computed } from "vue";
import { useFlowInputContext } from "./useFlowContext";

const input = useFlowInputContext();

const isFile = computed(() => input.value instanceof File);
const isUrl = computed(
  () => typeof input.value === "string" && (input.value as string).length > 0,
);

const clear = () => {
  input.setValue(undefined);
};

/**
 * Slot props provided to the default slot.
 */
export interface FlowInputPreviewSlotProps {
  /** Current value */
  value: unknown;
  /** Whether value is a File */
  isFile: boolean;
  /** Whether value is a URL string */
  isUrl: boolean;
  /** File name (if value is File) */
  fileName: string | null;
  /** File size in bytes (if value is File) */
  fileSize: number | null;
  /** Clear the input value */
  clear: () => void;
}

const slotProps = computed<FlowInputPreviewSlotProps>(() => ({
  value: input.value,
  isFile: isFile.value,
  isUrl: isUrl.value,
  fileName: isFile.value ? (input.value as File).name : null,
  fileSize: isFile.value ? (input.value as File).size : null,
  clear,
}));
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default preview content - only render for File or URL values -->
    <div v-if="slotProps.isFile || slotProps.isUrl" style="display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem; background: #f3f4f6; border-radius: 0.375rem;">
      <div style="flex: 1; min-width: 0;">
        <p v-if="slotProps.isFile" style="margin: 0; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          {{ slotProps.fileName }}
          <span v-if="slotProps.fileSize" style="color: #6b7280; margin-left: 0.25rem;">
            ({{ (slotProps.fileSize / 1024).toFixed(1) }} KB)
          </span>
        </p>
        <p v-else-if="slotProps.isUrl" style="margin: 0; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          {{ slotProps.value }}
        </p>
      </div>
      <button
        type="button"
        @click="clear"
        style="padding: 0.25rem 0.5rem; background: transparent; border: none; cursor: pointer; color: #6b7280;"
        aria-label="Clear"
      >
        &times;
      </button>
    </div>
  </slot>
</template>
