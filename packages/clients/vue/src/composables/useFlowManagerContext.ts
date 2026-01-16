import type {
  FlowManager,
  FlowManagerCallbacks,
  FlowUploadOptions,
} from "@uploadista/client-core";
import { inject } from "vue";

/**
 * Context value providing access to flow managers
 */
interface FlowManagerContextValue {
  getManager: (
    flowId: string,
    callbacks: FlowManagerCallbacks,
    options: FlowUploadOptions,
  ) => FlowManager<unknown>;
  releaseManager: (flowId: string) => void;
}

/**
 * Composable to access the FlowManager context.
 * Must be used within a FlowManagerProvider.
 *
 * @returns FlowManager context value with getManager and releaseManager functions
 * @throws Error if used outside of FlowManagerProvider
 *
 * @example
 * ```ts
 * function setup() {
 *   const { getManager, releaseManager } = useFlowManagerContext();
 *   // Use to create managers...
 * }
 * ```
 */
export function useFlowManagerContext(): FlowManagerContextValue {
  const context = inject<FlowManagerContextValue>("flowManagerContext");

  if (!context) {
    throw new Error(
      "useFlowManagerContext must be used within a FlowManagerProvider. " +
        "Make sure to wrap your component tree with <FlowManagerProvider>.",
    );
  }

  return context;
}
