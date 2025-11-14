import type { UploadistaEvent } from "@uploadista/client-browser";
import { useEffect } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";

/**
 * Simple hook that subscribes to all Uploadista events (both flow and upload events).
 *
 * This is a low-level hook that provides access to all events. For more structured
 * event handling, consider using `useFlowEvents` or `useUploadEvents` instead.
 *
 * Must be used within UploadistaProvider.
 *
 * @param callback - Function called for every event emitted by the Uploadista client
 *
 * @example
 * ```tsx
 * import { useUploadistaEvents, isFlowEvent, isUploadEvent } from '@uploadista/expo';
 *
 * function MyComponent() {
 *   useUploadistaEvents((event) => {
 *     if (isFlowEvent(event)) {
 *       console.log('Flow event:', event.eventType);
 *     } else if (isUploadEvent(event)) {
 *       console.log('Upload event:', event.type);
 *     }
 *   });
 *
 *   return <View><Text>Listening to all events...</Text></View>;
 * }
 * ```
 */
export function useUploadistaEvents(
  callback: (event: UploadistaEvent) => void,
): void {
  const { subscribeToEvents } = useUploadistaContext();

  useEffect(() => {
    const unsubscribe = subscribeToEvents(callback);
    return unsubscribe;
  }, [subscribeToEvents, callback]);
}
