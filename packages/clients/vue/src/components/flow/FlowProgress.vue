<script setup lang="ts">
import type { FlowUploadStatus } from "@uploadista/client-core";
import { computed } from "vue";
import { useFlowContext } from "./useFlowContext";

const flow = useFlowContext();

/**
 * Slot props provided to the default slot.
 */
export interface FlowProgressSlotProps {
  /** Progress percentage (0-100) */
  progress: number;
  /** Bytes uploaded so far */
  bytesUploaded: number;
  /** Total bytes to upload (null if unknown) */
  totalBytes: number | null;
  /** Current status */
  status: FlowUploadStatus;
}

const slotProps = computed<FlowProgressSlotProps>(() => ({
  progress: flow.state.value.progress,
  bytesUploaded: flow.state.value.bytesUploaded,
  totalBytes: flow.state.value.totalBytes,
  status: flow.state.value.status,
}));
</script>

<template>
  <slot v-bind="slotProps">
    <!-- Default progress display -->
    <div v-if="slotProps.status === 'uploading' || slotProps.status === 'processing'" style="width: 100%;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem; font-size: 0.875rem;">
        <span>{{ slotProps.status === 'uploading' ? 'Uploading' : 'Processing' }}</span>
        <span>{{ slotProps.progress.toFixed(1) }}%</span>
      </div>
      <div style="width: 100%; height: 0.5rem; background: #e5e7eb; border-radius: 0.25rem; overflow: hidden;">
        <div
          :style="{
            width: `${slotProps.progress}%`,
            height: '100%',
            background: '#3b82f6',
            transition: 'width 0.2s ease',
          }"
        />
      </div>
      <div v-if="slotProps.totalBytes" style="margin-top: 0.25rem; font-size: 0.75rem; color: #6b7280;">
        {{ (slotProps.bytesUploaded / 1024).toFixed(0) }} KB / {{ (slotProps.totalBytes / 1024).toFixed(0) }} KB
      </div>
    </div>
  </slot>
</template>
