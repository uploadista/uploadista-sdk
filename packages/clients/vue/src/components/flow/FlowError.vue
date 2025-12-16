<script setup lang="ts">
import { computed } from "vue";
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

/**
 * Slot props provided to the default slot.
 */
export interface FlowErrorSlotProps {
  /** Error object (null if no error) */
  error: Error | null;
  /** Whether there is an error */
  hasError: boolean;
  /** Error message */
  message: string | null;
  /** Reset the flow */
  reset: () => void;
}

const slotProps = computed<FlowErrorSlotProps>(() => ({
  error: flow.state.value.error,
  hasError: flow.state.value.status === "error",
  message: flow.state.value.error?.message ?? null,
  reset: flow.reset,
}));
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default error display -->
    <div
      v-if="slotProps.hasError"
      style="padding: 1rem; background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.5rem; color: #dc2626;"
    >
      <p style="margin: 0; font-weight: 600;">Error</p>
      <p style="margin: 0.25rem 0 0; font-size: 0.875rem;">{{ slotProps.message }}</p>
      <button
        type="button"
        @click="slotProps.reset"
        style="margin-top: 0.75rem; padding: 0.5rem 1rem; background: #dc2626; color: white; border: none; border-radius: 0.375rem; cursor: pointer;"
      >
        Try Again
      </button>
    </div>
  </slot>
</template>
