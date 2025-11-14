import type { UploadistaEvent } from "@uploadista/client-browser";
import { EventType, type FlowEvent } from "@uploadista/core/flow";
import { UploadEventType, type UploadEvent } from "@uploadista/core/types";

/**
 * Type guard to check if an event is a flow event
 */
export function isFlowEvent(event: UploadistaEvent): event is FlowEvent {
  const flowEvent = event as FlowEvent;
  return (
    flowEvent.eventType === EventType.JobStart ||
    flowEvent.eventType === EventType.JobEnd ||
    flowEvent.eventType === EventType.FlowStart ||
    flowEvent.eventType === EventType.FlowEnd ||
    flowEvent.eventType === EventType.FlowError ||
    flowEvent.eventType === EventType.FlowPause ||
    flowEvent.eventType === EventType.FlowCancel ||
    flowEvent.eventType === EventType.NodeStart ||
    flowEvent.eventType === EventType.NodeEnd ||
    flowEvent.eventType === EventType.NodePause ||
    flowEvent.eventType === EventType.NodeResume ||
    flowEvent.eventType === EventType.NodeError ||
    flowEvent.eventType === EventType.NodeStream ||
    flowEvent.eventType === EventType.NodeResponse
  );
}

/**
 * Type guard to check if an event is an upload event
 */
export function isUploadEvent(event: UploadistaEvent): event is UploadEvent {
  const uploadEvent = event as UploadEvent;
  return (
    uploadEvent.type === UploadEventType.UPLOAD_STARTED ||
    uploadEvent.type === UploadEventType.UPLOAD_PROGRESS ||
    uploadEvent.type === UploadEventType.UPLOAD_COMPLETE ||
    uploadEvent.type === UploadEventType.UPLOAD_FAILED ||
    uploadEvent.type === UploadEventType.UPLOAD_VALIDATION_SUCCESS ||
    uploadEvent.type === UploadEventType.UPLOAD_VALIDATION_FAILED ||
    uploadEvent.type === UploadEventType.UPLOAD_VALIDATION_WARNING
  );
}
