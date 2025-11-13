import {
  FlowManager,
  type FlowUploadState,
  type FlowUploadStatus,
  type InternalFlowUploadOptions,
} from "@uploadista/client-core";
import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
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
  result: null,
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
 * Must be used within an UploadistaProvider.
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
  const { client, fileSystemProvider } = useUploadistaContext();
  const [state, setState] = useState<FlowUploadState>(initialState);
  const managerRef = useRef<FlowManager<Blob, UploadFile> | null>(null);
  const lastFileRef = useRef<FilePickResult | null>(null);

  // Create FlowManager instance
  useEffect(() => {
    managerRef.current = new FlowManager(
      async (
        blob: Blob,
        flowConfig: {
          flowId: string;
          storageId: string;
          outputNodeId?: string;
          metadata?: Record<string, string>;
        },
        internalOptions: InternalFlowUploadOptions,
      ) => {
        const result = await client.uploadWithFlow(blob, flowConfig, {
          onJobStart: internalOptions.onJobStart,
          onProgress: internalOptions.onProgress,
          onChunkComplete: internalOptions.onChunkComplete,
          onSuccess: internalOptions.onSuccess,
          onError: internalOptions.onError,
          onShouldRetry: internalOptions.onShouldRetry,
        });
        // Return only abort and pause (ignore jobId and return value)
        return {
          abort: async () => {
            await result.abort();
          },
          pause: async () => {
            await result.pause();
            // Ignore the FlowJob return value
          },
        };
      },
      {
        onStateChange: setState,
        onProgress: options.onProgress
          ? (_uploadId, bytesUploaded, totalBytes) => {
              const progress = totalBytes
                ? Math.round((bytesUploaded / totalBytes) * 100)
                : 0;
              options.onProgress?.(progress, bytesUploaded, totalBytes);
            }
          : undefined,
        onChunkComplete: options.onChunkComplete,
        onSuccess: options.onSuccess,
        onError: options.onError,
      },
      {
        flowConfig: {
          flowId: options.flowId,
          storageId: options.storageId,
          outputNodeId: options.outputNodeId,
          metadata: options.metadata as Record<string, string> | undefined,
        },
        onChunkComplete: options.onChunkComplete,
        onSuccess: options.onSuccess,
        onError: options.onError,
      },
    );

    return () => {
      managerRef.current?.cleanup();
    };
  }, [client, options]);

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

  const isActive = managerRef.current?.isUploading() ?? false;
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
