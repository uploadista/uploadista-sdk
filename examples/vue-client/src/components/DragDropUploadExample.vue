<script setup lang="ts">
import { useDragDrop, useMultiUpload } from "@uploadista/vue";
import { computed, ref } from "vue";
import FilePreview from "./FilePreview.vue";
import Card from "./ui/Card.vue";

const errors = ref<string[]>([]);
const inputRef = ref<HTMLInputElement | null>(null);

const multiUpload = useMultiUpload({
  maxConcurrent: 3,
  onUploadSuccess: (item) => {
    console.log("Drag/drop upload complete:", item.file);
  },
  onUploadError: (item, error) => {
    console.error("Drag/drop upload failed:", item.file, error);
  },
});

const dragDrop = useDragDrop({
  accept: ["image/*", "video/*", ".pdf"],
  maxFiles: 8,
  multiple: true,
  onFilesReceived: (files) => {
    errors.value = [];
    multiUpload.addFiles(files);
    if (!multiUpload.state.value.isUploading) {
      multiUpload.startAll();
    }
  },
  onValidationError: (validationErrors) => {
    errors.value = validationErrors;
  },
});

const hasPending = computed(
  () =>
    multiUpload.items.value.filter((item) => item.state.status === "idle")
      .length > 0,
);

const isBrowserFile = (value: unknown): value is File =>
  typeof File !== "undefined" && value instanceof File;

const handleInputClick = () => {
  inputRef.value?.click();
};
</script>

<template>
  <Card class="p-8 space-y-8">
    <header class="space-y-2">
      <h2 class="text-3xl font-bold text-gray-900">Drag &amp; Drop Uploads</h2>
      <p class="text-gray-600 leading-relaxed">
        Drop files or choose them manually. Uploads start automatically and the
        queue runs with concurrency limits.
      </p>
    </header>

    <section>
      <div
        class="relative rounded-3xl border-2 border-dashed p-12 text-center transition-all duration-300 ease-out"
        :class="[
          dragDrop.state.value.isOver
            ? 'border-primary bg-gradient-to-br from-indigo-50 via-white to-purple-50'
            : 'border-gray-300 bg-white',
        ]"
        @dragenter="dragDrop.onDragEnter"
        @dragover="dragDrop.onDragOver"
        @dragleave="dragDrop.onDragLeave"
        @drop="dragDrop.onDrop"
        @click="handleInputClick"
      >
        <div class="pointer-events-none space-y-3">
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg"
          >
            <svg
              class="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <h3 class="text-xl font-semibold text-gray-900">
            Drop files to upload
          </h3>
          <p class="text-sm text-gray-600">
            Accepts images, videos, and PDFs. Up to eight files per batch.
          </p>
          <p class="text-xs text-gray-500">
            Click anywhere in this card to open the file picker.
          </p>
        </div>
        <input
          ref="inputRef"
          class="hidden"
          v-bind="dragDrop.inputProps"
          @change="dragDrop.onInputChange"
        />
      </div>
      <ul v-if="errors.length" class="mt-4 space-y-2">
        <li
          v-for="error in errors"
          :key="error"
          class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {{ error }}
        </li>
      </ul>
    </section>

    <section v-if="multiUpload.items.value.length > 0" class="space-y-4">
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="multiUpload.state.value.isUploading || !hasPending"
          @click="multiUpload.startAll"
        >
          Start Pending
        </button>
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold bg-red-600 text-white shadow-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="!multiUpload.state.value.isUploading"
          @click="multiUpload.abortAll"
        >
          Abort Active
        </button>
        <button
          type="button"
          class="px-5 py-3 rounded-xl font-semibold border border-gray-200 bg-white text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          :disabled="multiUpload.state.value.total === 0"
          @click="multiUpload.clearAll"
        >
          Clear Queue
        </button>
      </div>

      <div class="space-y-3">
        <article
          v-for="item in multiUpload.items.value"
          :key="item.id"
          class="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        >
          <div class="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
                v-if="item.state.status === 'uploading'"
                type="button"
                class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-all"
                @click="multiUpload.abortUpload(item.id)"
              >
                Abort
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
                type="button"
                class="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
                @click="multiUpload.removeItem(item.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <div class="mt-3 space-y-2">
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
      <p class="text-gray-500 text-sm">
        The queue is empty. Drag files above or click to select them.
      </p>
    </section>
  </Card>
</template>
