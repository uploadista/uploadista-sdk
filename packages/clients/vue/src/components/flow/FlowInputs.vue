<script setup lang="ts">
import { computed } from "vue";
import type { FlowInputMetadata } from "../../composables/useFlow";
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

/**
 * Slot props provided to the default slot.
 */
export interface FlowInputsSlotProps {
  /** Discovered input metadata */
  inputs: FlowInputMetadata[];
  /** Whether inputs are still being discovered */
  isLoading: boolean;
}

const slotProps = computed<FlowInputsSlotProps>(() => ({
  inputs: flow.inputMetadata.value ?? [],
  isLoading: flow.isDiscoveringInputs.value,
}));
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default loading state if no slot provided -->
    <div v-if="slotProps.isLoading" style="padding: 1rem; text-align: center;">
      Discovering flow inputs...
    </div>
    <div v-else-if="slotProps.inputs.length === 0" style="padding: 1rem; text-align: center; color: #6b7280;">
      No inputs found for this flow.
    </div>
  </slot>
</template>
