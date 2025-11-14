import { UploadEventType, type UploadEvent } from "@uploadista/core/types";
import { useEffect } from "react";
import { useUploadistaContext } from "../components/uploadista-provider";
import { isUploadEvent } from "./event-utils";

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
 * Structured hook for handling upload events with type-safe callbacks.
 *
 * This hook provides a clean API for listening to specific upload events without
 * needing to manually filter events or use type guards.
 *
 * Must be used within UploadistaProvider.
 *
 * @param options - Object with optional callbacks for each upload event type
 *
 * @example
 * ```tsx
 * import { useUploadEvents } from '@uploadista/react';
 *
 * function UploadMonitor() {
 *   useUploadEvents({
 *     onUploadStarted: (data) => {
 *       console.log('Upload started:', data.id);
 *     },
 *     onUploadProgress: (data) => {
 *       const percent = (data.progress / data.total) * 100;
 *       console.log(`Upload progress: ${percent}%`);
 *     },
 *     onUploadComplete: (data) => {
 *       console.log('Upload completed:', data);
 *     },
 *     onUploadFailed: (data) => {
 *       console.error('Upload failed:', data.error);
 *     },
 *   });
 *
 *   return <div>Monitoring uploads...</div>;
 * }
 * ```
 */
export function useUploadEvents(options: UseUploadEventsOptions): void {
  const { subscribeToEvents } = useUploadistaContext();

  useEffect(() => {
    const unsubscribe = subscribeToEvents((event) => {
      // Only handle upload events
      if (!isUploadEvent(event)) return;

      // Route to appropriate callback based on event type
      switch (event.type) {
        case UploadEventType.UPLOAD_STARTED:
          options.onUploadStarted?.(
            event.data as unknown as UploadFileEventData,
          );
          break;
        case UploadEventType.UPLOAD_PROGRESS:
          options.onUploadProgress?.(
            event.data as unknown as UploadProgressEventData,
          );
          break;
        case UploadEventType.UPLOAD_COMPLETE:
          options.onUploadComplete?.(
            event.data as unknown as UploadFileEventData,
          );
          break;
        case UploadEventType.UPLOAD_FAILED:
          options.onUploadFailed?.(
            event.data as unknown as UploadFailedEventData,
          );
          break;
        case UploadEventType.UPLOAD_VALIDATION_SUCCESS:
          options.onUploadValidationSuccess?.(
            event.data as unknown as UploadValidationSuccessEventData,
          );
          break;
        case UploadEventType.UPLOAD_VALIDATION_FAILED:
          options.onUploadValidationFailed?.(
            event.data as unknown as UploadValidationFailedEventData,
          );
          break;
        case UploadEventType.UPLOAD_VALIDATION_WARNING:
          options.onUploadValidationWarning?.(
            event.data as unknown as UploadValidationWarningEventData,
          );
          break;
      }
    });

    return unsubscribe;
  }, [subscribeToEvents, options]);
}
