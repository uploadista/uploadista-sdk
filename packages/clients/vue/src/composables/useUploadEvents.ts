import type { UploadistaEvent } from "@uploadista/client-browser";
import { UploadEventType } from "@uploadista/core/types";
import { onBeforeUnmount, onMounted } from "vue";
import { isUploadEvent } from "./eventUtils";
import { useUploadistaClient } from "./useUploadistaClient";

/**
 * Upload progress event data
 */
export interface UploadProgressEventData {
  id: string;
  progress: number;
  total: number;
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
}

/**
 * Upload started/complete event data (contains full UploadFile)
 */
export interface UploadFileEventData {
  // This will contain the full UploadFile schema
  [key: string]: unknown;
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
}

/**
 * Upload failed event data
 */
export interface UploadFailedEventData {
  id: string;
  error: string;
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
}

/**
 * Upload validation success event data
 */
export interface UploadValidationSuccessEventData {
  id: string;
  validationType: "checksum" | "mimetype";
  algorithm?: string;
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
}

/**
 * Upload validation failed event data
 */
export interface UploadValidationFailedEventData {
  id: string;
  reason: string;
  expected: string;
  actual: string;
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
}

/**
 * Upload validation warning event data
 */
export interface UploadValidationWarningEventData {
  id: string;
  message: string;
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
}

/**
 * Options for handling upload events.
 *
 * All callbacks are optional - only provide handlers for events you care about.
 */
export interface UseUploadEventsOptions {
  /** Called when an upload starts */
  onUploadStarted?: (data: UploadFileEventData) => void;
  /** Called with upload progress updates */
  onUploadProgress?: (data: UploadProgressEventData) => void;
  /** Called when an upload completes successfully */
  onUploadComplete?: (data: UploadFileEventData) => void;
  /** Called when an upload fails */
  onUploadFailed?: (data: UploadFailedEventData) => void;
  /** Called when upload validation succeeds */
  onUploadValidationSuccess?: (data: UploadValidationSuccessEventData) => void;
  /** Called when upload validation fails */
  onUploadValidationFailed?: (data: UploadValidationFailedEventData) => void;
  /** Called when upload validation produces a warning */
  onUploadValidationWarning?: (data: UploadValidationWarningEventData) => void;
}

/**
 * Structured composable for handling upload events with type-safe callbacks.
 *
 * This composable provides a clean API for listening to specific upload events without
 * needing to manually filter events or use type guards.
 *
 * Must be used within UploadistaProvider.
 *
 * @param options - Object with optional callbacks for each upload event type
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useUploadEvents } from '@uploadista/vue';
 *
 * useUploadEvents({
 *   onUploadStarted: (data) => {
 *     console.log('Upload started:', data.id);
 *   },
 *   onUploadProgress: (data) => {
 *     const percent = (data.progress / data.total) * 100;
 *     console.log(`Upload progress: ${percent}%`);
 *   },
 *   onUploadComplete: (data) => {
 *     console.log('Upload completed:', data);
 *   },
 *   onUploadFailed: (data) => {
 *     console.error('Upload failed:', data.error);
 *   },
 * });
 * </script>
 *
 * <template>
 *   <div>Monitoring uploads...</div>
 * </template>
 * ```
 */
export function useUploadEvents(options: UseUploadEventsOptions): void {
  const { subscribeToEvents } = useUploadistaClient();
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    unsubscribe = subscribeToEvents((event: UploadistaEvent) => {
      // Only handle upload events
      if (!isUploadEvent(event)) return;

      // Route to appropriate callback based on event type
      // Note: flow context is at the top level of the event, not inside data
      const flowContext = "flow" in event ? event.flow : undefined;

      switch (event.type) {
        case UploadEventType.UPLOAD_STARTED:
          options.onUploadStarted?.({
            ...(event.data as unknown as Omit<UploadFileEventData, "flow">),
            flow: flowContext,
          });
          break;
        case UploadEventType.UPLOAD_PROGRESS:
          options.onUploadProgress?.({
            ...(event.data as unknown as Omit<UploadProgressEventData, "flow">),
            flow: flowContext,
          });
          break;
        case UploadEventType.UPLOAD_COMPLETE:
          options.onUploadComplete?.({
            ...(event.data as unknown as Omit<UploadFileEventData, "flow">),
            flow: flowContext,
          });
          break;
        case UploadEventType.UPLOAD_FAILED:
          options.onUploadFailed?.({
            ...(event.data as unknown as Omit<UploadFailedEventData, "flow">),
            flow: flowContext,
          });
          break;
        case UploadEventType.UPLOAD_VALIDATION_SUCCESS:
          options.onUploadValidationSuccess?.({
            ...(event.data as unknown as Omit<
              UploadValidationSuccessEventData,
              "flow"
            >),
            flow: flowContext,
          });
          break;
        case UploadEventType.UPLOAD_VALIDATION_FAILED:
          options.onUploadValidationFailed?.({
            ...(event.data as unknown as Omit<
              UploadValidationFailedEventData,
              "flow"
            >),
            flow: flowContext,
          });
          break;
        case UploadEventType.UPLOAD_VALIDATION_WARNING:
          options.onUploadValidationWarning?.({
            ...(event.data as unknown as Omit<
              UploadValidationWarningEventData,
              "flow"
            >),
            flow: flowContext,
          });
          break;
      }
    });
  });

  onBeforeUnmount(() => {
    unsubscribe?.();
  });
}
