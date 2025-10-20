import {
  createUploadistaClient,
  type UploadistaClientOptions,
  type UploadistaEvent,
} from "@uploadista/client-browser";
import type { App, InjectionKey, Ref } from "vue";
import { ref } from "vue";

export interface UploadistaPluginOptions extends UploadistaClientOptions {
  /**
   * Global event handler for all upload and flow events from this client
   */
  onEvent?: UploadistaClientOptions["onEvent"];
}

export const UPLOADISTA_CLIENT_KEY: InjectionKey<
  ReturnType<typeof createUploadistaClient>
> = Symbol("uploadista-client");

export const UPLOADISTA_EVENT_SUBSCRIBERS_KEY: InjectionKey<
  Ref<Set<(event: UploadistaEvent) => void>>
> = Symbol("uploadista-event-subscribers");

/**
 * Vue plugin for providing Uploadista client instance globally.
 * Uses Vue's provide/inject pattern to make the client available
 * throughout the component tree.
 *
 * @param options - Uploadista client configuration options
 * @returns Vue plugin object
 *
 * @example
 * ```typescript
 * import { createApp } from 'vue';
 * import { createUploadistaPlugin } from '@uploadista/vue';
 * import App from './App.vue';
 *
 * const app = createApp(App);
 *
 * app.use(createUploadistaPlugin({
 *   baseUrl: 'https://api.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 1024 * 1024, // 1MB
 *   storeFingerprintForResuming: true,
 *   onEvent: (event) => {
 *     console.log('Upload event:', event);
 *   }
 * }));
 *
 * app.mount('#app');
 * ```
 */
export function createUploadistaPlugin(options: UploadistaPluginOptions) {
  return {
    install(app: App) {
      // Create a shared set of event subscribers
      const eventSubscribers = ref(new Set<(event: UploadistaEvent) => void>());

      const client = createUploadistaClient({
        ...options,
        onEvent: (event) => {
          // Dispatch to all subscribers registered via subscribeToEvents
          eventSubscribers.value.forEach((subscriber) => {
            subscriber(event);
          });

          // Call the original onEvent handler if provided
          options.onEvent?.(event);
        },
      });

      app.provide(UPLOADISTA_CLIENT_KEY, client);
      app.provide(UPLOADISTA_EVENT_SUBSCRIBERS_KEY, eventSubscribers);
    },
  };
}
