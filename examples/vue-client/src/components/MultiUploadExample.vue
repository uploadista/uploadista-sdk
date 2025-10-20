<script setup lang="ts">
import { useMultiUpload } from "@uploadista/vue";
import { computed } from "vue";
import FilePreview from "./FilePreview.vue";
import Card from "./ui/Card.vue";

const isBrowserFile = (value: unknown): value is File =>
  typeof File !== "undefined" && value instanceof File;

const multiUpload = useMultiUpload({
  maxConcurrent: 3,
  onUploadStart: (item) => {
    console.log("Upload started:", item.file);
  },
  onUploadSuccess: (item, result) => {
    console.log("Upload complete:", item.file, result);
  },
  onUploadError: (item, error) => {
    console.error("Upload failed:", item.file, error);
  },
  onComplete: (results) => {
    console.log(
      `Batch complete: ${results.successful.length}/${results.total} succeeded`,
    );
  },
});

const failedItems = computed(
  () =>
    multiUpload.items.value.filter((item) =>
      ["error", "aborted"].includes(item.state.status),
    ) ?? [],
);

const handleFileChange = (event: Event) => {
  const files = Array.from((event.target as HTMLInputElement).files || []);
  if (files.length) {
    multiUpload.addFiles(files);
    // Auto-start uploads if nothing active
    if (!multiUpload.state.value.isUploading) {
      multiUpload.startAll();
    }
  }
};
</script>

<template>
  <Card class="p-8 space-y-8">
    <header class="space-y-2">
      <h2 class="text-3xl font-bold text-gray-900">Multiple Uploads</h2>
      <p class="text-gray-600 leading-relaxed">
        Queue multiple files, monitor aggregate progress, and manage retry
        states. Useful for testing chunking, concurrency, and resumable uploads.
      </p>
    </header>

    <section class="space-y-4">
      <label
        class="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide"
        for="multi-upload-input"
      >
        Select Files
      </label>
      <input
        id="multi-upload-input"
        type="file"
        multiple
        class="block w-full text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:to-purple-600 file:text-white file:font-semibold file:cursor-pointer hover:file:from-indigo-700 hover:file:to-purple-700 file:transition-all file:shadow-md border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
        @change="handleFileChange"
      />
    </section>
    <section v-if="multiUpload.items.value.length > 0">


      <div class="grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 md:grid-cols-3 mb-4">
        <div>
          <p class="text-sm font-semibold text-gray-500 mb-1">Total Files</p>
          <p class="text-3xl font-bold text-gray-900">
            {{ multiUpload.state.value.total }}
          </p>
          <p class="text-xs text-gray-500">
            {{ multiUpload.state.value.completed }} completed,
            {{ multiUpload.state.value.uploading }} in progress
          </p>
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-500 mb-1">Progress</p>
          <p class="text-3xl font-bold text-gray-900">
            {{ multiUpload.state.value.progress }}%
          </p>
          <p class="text-xs text-gray-500">
            {{ multiUpload.state.value.totalBytesUploaded?.toLocaleString() ?? 0 }} /
            {{ multiUpload.state.value.totalBytes?.toLocaleString() ?? 0 }} bytes
          </p>
        </div>
        <div>
          <p class="text-sm font-semibold text-gray-500 mb-1">Status</p>
          <p class="text-3xl font-bold text-gray-900">
            {{
              multiUpload.state.value.failed > 0
                ? `${multiUpload.state.value.failed} failed`
                : "Healthy"
            }}
          </p>
          <p class="text-xs text-gray-500">
            {{ multiUpload.state.value.successful }} succeeded
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="multiUpload.state.value.isUploading || !multiUpload.state.value.total"
          @click="multiUpload.startAll"
        >
          Start Uploads
        </button>
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold bg-red-600 text-white shadow-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="!multiUpload.state.value.isUploading"
          @click="multiUpload.abortAll"
        >
          Abort All
        </button>
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold bg-orange-500 text-white shadow-md hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="failedItems.length === 0"
          @click="multiUpload.retryFailed"
        >
          Retry Failed
        </button>
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="multiUpload.state.value.completed === 0"
          @click="multiUpload.clearCompleted"
        >
          Clear Completed
        </button>
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="multiUpload.state.value.total === 0"
          @click="multiUpload.clearAll"
        >
          Reset List
        </button>
      </div>
    </section>

    <section v-if="multiUpload.items.value.length > 0" class="space-y-4">
      <h3 class="text-lg font-semibold text-gray-900">Upload Queue</h3>
      <div class="space-y-4">
        <article
          v-for="item in multiUpload.items.value"
          :key="item.id"
          class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p class="text-base font-semibold text-gray-900">
                {{ isBrowserFile(item.file) ? item.file.name : "Binary Data" }}
              </p>
              <p class="text-xs text-gray-500">
                Status:
                <span class="capitalize">{{ item.state.status }}</span>
              </p>
            </div>
            <div class="flex gap-2">
              <button
                type="button"
                class="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="item.state.status === 'uploading'"
                @click="multiUpload.removeItem(item.id)"
              >
                Remove
              </button>
              <button
                v-if="['error', 'aborted'].includes(item.state.status)"
                type="button"
                class="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 hover:bg-orange-100 transition-all"
                @click="multiUpload.retryUpload(item.id)"
              >
                Retry
              </button>
              <button
                v-if="item.state.status === 'uploading'"
                type="button"
                class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-all"
                @click="multiUpload.abortUpload(item.id)"
              >
                Abort
              </button>
            </div>
          </div>

          <div class="mt-4 space-y-2">
            <div class="flex items-center justify-between text-sm text-gray-600">
              <span>Progress</span>
              <span>{{ item.state.progress }}%</span>
            </div>
            <div class="relative h-2 rounded-full bg-gray-200 overflow-hidden">
              <div
                class="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
                :style="{ width: `${item.state.progress}%` }"
              />
            </div>
          </div>
          <FilePreview
            v-if="item.state.result && isBrowserFile(item.file)"
            :file="item.file"
            :result="item.state.result ?? undefined"
          />
        </article>
      </div>
    
    </section>

    <section v-else class="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
      <p class="text-gray-500">
        Select files to start testing concurrent uploads. Drag &amp; drop also
        works in the drag-and-drop tab.
      </p>
    </section>
  </Card>
</template>
