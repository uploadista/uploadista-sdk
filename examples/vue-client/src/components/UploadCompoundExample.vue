<script setup lang="ts">
/**
 * Example demonstrating the Upload compound component pattern for Vue.
 * This shows how to build custom upload UIs using composable primitives
 * with complete control over rendering and behavior via scoped slots.
 */
import type { UploadFile } from "@uploadista/core";
import {
  Upload,
  UploadCancel,
  UploadDropZone,
  UploadError,
  UploadItem,
  UploadItems,
  UploadProgress,
  UploadReset,
  UploadRetry,
  UploadStartAll,
  UploadStatus,
} from "@uploadista/vue";
import FilePreview from "./FilePreview.vue";
import Card from "./ui/Card.vue";

const handleSuccess = (result: UploadFile) => {
  console.log("File uploaded:", result);
};

const handleError = (error: Error) => {
  console.error("Upload failed:", error);
};

const handleComplete = (results: {
  successful: unknown[];
  failed: unknown[];
  total: number;
}) => {
  console.log("All uploads complete:", results);
  if (results.successful.length > 0) {
    alert(
      `${results.successful.length}/${results.total} files uploaded successfully`,
    );
  }
};

const isBrowserFile = (value: unknown): value is File =>
  typeof File !== "undefined" && value instanceof File;
</script>

