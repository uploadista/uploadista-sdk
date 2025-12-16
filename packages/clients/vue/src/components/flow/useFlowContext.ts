import { inject } from "vue";
import type { FlowContextValue } from "./Flow.vue";

/**
 * Injection key for the Flow context
 */
export const FLOW_CONTEXT_KEY = "flowContext";

/**
 * Injection key for the FlowInput context
 */
export const FLOW_INPUT_CONTEXT_KEY = "flowInputContext";

/**
 * Context value for a specific input node within a Flow.
 */
export interface FlowInputContextValue {
  /** Input node ID */
  nodeId: string;
  /** Input metadata from flow discovery */
  metadata: {
    nodeId: string;
    nodeName: string;
    nodeDescription: string;
    inputTypeId?: string;
    required: boolean;
  };
  /** Current value for this input */
  value: unknown;
  /** Set the value for this input */
  setValue: (value: unknown) => void;
  /** Per-input execution state (if available) */
  state: {
    status: string;
    progress: number;
    error: Error | null;
  } | undefined;
}

/**
 * Hook to access flow context from within a Flow component.
 * @throws Error if used outside of a Flow component
 */
export function useFlowContext(): FlowContextValue {
  const context = inject<FlowContextValue>(FLOW_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "useFlowContext must be used within a <Flow> component. " +
        'Wrap your component tree with <Flow flowId="..." storageId="...">',
    );
  }
  return context;
}

/**
 * Hook to access flow input context from within a FlowInput component.
 * @throws Error if used outside of a FlowInput component
 */
export function useFlowInputContext(): FlowInputContextValue {
  const context = inject<FlowInputContextValue>(FLOW_INPUT_CONTEXT_KEY);
  if (!context) {
    throw new Error(
      "useFlowInputContext must be used within a <FlowInput> component. " +
        'Wrap your component with <FlowInput nodeId="...">',
    );
  }
  return context;
}
