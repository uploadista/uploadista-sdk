<script setup lang="ts">
import {
  createUploadistaClient,
  type UploadistaEvent,
} from "@uploadista/client-browser";
import { onBeforeUnmount, provide, ref } from "vue";
import {
  UPLOADISTA_CLIENT_KEY,
  UPLOADISTA_EVENT_SUBSCRIBERS_KEY,
} from "../composables/plugin";
import FlowManagerProvider from "./FlowManagerProvider.vue";

const props = withDefaults(
  defineProps<{
    serverUrl: string;
    storageId?: string;
    uploadistaBasePath?: string;
    chunkSize?: number;
    parallelUploads?: number;
    storeFingerprintForResuming?: boolean;
  }>(),
  {
    storageId: "local",
    uploadistaBasePath: "uploadista",
    chunkSize: 1024 * 1024,
    parallelUploads: 1,
    storeFingerprintForResuming: true,
  },
);

// Create a shared set of event subscribers
const eventSubscribers = ref(new Set<(event: UploadistaEvent) => void>());

const client = createUploadistaClient({
  baseUrl: props.serverUrl,
  storageId: props.storageId,
  uploadistaBasePath: props.uploadistaBasePath,
  chunkSize: props.chunkSize,
  parallelUploads: props.parallelUploads,
  storeFingerprintForResuming: props.storeFingerprintForResuming,
  onEvent: (event) => {
    // Dispatch to all subscribers registered via subscribeToEvents
    eventSubscribers.value.forEach((subscriber) => {
      try {
        subscriber(event);
      } catch (err) {
        console.error("Error in event subscriber:", err);
      }
    });
  },
});

provide(UPLOADISTA_CLIENT_KEY, client);
provide(UPLOADISTA_EVENT_SUBSCRIBERS_KEY, eventSubscribers);

onBeforeUnmount(() => {
  client.closeAllWebSockets();
});
</script>

<template>
  <FlowManagerProvider>
    <slot />
  </FlowManagerProvider>
</template>
