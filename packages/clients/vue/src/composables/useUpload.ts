import type {
	ChunkMetrics,
	PerformanceInsights,
	UploadSessionMetrics,
} from "@uploadista/client-browser";
import type {
	UploadMetrics,
	UploadOptions,
} from "@uploadista/client-core";
import {
	UploadManager,
	type UploadState,
	type UploadStatus,
} from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { computed, onUnmounted, ref } from "vue";
import { useUploadistaClient } from "./useUploadistaClient";

// Re-export types from core for convenience
export type { UploadState, UploadStatus };
export type UploadInput = File | Blob;
export type { ChunkMetrics, PerformanceInsights, UploadSessionMetrics };

const initialState: UploadState = {
	status: "idle",
	progress: 0,
	bytesUploaded: 0,
	totalBytes: null,
	error: null,
	result: null,
};

/**
 * Vue composable for managing individual file uploads with full state management.
 * Provides upload progress tracking, error handling, abort functionality, and retry logic.
 *
 * Must be used within a component tree that has the Uploadista plugin installed.
 *
 * @param options - Upload configuration and event handlers
 * @returns Upload state and control methods
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUpload } from '@uploadista/vue';
 *
 * const upload = useUpload({
 *   onSuccess: (result) => console.log('Upload complete:', result),
 *   onError: (error) => console.error('Upload failed:', error),
 *   onProgress: (progress) => console.log('Progress:', progress + '%'),
 * });
 *
 * const handleFileChange = (event: Event) => {
 *   const file = (event.target as HTMLInputElement).files?.[0];
 *   if (file) upload.upload(file);
 * };
 * </script>
 *
 * <template>
 *   <div>
 *     <input type="file" @change="handleFileChange" />
 *     <div v-if="upload.isUploading">Progress: {{ upload.state.progress }}%</div>
 *     <div v-if="upload.state.error">Error: {{ upload.state.error.message }}</div>
 *     <button v-if="upload.canRetry" @click="upload.retry">Retry</button>
 *     <button @click="upload.abort" :disabled="!upload.isUploading">Abort</button>
 *   </div>
 * </template>
 * ```
 */
export function useUpload(options: UploadOptions = {}) {
	const uploadistaClient = useUploadistaClient();
	const state = ref<UploadState>({ ...initialState });
	let manager: UploadManager | null = null;

	// Wrap the client's upload method to match UploadFunction signature
	const uploadFn = (input: unknown, opts: UploadOptions) =>
		uploadistaClient.client.upload(input as UploadInput, opts);

	// Create UploadManager instance
	manager = new UploadManager(
		uploadFn,
		{
			onStateChange: (newState: UploadState) => {
				state.value = newState;
			},
			onProgress: options.onProgress,
			onChunkComplete: options.onChunkComplete,
			onSuccess: options.onSuccess,
			onError: options.onError,
			onAbort: options.onAbort,
		},
		options,
	);

	// Clean up manager when component unmounts
	onUnmounted(() => {
		manager?.cleanup();
	});

	// Upload function
	const upload = (file: UploadInput) => {
		manager?.upload(file);
	};

	// Abort function
	const abort = () => {
		manager?.abort();
	};

	// Reset function
	const reset = () => {
		manager?.reset();
	};

	// Retry function
	const retry = () => {
		manager?.retry();
	};

	// Computed properties
	const isUploading = computed(() => state.value.status === "uploading");
	const canRetry = computed(() => manager?.canRetry() ?? false);

	// Create metrics object that delegates to the upload client
	const metrics: UploadMetrics = {
		getInsights: () => uploadistaClient.client.getChunkingInsights(),
		exportMetrics: () => uploadistaClient.client.exportMetrics(),
		getNetworkMetrics: () => uploadistaClient.client.getNetworkMetrics(),
		getNetworkCondition: () => uploadistaClient.client.getNetworkCondition(),
		resetMetrics: () => uploadistaClient.client.resetMetrics(),
	};

	return {
		state,
		upload,
		abort,
		reset,
		retry,
		isUploading,
		canRetry,
		metrics,
	};
}
