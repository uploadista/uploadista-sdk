<script setup lang="ts">
import { computed, provide } from "vue";
import { useFlowContext, FLOW_INPUT_CONTEXT_KEY, type FlowInputContextValue } from "./useFlowContext";

/**
 * Props for FlowInput component.
 */
export interface FlowInputProps {
  /** Input node ID */
  nodeId: string;
}

const props = defineProps<FlowInputProps>();
const flow = useFlowContext();

// Find metadata for this input
const metadata = computed(() =>
  flow.inputMetadata.value?.find((m) => m.nodeId === props.nodeId)
);

// Get current value for this input
const value = computed(() => flow.inputs.value[props.nodeId]);

// Get execution state for this input
const inputState = computed(() => flow.inputStates.value.get(props.nodeId));

// Create setValue function scoped to this input
const setValue = (newValue: unknown) => {
  flow.setInput(props.nodeId, newValue);
};

// Create a context object with getters that access computed refs
// This ensures reactivity works while also providing stable function references
const contextValue: FlowInputContextValue = {
  get nodeId() {
    return props.nodeId;
  },
  get metadata() {
    return metadata.value ?? {
      nodeId: props.nodeId,
      nodeName: "",
      nodeDescription: "",
      required: false,
    };
  },
  get value() {
    return value.value;
  },
  setValue,
  get state() {
    return inputState.value;
  },
};

// Provide context for child components (FlowInputDropZone, etc.)
provide(FLOW_INPUT_CONTEXT_KEY, contextValue);

/**
 * Slot props provided to the default slot.
 */
export interface FlowInputSlotProps {
  /** Input node ID */
  nodeId: string;
  /** Input metadata from flow discovery */
  metadata: FlowInputContextValue["metadata"] | undefined;
  /** Current value for this input */
  value: unknown;
  /** Set the value for this input */
  setValue: (value: unknown) => void;
  /** Per-input execution state (if available) */
  state: FlowInputContextValue["state"];
}

const slotProps = computed<FlowInputSlotProps>(() => ({
  nodeId: props.nodeId,
  metadata: metadata.value,
  value: value.value,
  setValue,
  state: inputState.value,
}));
</script>

<template>
  <!-- Only render if metadata is found -->
  <slot v-if="metadata" v-bind="slotProps" />
</template>
