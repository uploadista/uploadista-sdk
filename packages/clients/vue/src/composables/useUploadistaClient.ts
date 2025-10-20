import type { UploadistaEvent } from "@uploadista/client-browser";
import { inject, type Ref } from "vue";
import {
  UPLOADISTA_CLIENT_KEY,
  UPLOADISTA_EVENT_SUBSCRIBERS_KEY,
} from "./plugin";

/**
 * Access the Uploadista client instance from the plugin or provider.
 * Must be used within a component tree that has the Uploadista plugin or provider installed.
 *
 * @returns Uploadista client instance with event subscription
 * @throws Error if used outside of Uploadista plugin/provider context
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUploadistaClient } from '@uploadista/vue';
 *
 * const { client, subscribeToEvents } = useUploadistaClient();
 *
 * // Subscribe to all events
 * const unsubscribe = subscribeToEvents((event) => {
 *   console.log('Upload event:', event);
 * });
 *
 * // Clean up on unmount
 * onUnmounted(() => {
 *   unsubscribe();
 * });
 * </script>
 * ```
 */
export function useUploadistaClient() {
  const client = inject(UPLOADISTA_CLIENT_KEY);

  if (!client) {
    throw new Error(
      "useUploadistaClient must be used within a component tree that has the Uploadista plugin or provider installed. " +
        "Make sure to either use app.use(createUploadistaPlugin({ ... })) in your main app file, " +
        "or wrap your component tree with <UploadistaProvider>.",
    );
  }

  // Try to get the shared event subscribers from the provider
  const eventSubscribersRef = inject<
    Ref<Set<(event: UploadistaEvent) => void>> | undefined
  >(UPLOADISTA_EVENT_SUBSCRIBERS_KEY);

  const subscribeToEvents = (handler: (event: UploadistaEvent) => void) => {
    if (!eventSubscribersRef) {
      console.warn(
        "subscribeToEvents called but no event subscribers provided. Events will not be dispatched. " +
          "Make sure to use UploadistaProvider or createUploadistaPlugin with proper configuration.",
      );
      return () => {
        // No-op unsubscribe if subscribers aren't available
      };
    }

    eventSubscribersRef.value.add(handler);
    return () => {
      eventSubscribersRef.value.delete(handler);
    };
  };

  return {
    client,
    subscribeToEvents,
  };
}

export type UseUploadistaClientReturn = ReturnType<typeof useUploadistaClient>;
