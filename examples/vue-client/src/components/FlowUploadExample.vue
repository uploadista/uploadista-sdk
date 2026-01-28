<script setup lang="ts">
import type { UploadFile } from "@uploadista/core";
import type { TypedOutput } from "@uploadista/core/flow";
import {
  Flow,
  FlowCancel,
  FlowError,
  FlowInput,
  FlowInputDropZone,
  type FlowInputMetadata,
  FlowInputPreview,
  FlowInputs,
  FlowPause,
  FlowProgress,
  FlowReset,
  FlowStatus,
  FlowSubmit,
  formatFileSize,
} from "@uploadista/vue";
import { computed, ref } from "vue";
import Card from "./ui/Card.vue";
import Select from "./ui/Select.vue";

// All available flows from @uploadista/example-flows
type FlowId =
  // Basic Image Flows
  | "simple-flow"
  | "optimize-flow"
  | "resize-flow"
  | "transform-flow"
  // Advanced Image Flows
  | "describe-image-flow"
  | "remove-background-flow"
  // Video Flows
  | "transcode-video-flow"
  | "trim-video-flow"
  | "thumbnail-flow"
  | "resize-video-flow"
  | "describe-video-flow"
  // Utility Flows
  | "conditional-flow"
  | "merge-flow"
  | "multiplex-flow"
  | "zip-flow"
  // Complex Flows
  | "image-pipeline-flow"
  | "video-pipeline-flow"
  | "conditional-image-flow"
  | "multi-format-flow";

type FlowCategory =
  | "basic-image"
  | "advanced-image"
  | "video"
  | "utility"
  | "complex";

type FlowMetadata = {
  title: string;
  description: string;
  category: FlowCategory;
  acceptedTypes: string;
  hasMultipleInputs?: boolean;
};

