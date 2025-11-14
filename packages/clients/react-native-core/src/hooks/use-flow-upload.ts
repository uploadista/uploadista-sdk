import type {
  FlowManager,
  FlowUploadState,
  FlowUploadStatus,
} from "@uploadista/client-core";
import type { TypedOutput } from "@uploadista/core/flow";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFlowManagerContext } from "../contexts/flow-manager-context";
import type { FilePickResult, UseFlowUploadOptions } from "../types";
import { createBlobFromBuffer } from "../types/platform-types";
import { useUploadistaContext } from "./use-uploadista-context";

// Re-export types from core for convenience
export type { FlowUploadState, FlowUploadStatus };

const initialState: FlowUploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  error: null,
  jobId: null,
  flowStarted: false,
  currentNodeName: null,
  currentNodeType: null,
  flowOutputs: null,
};

/**
 * Hook for uploading files through a flow pipeline with full state management.
 * Provides upload progress tracking, flow execution monitoring, error handling, and abort functionality.
 *
 * Must be used within FlowManagerProvider (which must be within UploadistaProvider).
 * Flow events are automatically routed by the provider to the appropriate manager.
 *
 * @param options - Flow upload configuration
 * @returns Flow upload state and control methods
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const flowUpload = useFlowUpload({
 *     flowId: 'image-processing-flow',
 *     storageId: 'my-storage',
 *     onSuccess: (result) => console.log('Flow complete:', result),
 *     onError: (error) => console.error('Flow failed:', error),
 *     onProgress: (progress) => console.log('Progress:', progress + '%'),
 *   });
 *
 *   const handlePickFile = async () => {
 *     const file = await fileSystemProvider.pickDocument();
 *     if (file) {
 *       await flowUpload.upload(file);
 *     }
 *   };
 *
 *   return (
 *     <View>
 *       <Button title="Pick File" onPress={handlePickFile} />
 *       {flowUpload.isUploading && <Text>Progress: {flowUpload.state.progress}%</Text>}
 *       {flowUpload.state.jobId && <Text>Job ID: {flowUpload.state.jobId}</Text>}
 *       {flowUpload.state.error && <Text>Error: {flowUpload.state.error.message}</Text>}
 *       <Button title="Abort" onPress={flowUpload.abort} disabled={!flowUpload.isActive} />
 *     </View>
 *   );
 * }
 * ```
 */
export function useFlowUpload(options: UseFlowUploadOptions) {
  const { getManager, releaseManager } = useFlowManagerContext();
  const { fileSystemProvider } = useUploadistaContext();
  const [state, setState] = useState<FlowUploadState>(initialState);
  const managerRef = useRef<FlowManager<unknown> | null>(null);
  const lastFileRef = useRef<FilePickResult | null>(null);

  // Store callbacks in refs so they can be updated without recreating the manager
  const callbacksRef = useRef(options);

  // Update refs on every render to capture latest callbacks
  useEffect(() => {
    callbacksRef.current = options;
  });

  // Get or create manager from context when component mounts
  // Manager lifecycle is now handled by FlowManagerProvider
  useEffect(() => {
    const flowId = options.flowId;

    // Create stable callback wrappers that call the latest callbacks via refs
    const stableCallbacks = {
      onStateChange: setState,
      onProgress: (
        _uploadId: string,
        bytesUploaded: number,
        totalBytes: number | null,
      ) => {
        if (callbacksRef.current.onProgress) {
          const progress = totalBytes
            ? Math.round((bytesUploaded / totalBytes) * 100)
            : 0;
          callbacksRef.current.onProgress(progress, bytesUploaded, totalBytes);
        }
      },
      onChunkComplete: (
        chunkSize: number,
        bytesAccepted: number,
        bytesTotal: number | null,
      ) => {
        callbacksRef.current.onChunkComplete?.(
          chunkSize,
          bytesAccepted,
          bytesTotal,
        );
      },
      onFlowComplete: (outputs: TypedOutput[]) => {
        callbacksRef.current.onFlowComplete?.(outputs);
      },
      onSuccess: (outputs: TypedOutput[]) => {
        callbacksRef.current.onSuccess?.(outputs);
      },
      onError: (error: Error) => {
        callbacksRef.current.onError?.(error);
      },
      onAbort: () => {
        // onAbort is not exposed in the public API
      },
    };

    // Get manager from context (creates if doesn't exist, increments ref count)
    managerRef.current = getManager(flowId, stableCallbacks, {
      flowConfig: {
        flowId: options.flowId,
        storageId: options.storageId,
        outputNodeId: options.outputNodeId,
        metadata: options.metadata as Record<string, string> | undefined,
      },
      onChunkComplete: options.onChunkComplete,
      onSuccess: options.onSuccess,
      onError: options.onError,
    });

    // Release manager when component unmounts or flowId changes
    return () => {
      releaseManager(flowId);
      managerRef.current = null;
    };
  }, [
    options.flowId,
    options.storageId,
    options.outputNodeId,
    getManager,
    releaseManager,
  ]);

  const upload = useCallback(
    async (file: FilePickResult) => {
      // Handle cancelled picker
      if (file.status === "cancelled") {
        return;
      }

      // Handle picker error
      if (file.status === "error") {
        options.onError?.(file.error);
        return;
      }

      lastFileRef.current = file;

      try {
        // Read file content
        const fileContent = await fileSystemProvider.readFile(file.data.uri);

        // Create a Blob from the file content using platform-aware utility
        // Handles differences between React Native and browser Blob APIs
        const blob = createBlobFromBuffer(fileContent, {
          type: file.data.mimeType || "application/octet-stream",
        });

        // Start the upload using the manager
        await managerRef.current?.upload(blob);
      } catch (error) {
        options.onError?.(error as Error);
      }
    },
    [fileSystemProvider, options],
  );

  const reset = useCallback(() => {
    managerRef.current?.reset();
    lastFileRef.current = null;
  }, []);

  const abort = useCallback(() => {
    managerRef.current?.abort();
  }, []);

  const retry = useCallback(() => {
    if (
      lastFileRef.current &&
      (state.status === "error" || state.status === "aborted")
    ) {
      upload(lastFileRef.current);
    }
  }, [upload, state.status]);

  // Derive computed values from state (reactive to state changes)
  const isActive =
    state.status === "uploading" || state.status === "processing";
  const canRetry =
    (state.status === "error" || state.status === "aborted") &&
    lastFileRef.current !== null;

  return {
    state,
    upload,
    abort,
    reset,
    retry,
    isActive,
    canRetry,
  };
}
