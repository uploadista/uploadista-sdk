import type {
  FlowEventFlowCancel,
  FlowEventFlowEnd,
  FlowEventFlowError,
  FlowEventFlowPause,
  FlowEventFlowStart,
  FlowEventJobEnd,
  FlowEventJobStart,
  FlowEventNodeEnd,
  FlowEventNodeError,
  FlowEventNodePause,
  FlowEventNodeResume,
  FlowEventNodeStart,
} from "@uploadista/core/flow";
import { EventType } from "@uploadista/core/flow";
import { useEffect } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";
import { isFlowEvent } from "./event-utils";

/**
 * Options for handling flow execution events.
 *
 * All callbacks are optional - only provide handlers for events you care about.
 */
export interface UseFlowEventsOptions {
  /** Called when a job starts execution */
  onJobStart?: (event: FlowEventJobStart) => void;
  /** Called when a job completes (success or failure) */
  onJobEnd?: (event: FlowEventJobEnd) => void;
  /** Called when a flow begins execution */
  onFlowStart?: (event: FlowEventFlowStart) => void;
  /** Called when a flow completes successfully */
  onFlowEnd?: (event: FlowEventFlowEnd) => void;
  /** Called when a flow encounters an error */
  onFlowError?: (event: FlowEventFlowError) => void;
  /** Called when a flow is paused by user request */
  onFlowPause?: (event: FlowEventFlowPause) => void;
  /** Called when a flow is cancelled by user request */
  onFlowCancel?: (event: FlowEventFlowCancel) => void;
  /** Called when a node starts processing */
  onNodeStart?: (event: FlowEventNodeStart) => void;
  /** Called when a node completes successfully */
  onNodeEnd?: (event: FlowEventNodeEnd) => void;
  /** Called when a node pauses (waiting for additional data) */
  onNodePause?: (event: FlowEventNodePause) => void;
  /** Called when a paused node resumes execution */
  onNodeResume?: (event: FlowEventNodeResume) => void;
  /** Called when a node encounters an error */
  onNodeError?: (event: FlowEventNodeError) => void;
}

/**
 * Structured hook for handling flow execution events with type-safe callbacks.
 *
 * This hook provides a clean API for listening to specific flow events without
 * needing to manually filter events or use type guards.
 *
 * Must be used within UploadistaProvider.
 *
 * @param options - Object with optional callbacks for each flow event type
 *
 * @example
 * ```tsx
 * import { useFlowEvents } from '@uploadista/expo';
 * import { View, Text } from 'react-native';
 *
 * function FlowMonitor() {
 *   useFlowEvents({
 *     onFlowStart: (event) => {
 *       console.log('Flow started:', event.flowId);
 *     },
 *     onNodeStart: (event) => {
 *       console.log('Node started:', event.nodeName);
 *     },
 *     onNodeEnd: (event) => {
 *       console.log('Node completed:', event.nodeName, event.result);
 *     },
 *     onFlowEnd: (event) => {
 *       console.log('Flow completed with outputs:', event.outputs);
 *     },
 *     onFlowError: (event) => {
 *       console.error('Flow failed:', event.error);
 *     },
 *   });
 *
 *   return <View><Text>Monitoring flow execution...</Text></View>;
 * }
 * ```
 */
export function useFlowEvents(options: UseFlowEventsOptions): void {
  const { subscribeToEvents } = useUploadistaContext();

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      // Only handle flow events
      if (!isFlowEvent(event)) return;

      // Route to appropriate callback based on event type
      switch (event.eventType) {
        case EventType.JobStart:
          options.onJobStart?.(event);
          break;
        case EventType.JobEnd:
          options.onJobEnd?.(event);
          break;
        case EventType.FlowStart:
          options.onFlowStart?.(event);
          break;
        case EventType.FlowEnd:
          options.onFlowEnd?.(event);
          break;
        case EventType.FlowError:
          options.onFlowError?.(event);
          break;
        case EventType.FlowPause:
          options.onFlowPause?.(event);
          break;
        case EventType.FlowCancel:
          options.onFlowCancel?.(event);
          break;
        case EventType.NodeStart:
          options.onNodeStart?.(event);
          break;
        case EventType.NodeEnd:
          options.onNodeEnd?.(event);
          break;
        case EventType.NodePause:
          options.onNodePause?.(event);
          break;
        case EventType.NodeResume:
          options.onNodeResume?.(event);
          break;
        case EventType.NodeError:
          options.onNodeError?.(event);
          break;
      }
    });

    return unsubscribe;
  }, [subscribeToEvents, options]);
}
