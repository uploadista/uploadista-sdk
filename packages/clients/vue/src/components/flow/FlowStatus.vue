<script setup lang="ts">
import { computed } from "vue";
import type { FlowUploadStatus } from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

/**
 * Slot props provided to the default slot.
 */
export interface FlowStatusSlotProps {
  /** Current status */
  status: FlowUploadStatus;
  /** Current node being processed (if any) */
  currentNodeName: string | null;
  /** Current node type (if any) */
  currentNodeType: string | null;
  /** Error (if status is error) */
  error: Error | null;
  /** Job ID (if started) */
  jobId: string | null;
  /** Whether flow has started */
  flowStarted: boolean;
  /** Flow outputs (if completed) */
  flowOutputs: TypedOutput[] | null;
}

const slotProps = computed<FlowStatusSlotProps>(() => ({
  status: flow.state.value.status,
  currentNodeName: flow.state.value.currentNodeName,
  currentNodeType: flow.state.value.currentNodeType,
  error: flow.state.value.error,
  jobId: flow.state.value.jobId,
  flowStarted: flow.state.value.flowStarted,
  flowOutputs: flow.state.value.flowOutputs,
}));
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default status display - only show when not idle -->
    <div v-if="slotProps.status !== 'idle'" style="padding: 0.5rem;">
      <p style="margin: 0; font-size: 0.875rem; color: #6b7280;">
        Status: <strong>{{ slotProps.status }}</strong>
      </p>
      <p v-if="slotProps.currentNodeName" style="margin: 0.25rem 0 0; font-size: 0.75rem; color: #9ca3af;">
        Processing: {{ slotProps.currentNodeName }}
      </p>
      <p v-if="slotProps.jobId" style="margin: 0.25rem 0 0; font-size: 0.75rem; color: #9ca3af;">
        Job ID: {{ slotProps.jobId }}
      </p>
    </div>
  </slot>
</template>
