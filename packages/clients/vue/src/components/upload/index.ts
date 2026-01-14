/**
 * Vue 3 Upload Compound Components for Uploadista
 *
 * These components provide a composable, headless API for building upload interfaces.
 * They use Vue's provide/inject for context and scoped slots for complete UI control.
 *
 * @example Simple Drop Zone (Single File)
 * ```vue
 * <template>
 *   <Upload @success="handleSuccess">
 *     <UploadDropZone accept="image/*" v-slot="{ isDragging, dragHandlers, inputProps, onInputChange, openFilePicker }">
 *       <div v-bind="dragHandlers" @click="openFilePicker">
 *         <input type="file" v-bind="inputProps" @change="onInputChange" style="display: none" />
 *         {{ isDragging ? 'Drop here' : 'Drag or click' }}
 *       </div>
 *     </UploadDropZone>
 *     <UploadProgress v-slot="{ progress, isUploading }">
 *       <progress v-if="isUploading" :value="progress" max="100" />
 *     </UploadProgress>
 *   </Upload>
 * </template>
 *
 * <script setup>
 * import { Upload, UploadDropZone, UploadProgress } from '@uploadista/vue'
 *
 * const handleSuccess = (result) => {
 *   console.log('Upload complete:', result)
 * }
 * </script>
 * ```
 *
 * @example Multi-File Upload
 * ```vue
 * <template>
 *   <Upload multiple :max-concurrent="3" @complete="handleComplete">
 *     <UploadDropZone v-slot="{ dragHandlers, inputProps, onInputChange, openFilePicker }">
 *       <div v-bind="dragHandlers" @click="openFilePicker">
 *         <input type="file" v-bind="inputProps" @change="onInputChange" style="display: none" />
 *         Drop files here
 *       </div>
 *     </UploadDropZone>
 *     <UploadItems v-slot="{ items, isEmpty }">
 *       <p v-if="isEmpty">No files</p>
 *       <div v-else v-for="item in items" :key="item.id">
 *         <UploadItem :id="item.id" v-slot="{ file, state, abort, remove }">
 *           {{ file.name }}: {{ state.progress }}%
 *           <button @click="abort">Cancel</button>
 *           <button @click="remove">Remove</button>
 *         </UploadItem>
 *       </div>
 *     </UploadItems>
 *     <UploadStartAll>Upload All</UploadStartAll>
 *     <UploadCancel>Cancel All</UploadCancel>
 *     <UploadClearCompleted>Clear Completed</UploadClearCompleted>
 *   </Upload>
 * </template>
 * ```
 */

export type { UploadContextValue, UploadProps } from "./Upload.vue";
// Root component
export { default as Upload } from "./Upload.vue";
// Action components
export { default as UploadCancel } from "./UploadCancel.vue";
export { default as UploadClearCompleted } from "./UploadClearCompleted.vue";
export type {
  UploadDropZoneProps,
  UploadDropZoneSlotProps,
} from "./UploadDropZone.vue";
// Drop zone
export { default as UploadDropZone } from "./UploadDropZone.vue";
export type { UploadErrorSlotProps } from "./UploadError.vue";
// Error
export { default as UploadError } from "./UploadError.vue";
export type { UploadItemProps, UploadItemSlotProps } from "./UploadItem.vue";
// Item
export { default as UploadItem } from "./UploadItem.vue";
export type { UploadItemsSlotProps } from "./UploadItems.vue";
// Items
export { default as UploadItems } from "./UploadItems.vue";
export type { UploadProgressSlotProps } from "./UploadProgress.vue";
// Progress
export { default as UploadProgress } from "./UploadProgress.vue";
export { default as UploadReset } from "./UploadReset.vue";
export { default as UploadRetry } from "./UploadRetry.vue";
export { default as UploadStartAll } from "./UploadStartAll.vue";
export type { UploadStatusSlotProps } from "./UploadStatus.vue";
// Status
export { default as UploadStatus } from "./UploadStatus.vue";

// Context hooks
export {
  UPLOAD_CONTEXT_KEY,
  UPLOAD_ITEM_CONTEXT_KEY,
  type UploadItemContextValue,
  useUploadContext,
  useUploadItemContext,
} from "./useUploadContext";