<template>
  <Card class="p-8 space-y-8">
    <header class="space-y-2">
      <h2 class="text-3xl font-bold text-gray-900">Upload Compound Component</h2>
      <p class="text-gray-600 leading-relaxed">
        Build custom upload interfaces using the composable Upload component.
        This pattern provides maximum flexibility with headless primitives
        that you can style and arrange however you want.
      </p>
    </header>

    <Upload
      :multiple="true"
      :max-concurrent="3"
      :auto-start="false"
      @success="handleSuccess"
      @error="handleError"
      @complete="handleComplete"
    >
      <!-- Drop Zone -->
      <UploadDropZone
        accept="image/*,video/*,.pdf"
        :max-files="10"
        :max-file-size="50 * 1024 * 1024"
        v-slot="{
          isDragging,
          dragHandlers,
          inputProps,
          onInputChange,
          openFilePicker,
          errors,
        }"
      >
        <div class="space-y-4">
          <div
            v-bind="dragHandlers"
            @click="openFilePicker"
            class="relative rounded-3xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-300 ease-out"
            :class="[
              isDragging
                ? 'border-indigo-500 bg-gradient-to-br from-indigo-50 via-white to-purple-50 scale-102'
                : 'border-gray-300 bg-white hover:border-indigo-400 hover:bg-gradient-to-br hover:from-indigo-50 hover:to-purple-50',
            ]"
          >
            <input
              v-bind="inputProps"
              @change="onInputChange"
              class="hidden"
            />

            <div class="pointer-events-none space-y-3">
              <template v-if="isDragging">
                <div class="text-7xl mb-4 animate-bounce">📁</div>
                <h3 class="text-2xl font-bold text-indigo-600">
                  Drop your files here...
                </h3>
              </template>
              <template v-else>
                <div
                  class="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg mb-4"
                >
                  <svg
                    class="h-10 w-10"
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
                <h3 class="text-2xl font-bold text-gray-900">
                  Drag & drop files here
                </h3>
                <p class="text-gray-500">or click to browse</p>
                <p class="text-sm text-gray-400 inline-flex items-center gap-2">
                  <svg
                    class="w-4 h-4"
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
                  <span>Images, videos, PDFs • Max 50MB • Up to 10 files</span>
                </p>
              </template>
            </div>
          </div>

          <!-- Validation Errors -->
          <div
            v-if="errors.length > 0"
            class="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-6 border border-red-200"
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
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-bold text-red-900 mb-2">
                  Validation Errors
                </h3>
                <ul class="space-y-1">
                  <li
                    v-for="error in errors"
                    :key="error"
                    class="text-red-700 text-sm"
                  >
                    • {{ error }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </UploadDropZone>

      <!-- Progress Overview -->
      <UploadProgress
        v-slot="{ progress, bytesUploaded, totalBytes, isUploading }"
      >
        <div
          v-if="isUploading || totalBytes > 0"
          class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100 space-y-6"
        >
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-sm font-semibold text-gray-500 mb-2">
                Overall Progress
              </div>
              <div class="text-2xl font-bold text-gray-900">{{ progress }}%</div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-sm font-semibold text-gray-500 mb-2">
                Bytes Uploaded
              </div>
              <div class="text-2xl font-bold text-blue-600">
                {{ (bytesUploaded / 1024 / 1024).toFixed(2) }} MB
              </div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-sm font-semibold text-gray-500 mb-2">
                Total Size
              </div>
              <div class="text-2xl font-bold text-purple-600">
                {{ (totalBytes / 1024 / 1024).toFixed(2) }} MB
              </div>
            </div>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <div class="text-sm font-semibold text-gray-500 mb-2">Status</div>
              <div class="text-2xl font-bold text-green-600">
                {{ isUploading ? "Uploading" : "Ready" }}
              </div>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="relative h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-300 ease-out"
              :style="{ width: `${progress}%` }"
            />
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-4 gap-3">
            <UploadStartAll
              class="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-green-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              Start All
            </UploadStartAll>

            <UploadCancel
              class="px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              Cancel All
            </UploadCancel>

            <UploadRetry
              class="px-6 py-3 bg-orange-600 text-white font-semibold rounded-xl hover:bg-orange-700 focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              Retry Failed
            </UploadRetry>

            <UploadReset
              class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
            >
              Clear All
            </UploadReset>
          </div>
        </div>
      </UploadProgress>

      <!-- Status Overview -->
      <UploadStatus v-slot="{ total, successful, failed, uploading }">
        <div
          v-if="total > 0"
          class="flex items-center justify-center gap-6 py-4"
        >
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-blue-500" />
            <span class="text-gray-600">Active: {{ uploading }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-green-500" />
            <span class="text-gray-600">Successful: {{ successful }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-red-500" />
            <span class="text-gray-600">Failed: {{ failed }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-gray-300" />
            <span class="text-gray-600">Total: {{ total }}</span>
          </div>
        </div>
      </UploadStatus>

      <!-- File List -->
      <UploadItems v-slot="{ items, isEmpty }">
        <div v-if="!isEmpty" class="space-y-4">
          <h3 class="text-xl font-bold text-gray-900">Upload Queue</h3>
          <div class="space-y-3">
            <UploadItem
              v-for="item in items"
              :key="item.id"
              :id="item.id"
              v-slot="{ file, state: itemState, abort, retry, remove }"
            >
              <article
                class="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-all"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <div class="flex-shrink-0">
                      <svg
                        class="w-8 h-8 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <span class="font-semibold text-gray-900 truncate">
                      {{ isBrowserFile(file) ? file.name : "File" }}
                    </span>
                  </div>
                  <span
                    :class="[
                      'inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold flex-shrink-0 ml-3',
                      itemState.status === 'uploading'
                        ? 'bg-blue-100 text-blue-700'
                        : itemState.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : itemState.status === 'error'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-700',
                    ]"
                  >
                    {{ itemState.status }}
                  </span>
                </div>

                <!-- Progress Bar -->
                <div
                  class="relative h-2 bg-gray-200 rounded-full overflow-hidden mb-3"
                >
                  <div
                    :class="[
                      'absolute inset-y-0 left-0 transition-all duration-300 ease-out rounded-full',
                      itemState.status === 'success'
                        ? 'bg-green-500'
                        : itemState.status === 'error'
                          ? 'bg-red-500'
                          : 'bg-gradient-to-r from-indigo-500 to-purple-600',
                    ]"
                    :style="{ width: `${itemState.progress}%` }"
                  />
                </div>

                <!-- Action Buttons -->
                <div class="flex gap-2">
                  <button
                    v-if="itemState.status === 'uploading'"
                    type="button"
                    @click="abort"
                    class="flex-1 px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-100 transition-all"
                  >
                    Abort
                  </button>
                  <button
                    v-if="itemState.status === 'error'"
                    type="button"
                    @click="retry"
                    class="flex-1 px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-lg hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-100 transition-all"
                  >
                    Retry
                  </button>
                  <button
                    v-if="
                      itemState.status === 'idle' ||
                      itemState.status === 'error' ||
                      itemState.status === 'success'
                    "
                    type="button"
                    @click="remove"
                    class="flex-1 px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-100 transition-all"
                  >
                    Remove
                  </button>
                </div>

                <!-- File Preview for successful uploads -->
                <FilePreview
                  v-if="itemState.status === 'success' && itemState.result && isBrowserFile(file)"
                  :file="file"
                  :result="(itemState.result as UploadFile)"
                  class="mt-3"
                />

                <!-- Error Message -->
                <div
                  v-if="itemState.error"
                  class="mt-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-lg p-2"
                >
                  <svg
                    class="w-4 h-4 flex-shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>Error: {{ itemState.error.message }}</span>
                </div>
              </article>
            </UploadItem>
          </div>
        </div>
      </UploadItems>

      <!-- Error Display -->
      <UploadError v-slot="{ hasError, failedCount, failedItems }">
        <div
          v-if="hasError"
          class="bg-gradient-to-br from-red-50 to-rose-50 rounded-2xl p-6 border border-red-200"
        >
          <div class="flex items-start gap-3 mb-4">
            <div
              class="flex-shrink-0 w-10 h-10 bg-red-500 rounded-full flex items-center justify-center"
            >
              <svg
                class="w-6 h-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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
                {{ failedCount }} Upload(s) Failed
              </h3>
              <ul class="text-red-700 text-sm space-y-1">
                <li v-for="item in failedItems" :key="item.id">
                  • {{ isBrowserFile(item.file) ? item.file.name : "File" }}:
                  {{ item.state.error?.message || "Unknown error" }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </UploadError>
    </Upload>
  </Card>
</template>
