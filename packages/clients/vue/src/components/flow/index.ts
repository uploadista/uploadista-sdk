/**
 * Vue 3 Flow Compound Components for Uploadista
 *
 * These components provide a composable, headless API for building flow upload interfaces.
 * They use Vue's provide/inject for context and scoped slots for complete UI control.
 *
 * @example Simple Drop Zone
 * ```vue
 * <template>
 *   <Flow flowId="image-optimizer" storageId="s3" @success="handleSuccess">
 *     <FlowDropZone accept="image/*" v-slot="{ isDragging, progress, dragHandlers, inputProps, onInputChange, openFilePicker }">
 *       <div v-bind="dragHandlers" @click="openFilePicker">
 *         <input type="file" v-bind="inputProps" @change="onInputChange" style="display: none" />
 *         {{ isDragging ? 'Drop here' : 'Drag or click' }}
 *         <progress v-if="progress > 0" :value="progress" max="100" />
 *       </div>
 *     </FlowDropZone>
 *   </Flow>
 * </template>
 *
 * <script setup>
 * import { Flow, FlowDropZone } from '@uploadista/vue'
 *
 * const handleSuccess = (outputs) => {
 *   console.log('Upload complete:', outputs)
 * }
 * </script>
 * ```
 *
 * @example Multi-Input Flow
 * ```vue
 * <template>
 *   <Flow flowId="video-processor" storageId="s3">
 *     <FlowInputs v-slot="{ inputs, isLoading }">
 *       <div v-if="isLoading">Loading...</div>
 *       <div v-else v-for="input in inputs" :key="input.nodeId">
 *         <FlowInput :nodeId="input.nodeId" v-slot="{ metadata }">
 *           <label>{{ metadata.nodeName }}</label>
 *           <FlowInputDropZone accept="video/*" v-slot="{ dragHandlers, openFilePicker }">
 *             <div v-bind="dragHandlers" @click="openFilePicker">
 *               Drop video here
 *             </div>
 *           </FlowInputDropZone>
 *         </FlowInput>
 *       </div>
 *     </FlowInputs>
 *     <FlowSubmit>Process</FlowSubmit>
 *   </Flow>
 * </template>
 * ```
 */

// Root component
export { default as Flow } from "./Flow.vue";
export type { FlowProps, FlowContextValue } from "./Flow.vue";

// Context hooks
export {
  useFlowContext,
  useFlowInputContext,
  FLOW_CONTEXT_KEY,
  FLOW_INPUT_CONTEXT_KEY,
  type FlowInputContextValue,
} from "./useFlowContext";

// Drop zone
export { default as FlowDropZone } from "./FlowDropZone.vue";
export type { FlowDropZoneProps, FlowDropZoneSlotProps } from "./FlowDropZone.vue";

// Input discovery
export { default as FlowInputs } from "./FlowInputs.vue";
export type { FlowInputsSlotProps } from "./FlowInputs.vue";

// Input context
export { default as FlowInput } from "./FlowInput.vue";
export type { FlowInputProps, FlowInputSlotProps } from "./FlowInput.vue";

// Input primitives
export { default as FlowInputDropZone } from "./FlowInputDropZone.vue";
export type { FlowInputDropZoneProps, FlowInputDropZoneSlotProps } from "./FlowInputDropZone.vue";

export { default as FlowInputUrlField } from "./FlowInputUrlField.vue";
export type { FlowInputUrlFieldProps } from "./FlowInputUrlField.vue";

export { default as FlowInputPreview } from "./FlowInputPreview.vue";
export type { FlowInputPreviewSlotProps } from "./FlowInputPreview.vue";

// Status primitives
export { default as FlowProgress } from "./FlowProgress.vue";
export type { FlowProgressSlotProps } from "./FlowProgress.vue";

export { default as FlowStatus } from "./FlowStatus.vue";
export type { FlowStatusSlotProps } from "./FlowStatus.vue";

export { default as FlowError } from "./FlowError.vue";
export type { FlowErrorSlotProps } from "./FlowError.vue";

// Action primitives
export { default as FlowSubmit } from "./FlowSubmit.vue";
export { default as FlowCancel } from "./FlowCancel.vue";
export { default as FlowReset } from "./FlowReset.vue";
