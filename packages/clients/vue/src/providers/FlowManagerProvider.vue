<template>
  <slot />
</template>

<script setup lang="ts">
import type { BrowserUploadInput, UploadistaEvent } from "@uploadista/client-browser";
import {
  FlowManager,
  type FlowManagerCallbacks,
  type FlowUploadOptions,
} from "@uploadista/client-core";
import { EventType, type FlowEvent } from "@uploadista/core/flow";
import { UploadEventType } from "@uploadista/core/types";
import { onMounted, onBeforeUnmount, provide } from "vue";
import { useUploadistaClient } from "../composables/useUploadistaClient";

/**
 * Type guard to check if an event is a flow event
 */
function isFlowEvent(event: UploadistaEvent): event is FlowEvent {
  const flowEvent = event as FlowEvent;
  return (
    flowEvent.eventType === EventType.FlowStart ||
    flowEvent.eventType === EventType.FlowEnd ||
    flowEvent.eventType === EventType.FlowError ||
    flowEvent.eventType === EventType.NodeStart ||
    flowEvent.eventType === EventType.NodeEnd ||
    flowEvent.eventType === EventType.NodePause ||
    flowEvent.eventType === EventType.NodeResume ||
    flowEvent.eventType === EventType.NodeError
  );
}

/**
 * Internal manager registry entry with ref counting
 */
interface ManagerEntry {
  manager: FlowManager<unknown>;
  refCount: number;
  flowId: string;
}

/**
 * Context value providing access to flow managers
 */
interface FlowManagerContextValue {
  getManager: (
    flowId: string,
    callbacks: FlowManagerCallbacks,
    options: FlowUploadOptions,
  ) => FlowManager<unknown>;
  releaseManager: (flowId: string) => void;
}

const { client, subscribeToEvents } = useUploadistaClient();
const managers = new Map<string, ManagerEntry>();
let unsubscribe: (() => void) | null = null;

// Subscribe to events and route to managers
onMounted(() => {
  unsubscribe = subscribeToEvents((event: UploadistaEvent) => {
    // Route flow events to all managers (they filter by jobId internally)
    if (isFlowEvent(event)) {
      for (const entry of managers.values()) {
        entry.manager.handleFlowEvent(event);
      }
      return;
    }

    // Route upload progress events to all managers
    if (
      "type" in event &&
      event.type === UploadEventType.UPLOAD_PROGRESS &&
      "data" in event
    ) {
      const uploadEvent = event;

      for (const entry of managers.values()) {
        entry.manager.handleUploadProgress(
          uploadEvent.data.id,
          uploadEvent.data.progress,
          uploadEvent.data.total,
        );
      }
    }
  });
});

// Cleanup on unmount
onBeforeUnmount(() => {
  unsubscribe?.();
  for (const entry of managers.values()) {
    entry.manager.cleanup();
  }
  managers.clear();
});

const getManager = (
  flowId: string,
  callbacks: FlowManagerCallbacks,
  options: FlowUploadOptions,
): FlowManager<unknown> => {
  const existing = managers.get(flowId);

  if (existing) {
    // Increment ref count for existing manager
    existing.refCount++;
    return existing.manager;
  }

  // Create new manager
  const manager = new FlowManager<BrowserUploadInput>(
    client.uploadWithFlow,
    callbacks,
    options,
    client.multiInputFlowUpload,
  );

  managers.set(flowId, {
    manager,
    refCount: 1,
    flowId,
  });

  return manager;
};

const releaseManager = (flowId: string) => {
  const existing = managers.get(flowId);
  if (!existing) return;

  existing.refCount--;

  // Clean up when no more refs
  if (existing.refCount <= 0) {
    existing.manager.cleanup();
    managers.delete(flowId);
  }
};

// Provide the context
const flowManagerContext: FlowManagerContextValue = {
  getManager,
  releaseManager,
};

provide("flowManagerContext", flowManagerContext);
</script>
