<script setup lang="ts">
import type { FlowUploadConfig } from "@uploadista/client-browser";
import { useFlowUpload } from "@uploadista/vue";
import { computed, reactive, ref, watch } from "vue";
import FilePreview from "./FilePreview.vue";
import Card from "./ui/Card.vue";
import Select from "./ui/Select.vue";

type FlowOption =
  | "optimize-flow"
  | "describe-image-flow"
  | "remove-background-flow";

const flowDescriptions: Record<
  FlowOption,
  { title: string; description: string }
> = {
  "optimize-flow": {
    title: "Image Optimization",
    description:
      "Upload an image to run through the optimization flow. Files are converted to WEBP and optimized for delivery.",
  },
  "describe-image-flow": {
    title: "Image Description",
    description:
      "Send an image through a flow that generates a rich description, useful for accessibility or content metadata.",
  },
  "remove-background-flow": {
    title: "Background Removal",
    description:
      "Process an image using the background removal flow to generate transparent-background variants.",
  },
};

const flowId = ref<FlowOption>("optimize-flow");

const flowConfig = reactive<FlowUploadConfig>({
  flowId: flowId.value,
  storageId: "local",
});

const uploadedFile = ref<File | null>(null);

const flowUpload = useFlowUpload({
  flowConfig,
  onFlowComplete: (outputs) => {
    console.log("Flow outputs:", outputs);
  },
  onError: (error) => {
    console.error("Flow upload failed:", error);
  },
});

watch(
  flowId,
  (value) => {
    flowConfig.flowId = value;
    flowUpload.reset();
    uploadedFile.value = null;
  },
  { flush: "sync" },
);

const selectedFlow = computed(() => flowDescriptions[flowId.value]);

const handleFileChange = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) {
    uploadedFile.value = file;
    flowUpload.upload(file);
  }
};
</script>

<template>
  <Card class="p-8 space-y-8">
    <header class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="space-y-2">
        <h2 class="text-3xl font-bold text-gray-900">
          Flow Upload — {{ selectedFlow.title }}
        </h2>
        <p class="text-gray-600 leading-relaxed">
          {{ selectedFlow.description }}
        </p>
      </div>
      <div class="w-full md:w-72">
        <label
          class="block text-xs font-semibold uppercase tracking-wide text-gray-600 mb-2"
          for="flow-selector"
        >
          Flow
        </label>
        <Select
          id="flow-selector"
          v-model="flowId"
          :options="[
            { value: 'optimize-flow', label: 'Optimize Image' },
            { value: 'describe-image-flow', label: 'Describe Image' },
            { value: 'remove-background-flow', label: 'Remove Background' },
          ]"
        />
      </div>
    </header>

    <section class="space-y-6">
      <div>
        <label
          class="block text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide"
          for="flow-upload-input"
        >
          Choose Image File
        </label>
        <input
          id="flow-upload-input"
          type="file"
          accept="image/*"
          :disabled="flowUpload.isUploading.value"
          class="block w-full text-gray-700 file:mr-4 file:py-3 file:px-6 file:rounded-xl file:border-0 file:bg-gradient-to-r file:from-indigo-600 file:to-purple-600 file:text-white file:font-semibold file:cursor-pointer hover:file:from-indigo-700 hover:file:to-purple-700 file:transition-all file:shadow-md border-2 border-gray-200 rounded-xl focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          @change="handleFileChange"
        />
      </div>

      <div v-if="flowUpload.state.value.jobId" class="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p class="text-sm font-semibold text-blue-700 mb-1">Job ID</p>
        <code class="text-xs font-mono text-blue-900 break-all">{{
          flowUpload.state.value.jobId
        }}</code>
      </div>

      <div
        v-if="flowUpload.isUploadingFile.value"
        class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100 space-y-4"
      >
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <p class="text-sm font-semibold text-gray-500 mb-2">Upload Status</p>
            <p class="text-lg font-semibold capitalize text-indigo-700">
              {{ flowUpload.state.value.status }}
            </p>
          </div>
          <div class="bg-white rounded-xl p-4 shadow-sm">
            <p class="text-sm font-semibold text-gray-500 mb-2">Progress</p>
            <p class="text-2xl font-bold text-gray-900">
              {{ flowUpload.state.value.progress }}%
            </p>
          </div>
        </div>

        <div class="relative h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            class="absolute inset-y-0 left-0 progress-bar-gradient transition-all duration-300 ease-out"
            :style="{ width: `${flowUpload.state.value.progress}%` }"
          />
        </div>

        <button
          type="button"
          class="w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          :disabled="!flowUpload.isUploading.value"
          @click="flowUpload.abort"
        >
          Abort Upload
        </button>
      </div>

      <div
        v-if="flowUpload.isProcessing.value"
        class="rounded-2xl border border-purple-200 bg-purple-50 p-6 space-y-4"
      >
        <p class="text-sm font-semibold text-purple-700 uppercase tracking-wide">
          Processing Flow
        </p>
        <p class="text-base text-purple-800">
          {{
            flowUpload.state.value.currentNodeName
              ? `Current node: ${flowUpload.state.value.currentNodeName}`
              : "Running nodes..."
          }}
        </p>
        <div class="w-full bg-purple-200 rounded-full h-3 overflow-hidden">
          <div class="bg-purple-500 h-3 rounded-full animate-pulse w-full" />
        </div>
      </div>

      <div
        v-if="flowUpload.state.value.status === 'success'"
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
              Flow Complete
            </h3>
            <p class="text-green-700">
              The file finished processing. Inspect the outputs below.
            </p>
          </div>
        </div>

        <FilePreview
          v-if="uploadedFile"
          :file="uploadedFile"
          :result="flowUpload.state.value.result ?? undefined"
        />

        <details
          v-if="flowUpload.state.value.flowOutputs"
          class="bg-white rounded-xl border border-green-200"
        >
          <summary
            class="px-4 py-3 cursor-pointer font-semibold text-gray-700 hover:text-gray-900"
          >
            Flow Outputs
          </summary>
          <pre class="px-4 pb-4 text-sm text-gray-800 overflow-auto font-mono">
{{ JSON.stringify(flowUpload.state.value.flowOutputs, null, 2) }}
          </pre>
        </details>

        <button
          type="button"
          class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
          @click="flowUpload.reset"
        >
          Upload Another File
        </button>
      </div>

      <div
        v-if="flowUpload.state.value.status === 'error' && flowUpload.state.value.error"
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
              Flow Failed
            </h3>
            <p class="text-red-700">{{ flowUpload.state.value.error.message }}</p>
          </div>
        </div>

        <button
          type="button"
          class="w-full px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-md"
          @click="flowUpload.reset"
        >
          Try Again
        </button>
      </div>
    </section>
  </Card>
</template>
