<script setup lang="ts">
import type { UploadFile } from "@uploadista/core/types";
import {
  createFilePreview,
  formatFileSize,
  isAudioFile,
  isDocumentFile,
  isImageFile,
  isVideoFile,
  revokeFilePreview,
} from "@uploadista/vue";
import {
  FileAudio,
  FileText,
  FileVideo,
  Image as ImageIcon,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { cn } from "../utils/cn";

const props = defineProps<{
  file: File;
  result?: UploadFile | null;
  class?: string;
}>();

const rootClasses = computed(() =>
  cn(
    "bg-white border border-gray-200 rounded-xl p-4 shadow-sm grid gap-4 md:grid-cols-[160px_1fr]",
    props.class,
  ),
);

const previewUrl = ref<string | null>(null);

watch(
  () => props.file,
  (file) => {
    if (previewUrl.value) {
      revokeFilePreview(previewUrl.value);
      previewUrl.value = null;
    }

    const preview = createFilePreview(file);
    if (preview) {
      previewUrl.value = preview;
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (previewUrl.value) {
    revokeFilePreview(previewUrl.value);
  }
});

const fileType = computed(() => {
  if (isImageFile(props.file)) return "image";
  if (isVideoFile(props.file)) return "video";
  if (isAudioFile(props.file)) return "audio";
  if (isDocumentFile(props.file)) return "document";
  return "file";
});

const iconComponent = computed(() => {
  switch (fileType.value) {
    case "image":
      return ImageIcon;
    case "video":
      return FileVideo;
    case "audio":
      return FileAudio;
    default:
      return FileText;
  }
});
</script>

<template>
  <div
    :class="rootClasses"
  >
    <div
      class="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-br from-indigo-50 via-white to-purple-50"
    >
      <img
        v-if="previewUrl && fileType === 'image'"
        :src="previewUrl"
        :alt="file.name"
        class="h-full w-full object-cover"
      />
      <component
        :is="iconComponent"
        v-else
        class="h-12 w-12 text-primary"
      />
    </div>

    <div class="flex flex-col gap-3">
      <div>
        <p class="text-lg font-semibold text-gray-900 break-words">
          {{ file.name }}
        </p>
        <p class="text-sm text-gray-500 flex items-center gap-2">
          <span class="inline-flex items-center gap-1">
            <span class="font-medium">Size:</span>
            {{ formatFileSize(file.size) }}
          </span>
          <span aria-hidden="true">•</span>
          <span class="inline-flex items-center gap-1">
            <span class="font-medium">Type:</span>
            {{ file.type || "Unknown" }}
          </span>
        </p>
      </div>

      <div
        v-if="result"
        class="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 border border-gray-200"
      >
        <p class="font-semibold text-gray-900 mb-1">Upload Result</p>
        <dl class="grid grid-cols-1 gap-1 text-xs font-mono">
          <div v-if="result.id">
            <dt class="font-semibold">ID</dt>
            <dd class="truncate">{{ result.id }}</dd>
          </div>
          <div v-if="result.storage.bucket">
            <dt class="font-semibold">Bucket</dt>
            <dd>{{ result.storage.bucket }}</dd>
          </div>
          <div v-if="result.storage.path">
            <dt class="font-semibold">Path</dt>
            <dd class="truncate">{{ result.storage.path }}</dd>
          </div>
        </dl>
      </div>
    </div>
  </div>
</template>
