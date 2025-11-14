import type { UploadistaEvent } from "@uploadista/client-browser";
import { EventType, type FlowEvent } from "@uploadista/core/flow";
import { UploadEventType, type UploadEvent } from "@uploadista/core/types";

/**
 * Type guard to check if an event is a flow event
 */
export function isFlowEvent(event: UploadistaEvent): event is FlowEvent {
  if (!("eventType" in event)) return false;
  const e = event as { eventType: unknown };
  return (
    e.eventType === EventType.JobStart ||
    e.eventType === EventType.JobEnd ||
    e.eventType === EventType.FlowStart ||
    e.eventType === EventType.FlowEnd ||
    e.eventType === EventType.FlowError ||
    e.eventType === EventType.FlowPause ||
    e.eventType === EventType.FlowCancel ||
    e.eventType === EventType.NodeStart ||
    e.eventType === EventType.NodeEnd ||
    e.eventType === EventType.NodePause ||
    e.eventType === EventType.NodeResume ||
    e.eventType === EventType.NodeError ||
    e.eventType === EventType.NodeStream ||
    e.eventType === EventType.NodeResponse
  );
}

/**
 * Type guard to check if an event is an upload event
 */
export function isUploadEvent(event: UploadistaEvent): event is UploadEvent {
  if (!("type" in event)) return false;
  const e = event as { type: unknown };
  return (
    e.type === UploadEventType.UPLOAD_STARTED ||
    e.type === UploadEventType.UPLOAD_PROGRESS ||
    e.type === UploadEventType.UPLOAD_COMPLETE ||
    e.type === UploadEventType.UPLOAD_FAILED ||
    e.type === UploadEventType.UPLOAD_VALIDATION_SUCCESS ||
    e.type === UploadEventType.UPLOAD_VALIDATION_FAILED ||
    e.type === UploadEventType.UPLOAD_VALIDATION_WARNING
  );
}
