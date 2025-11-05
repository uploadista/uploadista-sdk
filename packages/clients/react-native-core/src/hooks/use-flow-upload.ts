import type { UploadFile } from "@uploadista/core/types";
import { useCallback, useRef, useState } from "react";
import type { FilePickResult, UseFlowUploadOptions } from "../types";
import { useUploadistaContext } from "./use-uploadista-context";

export type FlowUploadStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "success"
  | "error"
  | "aborted";

export interface FlowUploadState {
  status: FlowUploadStatus;
  progress: number;
  bytesUploaded: number;
  totalBytes: number | null;
  jobId: string | null;
  error: Error | null;
  result: unknown | null;
}

const initialState: FlowUploadState = {
  status: "idle",
  progress: 0,
  bytesUploaded: 0,
  totalBytes: null,
  jobId: null,
  error: null,
  result: null,
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
  const abortControllerRef = useRef<{ abort: () => void } | null>(null);
  const lastFileRef = useRef<FilePickResult | null>(null);

  const updateState = useCallback((update: Partial<FlowUploadState>) => {
    setState((prev) => ({ ...prev, ...update }));
  }, []);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(initialState);
    lastFileRef.current = null;
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    updateState({
      status: "aborted",
    });
  }, [updateState]);

  const upload = useCallback(
    async (file: FilePickResult) => {
      // Handle cancelled picker
      if (file.status === "cancelled") {
        return;
      }

      // Handle picker error
      if (file.status === "error") {
        updateState({
          status: "error",
          error: file.error,
        });
        options.onError?.(file.error);
        return;
      }

      // Reset any previous state
      setState({
        ...initialState,
        status: "uploading",
        totalBytes: file.data.size,
      });

      lastFileRef.current = file;

      try {
        // Read file content
        const fileContent = await fileSystemProvider.readFile(file.data.uri);

        // Create a Blob from the file content
        // Convert ArrayBuffer to Uint8Array for better compatibility
        const data =
          fileContent instanceof ArrayBuffer
            ? new Uint8Array(fileContent)
            : fileContent;
        // Note: Using any cast here because React Native Blob accepts BufferSource
        // but TypeScript's lib.dom.d.ts Blob type doesn't include it
        // biome-ignore lint/suspicious/noExplicitAny: React Native Blob accepts BufferSource
        const blob = new Blob([data as any], {
          type: file.data.mimeType || "application/octet-stream",
          // biome-ignore lint/suspicious/noExplicitAny: BlobPropertyBag type differs by platform
        } as any);

        // use the Blob (for React Native)
        const uploadInput = blob;

        // Start the flow upload using the client
        const uploadPromise = client.uploadWithFlow(
          uploadInput,
          {
            flowId: options.flowId,
            storageId: options.storageId,
            outputNodeId: options.outputNodeId,
            metadata: options.metadata as Record<string, string> | undefined,
          },
          {
            onJobStart: () => {
              updateState({
                status: "processing",
              });
            },

            onProgress: (
              _uploadId: string,
              bytesUploaded: number,
              totalBytes: number | null,
            ) => {
              const progress = totalBytes
                ? Math.round((bytesUploaded / totalBytes) * 100)
                : 0;

              updateState({
                progress,
                bytesUploaded,
                totalBytes,
              });

              options.onProgress?.(progress, bytesUploaded, totalBytes);
            },

            onChunkComplete: (
              chunkSize: number,
              bytesAccepted: number,
              bytesTotal: number | null,
            ) => {
              options.onChunkComplete?.(chunkSize, bytesAccepted, bytesTotal);
            },

            onSuccess: (result: UploadFile) => {
              updateState({
                status: "success",
                result,
                progress: 100,
                bytesUploaded: result.size || 0,
                totalBytes: result.size || null,
              });

              options.onSuccess?.(result);
              abortControllerRef.current = null;
            },

            onError: (error: Error) => {
              updateState({
                status: "error",
                error,
              });

              options.onError?.(error);
              abortControllerRef.current = null;
            },
          },
        );

        // Handle the promise to get the abort controller
        const controller = await uploadPromise;
        abortControllerRef.current = controller;
      } catch (error) {
        updateState({
          status: "error",
          error: error as Error,
        });

        options.onError?.(error as Error);
        abortControllerRef.current = null;
      }
    },
    [client, fileSystemProvider, options, updateState],
  );

  const retry = useCallback(() => {
    if (
      lastFileRef.current &&
      (state.status === "error" || state.status === "aborted")
    ) {
      upload(lastFileRef.current);
    }
  }, [upload, state.status]);

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
