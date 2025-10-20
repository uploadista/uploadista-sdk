<script setup lang="ts">
import type { UploadistaEvent } from "@uploadista/client-browser";
import { UploadistaProvider } from "@uploadista/vue";
import { ref, watch } from "vue";
import BasicUploadExample from "./components/BasicUploadExample.vue";
import DragDropUploadExample from "./components/DragDropUploadExample.vue";
import FlowUploadExample from "./components/FlowUploadExample.vue";
import MultiUploadExample from "./components/MultiUploadExample.vue";
import Card from "./components/ui/Card.vue";

type TabId = "basic" | "flow" | "multi" | "dragdrop";

const serverUrl = ref("http://localhost:3000");
const activeTab = ref<TabId>("basic");
const providerKey = ref(0);

watch(serverUrl, () => {
  providerKey.value += 1;
});

const tabs = [
  {
    id: "basic",
    label: "Basic Upload",
    description: "Single file upload with progress tracking",
    icon: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6h.1a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12",
  },
  {
    id: "flow",
    label: "Flow Upload",
    description: "Flow orchestration with WebSocket events",
    icon: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z",
  },
  {
    id: "multi",
    label: "Multi Upload",
    description: "Concurrent uploads and batch operations",
    icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  },
  {
    id: "dragdrop",
    label: "Drag & Drop",
    description: "Dropzone interface with auto uploads",
    icon: "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122",
  },
] as const satisfies readonly {
  id: TabId;
  label: string;
  description: string;
  icon: string;
}[];

const handleEvent = (event: UploadistaEvent) => {
  console.log("Global upload event:", event);
};
</script>

<template>
  <UploadistaProvider
    :key="providerKey"
    :server-url="serverUrl"
    storage-id="local"
    uploadista-base-path="uploadista"
    :chunk-size="1024 * 1024"
    :store-fingerprint-for-resuming="true"
    @event="handleEvent"
  >
    <div class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      <header class="relative overflow-hidden bg-white border-b border-gray-200">
        <div class="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-tertiary opacity-5" />
        <div class="relative mx-auto flex max-w-7xl flex-col items-center px-6 py-12 text-center">
          <h1 class="mb-4 bg-gradient-to-r from-primary via-primary to-tertiary bg-clip-text text-5xl font-bold text-transparent">
            Uploadista Vue Client
          </h1>
          <p class="text-xl text-gray-600 max-w-2xl">
            Interactive playground for Uploadista&apos;s Vue composables and components.
            Connect to your local server, try different flows, and inspect results live.
          </p>
        </div>
      </header>

      <main class="mx-auto flex max-w-7xl flex-col gap-12 px-6 py-12">
        <Card class="p-6">
          <div class="flex flex-col gap-4">
            <label
              class="text-xs font-semibold uppercase tracking-wide text-gray-600"
              for="server-url-input"
            >
              Server URL
            </label>
            <input
              id="server-url-input"
              v-model="serverUrl"
              type="text"
              placeholder="http://localhost:3000"
              class="w-full rounded-xl border-2 border-gray-200 px-4 py-3 text-base font-medium text-gray-800 outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
            <p class="flex items-center gap-2 text-sm text-gray-500">
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Express &amp; Hono examples default to
              <code class="rounded-md bg-gray-100 px-2 py-1 text-xs font-mono">http://localhost:3000</code>
            </p>
          </div>
        </Card>

        <section class="space-y-8">
          <nav class="flex flex-wrap gap-3">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="flex min-w-[160px] flex-1 flex-col gap-2 rounded-xl border px-6 py-4 text-left transition-all duration-300"
              :class="[
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/40 scale-[1.02]'
                  : 'bg-white text-gray-700 hover:text-indigo-600 hover:shadow-md border-gray-200',
              ]"
              @click="activeTab = tab.id"
            >
              <span class="flex items-center gap-3 text-base font-semibold">
                <svg
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path :d="tab.icon" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" />
                </svg>
                {{ tab.label }}
              </span>
              <span class="text-xs text-current/80">{{ tab.description }}</span>
            </button>
          </nav>

          <div class="min-h-[520px]">
            <BasicUploadExample v-if="activeTab === 'basic'" />
            <FlowUploadExample v-else-if="activeTab === 'flow'" />
            <MultiUploadExample v-else-if="activeTab === 'multi'" />
            <DragDropUploadExample v-else />
          </div>
        </section>
      </main>

      <footer class="border-t border-gray-200 mt-12">
        <div class="mx-auto flex max-w-7xl items-center justify-center gap-2 px-6 py-8 text-sm text-gray-600">
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Start the Express or Hono examples with
          <code class="rounded-md bg-gray-100 px-2 py-1 text-xs font-mono">pnpm dev</code>
          in
          <code class="rounded-md bg-gray-100 px-2 py-1 text-xs font-mono">examples/express-server</code>
          or
          <code class="rounded-md bg-gray-100 px-2 py-1 text-xs font-mono">examples/hono-server</code>
          before testing.
        </div>
      </footer>
    </div>
  </UploadistaProvider>
</template>
