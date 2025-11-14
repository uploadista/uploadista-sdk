import type { UploadistaEvent } from "@uploadista/client-browser";
import { onBeforeUnmount, onMounted } from "vue";
import { useUploadistaClient } from "./useUploadistaClient";

/**
 * Simple composable that subscribes to all Uploadista events (both flow and upload events).
 *
 * This is a low-level composable that provides access to all events. For more structured
 * event handling, consider using `useFlowEvents` or `useUploadEvents` instead.
 *
 * Must be used within UploadistaProvider.
 *
 * @param callback - Function called for every event emitted by the Uploadista client
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUploadistaEvents, isFlowEvent, isUploadEvent } from '@uploadista/vue';
 *
 * useUploadistaEvents((event) => {
 *   if (isFlowEvent(event)) {
 *     console.log('Flow event:', event.eventType);
 *   } else if (isUploadEvent(event)) {
 *     console.log('Upload event:', event.type);
 *   }
 * });
 * </script>
 *
 * <template>
 *   <div>Listening to all events...</div>
 * </template>
 * ```
 */
export function useUploadistaEvents(
  callback: (event: UploadistaEvent) => void,
): void {
  const { subscribeToEvents } = useUploadistaClient();
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    unsubscribe = subscribeToEvents(callback);
  });

  onBeforeUnmount(() => {
    unsubscribe?.();
  });
}
