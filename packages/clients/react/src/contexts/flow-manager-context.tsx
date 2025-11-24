import type {
  BrowserUploadInput,
  FlowUploadOptions,
  UploadistaEvent,
} from "@uploadista/client-browser";
import {
  FlowManager,
  type FlowManagerCallbacks,
} from "@uploadista/client-core";
import { EventType, type FlowEvent } from "@uploadista/core/flow";
import { UploadEventType } from "@uploadista/core/types";
import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
} from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

/**
 * Type guard to check if an event is a flow event
 */
function isFlowEvent(event: UploadistaEvent): event is FlowEvent {
  const flowEvent = event as FlowEvent;
  return (
    flowEvent.eventType === EventType.FlowStart ||
    flowEvent.eventType === EventType.FlowEnd ||
    flowEvent.eventType === EventType.FlowError ||
    flowEvent.eventType === EventType.NodeStart ||
    flowEvent.eventType === EventType.NodeEnd ||
    flowEvent.eventType === EventType.NodePause ||
    flowEvent.eventType === EventType.NodeResume ||
    flowEvent.eventType === EventType.NodeError
  );
}

/**
 * Internal manager registry entry with ref counting
 */
interface ManagerEntry {
  manager: FlowManager<unknown>;
  refCount: number;
  flowId: string;
}

/**
 * Context value providing access to flow managers
 */
interface FlowManagerContextValue {
  /**
   * Get or create a flow manager for the given flow ID.
   * Increments ref count - must call releaseManager when done.
   *
   * @param flowId - Unique identifier for the flow
   * @param callbacks - Callbacks for state changes and lifecycle events
   * @param options - Flow configuration options
   * @returns FlowManager instance
   */
  getManager: (
    flowId: string,
    callbacks: FlowManagerCallbacks,
    options: FlowUploadOptions,
  ) => FlowManager<unknown>;

  /**
   * Release a flow manager reference.
   * Decrements ref count and cleans up when reaching zero.
   *
   * @param flowId - Unique identifier for the flow to release
   */
  releaseManager: (flowId: string) => void;
}

const FlowManagerContext = createContext<FlowManagerContextValue | undefined>(
  undefined,
);

/**
 * Props for FlowManagerProvider
 */
interface FlowManagerProviderProps {
  children: ReactNode;
}

/**
 * Provider that manages FlowManager instances with ref counting and event routing.
 * Ensures managers persist across component re-renders and are only cleaned up
 * when all consuming components unmount.
 *
 * This provider should be nested inside UploadistaProvider to access the upload client
 * and event subscription system.
 *
 * @example
 * ```tsx
 * <UploadistaProvider baseUrl="https://api.example.com" storageId="default">
 *   <FlowManagerProvider>
 *     <App />
 *   </FlowManagerProvider>
 * </UploadistaProvider>
 * ```
 */
export function FlowManagerProvider({ children }: FlowManagerProviderProps) {
  const { client, subscribeToEvents } = useUploadistaContext();
  const managersRef = useRef(new Map<string, ManagerEntry>());

  // Subscribe to all events and route to appropriate managers
  useEffect(() => {
    const unsubscribe = subscribeToEvents((event: UploadistaEvent) => {
      // Route flow events to all managers (they filter by jobId internally)
      if (isFlowEvent(event)) {
        for (const entry of managersRef.current.values()) {
          entry.manager.handleFlowEvent(event);
        }
        return;
      }

      // Route upload progress events to all managers
      if (
        "type" in event &&
        event.type === UploadEventType.UPLOAD_PROGRESS &&
        "data" in event
      ) {
        const uploadEvent = event;

        for (const entry of managersRef.current.values()) {
          entry.manager.handleUploadProgress(
            uploadEvent.data.id,
            uploadEvent.data.progress,
            uploadEvent.data.total,
          );
        }
      }
    });

    return unsubscribe;
  }, [subscribeToEvents]);

  const getManager = useCallback(
    (
      flowId: string,
      callbacks: FlowManagerCallbacks,
      options: FlowUploadOptions,
    ): FlowManager<unknown> => {
      const existing = managersRef.current.get(flowId);

      if (existing) {
        // Increment ref count for existing manager
        existing.refCount++;
        return existing.manager;
      }

      const manager = new FlowManager<BrowserUploadInput>(
        client.uploadWithFlow,
        callbacks,
        options,
        client.multiInputFlowUpload,
      );

      managersRef.current.set(flowId, {
        manager,
        refCount: 1,
        flowId,
      });

      return manager;
    },
    [client],
  );

  const releaseManager = useCallback((flowId: string) => {
    const existing = managersRef.current.get(flowId);
    if (!existing) return;

    existing.refCount--;

    // Clean up when no more refs
    if (existing.refCount <= 0) {
      existing.manager.cleanup();
      managersRef.current.delete(flowId);
    }
  }, []);

  return (
    <FlowManagerContext.Provider value={{ getManager, releaseManager }}>
      {children}
    </FlowManagerContext.Provider>
  );
}

/**
 * Hook to access the FlowManager context.
 * Must be used within a FlowManagerProvider.
 *
 * @returns FlowManager context value with getManager and releaseManager functions
 * @throws Error if used outside of FlowManagerProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { getManager, releaseManager } = useFlowManagerContext();
 *   // Use to create managers...
 * }
 * ```
 */
export function useFlowManagerContext(): FlowManagerContextValue {
  const context = useContext(FlowManagerContext);

  if (context === undefined) {
    throw new Error(
      "useFlowManagerContext must be used within a FlowManagerProvider. " +
        "Make sure to wrap your component tree with <FlowManagerProvider>.",
    );
  }

  return context;
}
