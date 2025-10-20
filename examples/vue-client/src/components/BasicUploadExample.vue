<script setup lang="ts">
import { useUpload } from "@uploadista/vue";
import { ref } from "vue";
import FilePreview from "./FilePreview.vue";
import Card from "./ui/Card.vue";

const uploadedFile = ref<File | null>(null);

const upload = useUpload({
  onSuccess: (result) => {
    console.log("Upload successful:", result);
  },
  onError: (error) => {
    console.error("Upload failed:", error);
  },
  onProgress: (progress) => {
    console.log(`Upload progress: ${progress}%`);
  },
});

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    uploadedFile.value = file;
    upload.upload(file);
  }
};
</script>

<template>
  <Card class="p-8">
    <div class="mb-8 space-y-2">
      <h2 class="text-3xl font-bold text-gray-900">Basic File Upload</h2>
      <p class="text-gray-600 leading-relaxed">
        Upload a single file with Uploadista and monitor progress, success, and
        retry states. Perfect for quickly verifying server integrations.
      </p>
    </div>

    <div class="space-y-6">
      <div>
        <label
          class="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide"
          for="basic-upload-input"
        >
          Choose File
        </label>
        <input
          id="basic-upload-input"
          type="file"
          :disabled="upload.isUploading.value"
          class="block w-full text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:to-purple-600 file:text-white file:font-semibold file:cursor-pointer hover:file:from-indigo-700 hover:file:to-purple-700 file:transition-all file:shadow-md disabled:opacity-50 disabled:cursor-not-allowed border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500"
          @change="handleFileChange"
        />
      </div>

      <div
        v-if="upload.isUploading.value"
        class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100 space-y-6"
      >
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <p class="text-sm font-semibold text-gray-500 mb-2">Status</p>
            <span
              class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold capitalize bg-blue-100 text-blue-700"
            >
              {{ upload.state.value.status }}
            </span>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <p class="text-sm font-semibold text-gray-500 mb-2">Progress</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ upload.state.value.progress }}%
            </p>
          </div>
        </div>

        <div class="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="absolute inset-y-0 left-0 progress-bar-gradient transition-all duration-300 ease-out"
            :style="{ width: `${upload.state.value.progress}%` }"
          />
        </div>

        <button
          type="button"
          class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          :disabled="!upload.isUploading.value"
          @click="upload.abort"
        >
          Abort Upload
        </button>
      </div>

      <div
        v-if="upload.state.value.status === 'success'"
        class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200 space-y-4"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center"
          >
            <svg
              class="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-bold text-green-900 mb-1">
              Upload Complete!
            </h3>
            <p class="text-green-700">
              Your file uploaded successfully. Inspect the result below.
            </p>
          </div>
        </div>

        <FilePreview
          v-if="uploadedFile"
          :file="uploadedFile"
          :result="upload.state.value.result"
        />

        <details
          v-if="upload.state.value.result"
          class="bg-white rounded-xl border border-green-200"
        >
          <summary
            class="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900"
          >
            View Upload Details
          </summary>
          <pre class="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono">
{{ JSON.stringify(upload.state.value.result, null, 2) }}
          </pre>
        </details>

        <button
          type="button"
          class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
          @click="upload.reset"
        >
          Upload Another File
        </button>
      </div>

      <div
        v-if="upload.state.value.status === 'error' && upload.state.value.error"
        class="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-6 border border-red-200 space-y-4"
      >
        <div class="flex items-start gap-3">
          <div
            class="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center"
          >
            <svg
              class="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-bold text-red-900 mb-1">
              Upload Failed
            </h3>
            <p class="text-red-700">{{ upload.state.value.error?.message }}</p>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            v-if="upload.canRetry.value"
            type="button"
            class="flex-1 px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all shadow-md"
            @click="upload.retry"
          >
            Retry Upload
          </button>
          <button
            type="button"
            class="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
            @click="upload.reset"
          >
            Choose Another File
          </button>
        </div>
      </div>
    </div>
  </Card>
</template>