const flowDescriptions: Record<FlowId, FlowMetadata> = {
  // Basic Image Flows
  "simple-flow": {
    title: "Simple Flow",
    description:
      "Basic file upload without any processing. Accepts a file and stores it directly.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },
  "optimize-flow": {
    title: "Image Optimization",
    description:
      "Compresses and converts images to WebP format at 80% quality for web delivery.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },
  "resize-flow": {
    title: "Image Resize",
    description:
      "Resizes images to 800x600 with cover fit, maintaining aspect ratio.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },
  "transform-flow": {
    title: "Image Transform",
    description:
      "Applies transformations like rotation (90 degrees) and horizontal flipping.",
    category: "basic-image",
    acceptedTypes: "image/*",
  },

  // Advanced Image Flows
  "describe-image-flow": {
    title: "Image Description (AI)",
    description:
      "Uses AI to generate detailed descriptions of image content for accessibility and metadata.",
    category: "advanced-image",
    acceptedTypes: "image/*",
  },
  "remove-background-flow": {
    title: "Remove Background (AI)",
    description:
      "Uses AI to remove backgrounds from images, outputting transparent PNGs.",
    category: "advanced-image",
    acceptedTypes: "image/*",
  },

  // Video Flows
  "transcode-video-flow": {
    title: "Video Transcode",
    description:
      "Converts videos to WebM format with VP9 codec for web-friendly playback.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "trim-video-flow": {
    title: "Video Trim",
    description:
      "Cuts videos to specified time range (5-30 seconds) for clips or previews.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "thumbnail-flow": {
    title: "Video Thumbnail",
    description:
      "Extracts a frame from video at 10 seconds as a JPEG thumbnail.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "resize-video-flow": {
    title: "Video Resize",
    description: "Resizes videos to 720p (1280x720) while maintaining quality.",
    category: "video",
    acceptedTypes: "video/*",
  },
  "describe-video-flow": {
    title: "Video Description (AI)",
    description:
      "Uses AI to analyze video content and generate searchable descriptions.",
    category: "video",
    acceptedTypes: "video/*",
  },

  // Utility Flows
  "conditional-flow": {
    title: "Conditional Routing",
    description:
      "Routes files to different outputs based on size (>1MB to large, <=1MB to small).",
    category: "utility",
    acceptedTypes: "image/*",
  },
  "merge-flow": {
    title: "Merge Files",
    description:
      "Combines multiple input files into a single processing stream for batch operations.",
    category: "utility",
    acceptedTypes: "*",
    hasMultipleInputs: true,
  },
  "multiplex-flow": {
    title: "Multiplex",
    description:
      "Splits a single input into 3 parallel processing paths for multiple versions.",
    category: "utility",
    acceptedTypes: "image/*",
  },
  "zip-flow": {
    title: "Zip Archive",
    description:
      "Archives multiple files into a single compressed ZIP file for download.",
    category: "utility",
    acceptedTypes: "*",
    hasMultipleInputs: true,
  },

  // Complex Flows
  "image-pipeline-flow": {
    title: "Image Pipeline",
    description:
      "Multi-stage processing: resize to 1200x900, optimize to WebP, and generate AI description.",
    category: "complex",
    acceptedTypes: "image/*",
  },
  "video-pipeline-flow": {
    title: "Video Pipeline",
    description:
      "Complete video processing: trim to 60s, transcode to WebM, and generate thumbnail.",
    category: "complex",
    acceptedTypes: "video/*",
  },
  "conditional-image-flow": {
    title: "Conditional Image Processing",
    description:
      "Routes images >2MB through resize+optimize, smaller images through optimize only.",
    category: "complex",
    acceptedTypes: "image/*",
  },
  "multi-format-flow": {
    title: "Multi-Format Export",
    description:
      "Generates WebP, JPEG, and PNG versions, then zips them into a single archive.",
    category: "complex",
    acceptedTypes: "image/*",
  },
};

const categoryLabels: Record<FlowCategory, string> = {
  "basic-image": "Basic Image Flows",
  "advanced-image": "Advanced Image Flows (AI)",
  video: "Video Flows",
  utility: "Utility Flows",
  complex: "Complex Flows",
};

// Group flows by category for the select
const flowOptions = computed(() => {
  const categories: FlowCategory[] = [
    "basic-image",
    "advanced-image",
    "video",
    "utility",
    "complex",
  ];
  const options: Array<{ value: FlowId; label: string }> = [];

  for (const category of categories) {
    for (const [flowId, metadata] of Object.entries(flowDescriptions)) {
      if (metadata.category === category) {
        options.push({
          value: flowId as FlowId,
          label: `${categoryLabels[category]} - ${metadata.title}`,
        });
      }
    }
  }
  return options;
});

const flowId = ref<FlowId>("optimize-flow");
const outputs = ref<TypedOutput[]>([]);

const selectedFlow = computed(() => flowDescriptions[flowId.value]);

const handleFlowIdChange = (value: string) => {
  flowId.value = value as FlowId;
  outputs.value = [];
};

const handleFlowComplete = (result: TypedOutput[]) => {
  console.log("Flow complete:", result);
  outputs.value = result;
};

const handleError = (error: Error) => {
  console.error("Flow failed:", error);
};

// Helper to get storage outputs from flow outputs
const getStorageOutputs = (flowOutputs: TypedOutput[]): UploadFile[] => {
  return flowOutputs
    .filter((o) => o.nodeType === "storage-output-v1")
    .map((o) => o.data as UploadFile);
};

// Helper to get MIME type from upload file
const getMimeType = (file: UploadFile): string => {
  return (
    file.metadata?.type?.toString() ||
    file.metadata?.mimeType?.toString() ||
    file.metadata?.contentType?.toString() ||
    ""
  );
};

// Helper to get file name from upload file
const getFileName = (file: UploadFile): string => {
  return (
    file.metadata?.fileName?.toString() ||
    file.metadata?.name?.toString() ||
    "File"
  );
};

// Helper to get preview URL from upload file
const getPreviewUrl = (file: UploadFile): string | null => {
  if (file.url) {
    return file.url;
  }
  if (file.storage?.path) {
    return file.storage.path;
  }
  return null;
};

// Helper to check if file is an image
const isImage = (file: UploadFile): boolean => {
  return getMimeType(file).startsWith("image/");
};

// Helper to check if file is a video
const isVideo = (file: UploadFile): boolean => {
  return getMimeType(file).startsWith("video/");
};
</script>

<template>
  <Card class="p-8">
    <div class="mb-8">
      <h2 class="text-3xl font-bold text-gray-900 mb-3">
        useFlow Hook Example with FlowInputs
      </h2>
      <p class="text-gray-600 leading-relaxed mb-6">
        Demonstrates the Flow compound component with auto-discovery of inputs
        using FlowInputs and custom components with useFlowContext().
      </p>

      <div class="space-y-2">
        <label
          class="block text-xs font-semibold uppercase tracking-wide text-gray-600"
          for="flow-selector"
        >
          Flow
        </label>
        <Select
          id="flow-selector"
          :model-value="flowId"
          :options="flowOptions"
          @update:model-value="handleFlowIdChange"
        />
      </div>
    </div>

    <div class="mb-8">
      <h3 class="text-2xl font-bold text-gray-900 mb-2">
        {{ selectedFlow.title }}
      </h3>
      <p class="text-gray-600 leading-relaxed">{{ selectedFlow.description }}</p>
    </div>

    <!-- Flow compound component - :key ensures re-mount when flowId changes -->
    <Flow
      :key="flowId"
      :flow-id="flowId"
      storage-id="local"
      @flow-complete="handleFlowComplete"
      @error="handleError"
    >
      <div class="space-y-6">
        <!-- Auto-discover and render inputs -->
        <FlowInputs v-slot="{ inputs, isLoading }">
          <!-- Loading state -->
          <div
            v-if="isLoading"
            class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100"
          >
            <div class="flex items-center gap-3">
              <div
                class="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"
              />
              <p class="text-sm font-medium text-gray-700">
                Discovering flow inputs...
              </p>
            </div>
          </div>

          <!-- Inputs discovered -->
          <template v-if="inputs && inputs.length > 0">
            <div class="flex items-center justify-between">
              <h4 class="text-lg font-semibold text-gray-900">
                {{ inputs.length === 1 ? "Flow Input" : "Flow Inputs" }}
              </h4>
              <span class="text-sm text-gray-500">
                {{ inputs.length }} input{{ inputs.length > 1 ? "s" : "" }}
                discovered
              </span>
            </div>

            <!-- Render each input with its own context -->
            <div
              v-for="input in (inputs as FlowInputMetadata[])"
              :key="input.nodeId"
              class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200"
            >
              <div class="flex items-center justify-between mb-4">
                <h5 class="font-semibold text-gray-900">{{ input.nodeName }}</h5>
                <span
                  class="text-xs px-2 py-1 rounded-full bg-gray-200 text-gray-600"
                >
                  {{ input.nodeId }}
                </span>
              </div>
              <p
                v-if="input.nodeDescription"
                class="text-sm text-gray-500 mb-4"
              >
                {{ input.nodeDescription }}
              </p>

              <!-- Using FlowInput to scope the context -->
              <FlowInput :node-id="input.nodeId" v-slot="{ }">
                <FlowInputDropZone
                  :accept="selectedFlow.acceptedTypes"
                  v-slot="{ isDragging, dragHandlers, inputProps, onInputChange, openFilePicker }"
                >
                  <div
                    v-bind="dragHandlers"
                    @click="openFilePicker"
                    :class="[
                      'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors w-full',
                      isDragging
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-300 hover:border-indigo-400',
                    ]"
                  >
                    <input
                      v-bind="inputProps"
                      @change="onInputChange"
                      class="hidden"
                    />
                    <p class="text-sm text-gray-600">
                      {{
                        isDragging
                          ? "Drop file here..."
                          : "Click to select or drag & drop"
                      }}
                    </p>
                  </div>
                </FlowInputDropZone>

                <!-- Show preview of selected file -->
                <FlowInputPreview v-slot="{ value, isFile, fileName, fileSize, isUrl, clear }">
                  <div
                    v-if="value"
                    class="mt-3 p-3 bg-white rounded-lg border border-gray-200 flex items-center justify-between"
                  >
                    <div>
                      <p class="text-sm font-medium text-gray-900">
                        {{ isFile ? fileName : isUrl ? String(value) : String(value) }}
                      </p>
                      <p
                        v-if="isFile && fileSize"
                        class="text-xs text-gray-500"
                      >
                        {{ (fileSize / 1024).toFixed(1) }} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      @click="clear"
                      class="text-gray-400 hover:text-gray-600 p-1"
                      aria-label="Clear"
                    >
                      ×
                    </button>
                  </div>
                </FlowInputPreview>
              </FlowInput>
            </div>
          </template>
        </FlowInputs>

        <!-- Submit Button -->
        <FlowSubmit
          class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        >
          Execute Flow
        </FlowSubmit>

        <!-- Upload Progress -->
        <FlowProgress v-slot="{ progress, status, bytesUploaded, totalBytes }">
          <div
            v-if="status === 'uploading'"
            class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100"
          >
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div class="bg-white rounded-xl p-4 shadow-sm">
                <div class="text-sm font-semibold text-gray-500 mb-2">
                  Status
                </div>
                <span
                  class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-700"
                >
                  Uploading
                </span>
              </div>
              <div class="bg-white rounded-xl p-4 shadow-sm">
                <div class="text-sm font-semibold text-gray-500 mb-2">
                  Progress
                </div>
                <div class="text-2xl font-bold text-gray-900">
                  {{ progress.toFixed(0) }}%
                </div>
                <div v-if="totalBytes" class="text-xs text-gray-500">
                  {{ (bytesUploaded / 1024).toFixed(0) }} KB /
                  {{ (totalBytes / 1024).toFixed(0) }} KB
                </div>
              </div>
            </div>

            <div
              class="relative h-3 bg-gray-200 rounded-full overflow-hidden mb-4"
            >
              <div
                class="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300 ease-out"
                :style="{ width: `${progress}%` }"
              />
            </div>

            <div class="flex gap-3">
              <FlowPause
                class="flex-1 px-6 py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-100 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pause Upload
              </FlowPause>
              <FlowCancel
                class="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md"
              >
                Abort Upload
              </FlowCancel>
            </div>
          </div>
        </FlowProgress>

        <!-- Processing Status -->
        <FlowStatus v-slot="{ status, currentNodeName }">
          <div
            v-if="status === 'processing'"
            class="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl p-6 border border-purple-100"
          >
            <div class="bg-white rounded-xl p-4 shadow-sm mb-4">
              <div class="text-sm font-semibold text-gray-500 mb-2">Status</div>
              <span
                class="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-purple-100 text-purple-700"
              >
                Processing Flow
              </span>
            </div>

            <div
              class="w-full bg-gray-200 rounded-full h-3 mb-2 overflow-hidden"
            >
              <div
                class="bg-purple-600 h-3 rounded-full animate-pulse w-full"
              />
            </div>

            <p class="text-sm text-gray-700 mb-4">
              {{
                currentNodeName
                  ? `Processing: ${currentNodeName}`
                  : "Processing flow..."
              }}
            </p>

            <div class="flex gap-3">
              <FlowPause
                class="flex-1 px-6 py-3 bg-amber-600 text-white font-semibold rounded-xl hover:bg-amber-700 focus:outline-none focus:ring-4 focus:ring-amber-100 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Pause Flow
              </FlowPause>
              <FlowCancel
                class="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md"
              >
                Abort Flow
              </FlowCancel>
            </div>
          </div>
        </FlowStatus>

        <!-- Paused State -->
        <FlowStatus v-slot="{ status }">
          <div
            v-if="status === 'paused'"
            class="bg-gradient-to-br from-amber-50 to-yellow-50 rounded-2xl p-6 border border-amber-200"
          >
            <div class="flex items-start gap-3 mb-4">
              <div
                class="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center"
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
                    d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-bold text-amber-900 mb-1">
                  Upload Paused
                </h3>
                <p class="text-amber-700">
                  The upload has been paused. Resume to continue.
                </p>
              </div>
            </div>
            <div class="flex gap-3">
              <FlowSubmit
                class="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 focus:outline-none focus:ring-4 focus:ring-green-100 transition-all shadow-md"
              >
                Resume
              </FlowSubmit>
              <FlowCancel
                class="flex-1 px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all shadow-md"
              >
                Cancel
              </FlowCancel>
            </div>
          </div>
        </FlowStatus>

        <!-- Success State -->
        <FlowStatus v-slot="{ status }">
          <div
            v-if="status === 'success'"
            class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200"
          >
            <div class="flex items-start gap-3 mb-4">
              <div
                class="flex-shrink-0 w-10 h-10 bg-green-500 rounded-full flex items-center justify-center"
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div class="flex-1">
                <h3 class="text-lg font-bold text-green-900 mb-1">
                  Flow Complete!
                </h3>
                <p class="text-green-700">
                  File processed successfully through {{ selectedFlow.title }}.
                </p>
              </div>
            </div>

            <template v-if="outputs.length > 0">
              <div
                v-for="(storageOutput, index) in getStorageOutputs(outputs)"
                :key="index"
                class="bg-white border border-green-200 rounded-xl overflow-hidden shadow-sm mb-4"
              >
                <!-- Image/Video Preview -->
                <template v-if="getPreviewUrl(storageOutput) && (isImage(storageOutput) || isVideo(storageOutput))">
                  <img
                    v-if="isImage(storageOutput)"
                    :src="getPreviewUrl(storageOutput)!"
                    :alt="getFileName(storageOutput)"
                    class="w-full h-auto object-contain max-h-96 bg-gray-50"
                  />
                  <video
                    v-else-if="isVideo(storageOutput)"
                    :src="getPreviewUrl(storageOutput)!"
                    controls
                    class="w-full h-auto object-contain max-h-96 bg-gray-50"
                  >
                    Your browser does not support the video tag.
                  </video>
                </template>

                <!-- File Info -->
                <div class="px-4 py-3 border-t border-green-100">
                  <div class="flex items-center gap-2 text-sm mb-2">
                    <svg
                      class="w-4 h-4 text-gray-400 flex-shrink-0"
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
                    <span class="font-medium text-gray-700 truncate">{{ getFileName(storageOutput) }}</span>
                    <span v-if="getMimeType(storageOutput)" class="ml-auto text-gray-500 text-xs font-mono">
                      {{ getMimeType(storageOutput) }}
                    </span>
                  </div>
                  <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div v-if="storageOutput.size" class="flex gap-1">
                      <dt class="font-semibold text-gray-500">Size:</dt>
                      <dd class="text-gray-700">{{ formatFileSize(storageOutput.size) }}</dd>
                    </div>
                    <div v-if="storageOutput.storage?.bucket" class="flex gap-1">
                      <dt class="font-semibold text-gray-500">Bucket:</dt>
                      <dd class="text-gray-700">{{ storageOutput.storage.bucket }}</dd>
                    </div>
                    <div v-if="storageOutput.storage?.path" class="col-span-2 flex gap-1">
                      <dt class="font-semibold text-gray-500">Path:</dt>
                      <dd class="text-gray-700 truncate">{{ storageOutput.storage.path }}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </template>

            <details
              v-if="outputs.length > 0"
              class="bg-white rounded-xl border border-green-200 mb-4"
            >
              <summary
                class="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900"
              >
                View Flow Result Details
              </summary>
              <pre
                class="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono"
                >{{ JSON.stringify(outputs, null, 2) }}</pre
              >
            </details>

            <FlowReset
              class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
              @click="outputs = []"
            >
              Upload Another File
            </FlowReset>
          </div>
        </FlowStatus>

        <!-- Error State -->
        <FlowError v-slot="{ error }">
          <div
            v-if="error"
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
                <h3 class="text-lg font-bold text-red-900 mb-1">Flow Failed</h3>
                <p class="text-red-700">{{ error.message }}</p>
              </div>
            </div>
            <FlowReset
              class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
              @click="outputs = []"
            >
              Try Another File
            </FlowReset>
          </div>
        </FlowError>
      </div>
    </Flow>
  </Card>
</template>
