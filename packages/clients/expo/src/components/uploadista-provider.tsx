"use client";
import type { UploadistaEvent } from "@uploadista/client-core";
import { UploadistaContext } from "@uploadista/react-native-core";
import type { UploadistaContextType } from "@uploadista/react-native-core/hooks";
import type React from "react";
import { useCallback, useContext, useMemo, useRef } from "react";
import {
  type UseUploadistaClientOptions,
  useUploadistaClient,
} from "../hooks/use-uploadista-client";
import { ExpoFileSystemProvider } from "../services/expo-file-system-provider";

/**
 * Props for the UploadistaProvider component.
 * Combines client configuration options with React children.
 *
 * @property children - React components that will have access to the upload client context
 * @property baseUrl - API base URL for uploads
 * @property storageId - Default storage identifier
 * @property chunkSize - Upload chunk size in bytes
 * @property onEvent - Global event handler for all upload events
 * @property ... - All other UploadistaClientOptions
 */
export interface UploadistaProviderProps extends UseUploadistaClientOptions {
  /**
   * Children components that will have access to the upload client
   */
  children: React.ReactNode;
}

/**
 * Context provider that provides uploadista client functionality to child components.
 * This eliminates the need to pass upload client configuration down through props
 * and ensures a single, shared upload client instance across your application.
 *
 * @param props - Upload client options and children
 * @returns Provider component with upload client context
 *
 * @example
 * ```tsx
 * // Wrap your app with the upload provider
 * function App() {
 *   return (
 *     <UploadistaProvider
 *       baseUrl="https://api.example.com"
 *       storageId="my-storage"
 *       chunkSize={1024 * 1024} // 1MB chunks
 *       onEvent={(event) => {
 *         console.log('Global upload event:', event);
 *       }}
 *     >
 *       <UploadInterface />
 *     </UploadistaProvider>
 *   );
 * }
 *
 * // Use the upload client in any child component
 * function UploadInterface() {
 *   const uploadClient = useUploadistaContext();
 *   const upload = useUpload(uploadClient);
 *   const dragDrop = useDragDrop({
 *     onFilesReceived: (files) => {
 *       files.forEach(file => upload.upload(file));
 *     }
 *   });
 *
 *   return (
 *     <div {...dragDrop.dragHandlers}>
 *       <p>Drop files here to upload</p>
 *       {upload.isUploading && <p>Progress: {upload.state.progress}%</p>}
 *     </div>
 *   );
 * }
 * ```
 */
export function UploadistaProvider({
  children,
  ...options
}: UploadistaProviderProps) {
  const eventSubscribersRef = useRef<Set<(event: UploadistaEvent) => void>>(
    new Set(),
  );

  // Create file system provider instance (memoized to avoid recreation)
  const fileSystemProvider = useMemo(() => new ExpoFileSystemProvider(), []);

  // Wrap the original onEvent to broadcast to subscribers
  const wrappedOnEvent = useCallback(
    (event: UploadistaEvent) => {
      console.log("[UploadistaProvider] Received event:", event);

      // Call original handler if provided
      options.onEvent?.(event);

      // Broadcast to all subscribers
      console.log(
        "[UploadistaProvider] Broadcasting to",
        eventSubscribersRef.current.size,
        "subscribers",
      );
      eventSubscribersRef.current.forEach((handler) => {
        try {
          handler(event);
        } catch (err) {
          console.error("Error in event subscriber:", err);
        }
      });
    },
    [options.onEvent],
  );

  const uploadClient = useUploadistaClient({
    ...options,
    onEvent: wrappedOnEvent,
  });

  const subscribeToEvents = useCallback(
    (handler: (event: UploadistaEvent) => void) => {
      eventSubscribersRef.current.add(handler);
      return () => {
        eventSubscribersRef.current.delete(handler);
      };
    },
    [],
  );

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue: UploadistaContextType = useMemo(
    () => ({
      ...uploadClient,
      fileSystemProvider,
      subscribeToEvents,
      // Cast config to match react-native-core expectations (Expo options are compatible)
      // biome-ignore lint/suspicious/noExplicitAny: Type compatibility between Expo and RN Core client options
      config: uploadClient.config as any,
    }),
    [uploadClient, fileSystemProvider, subscribeToEvents],
  );

  return (
    <UploadistaContext.Provider value={contextValue}>
      {children}
    </UploadistaContext.Provider>
  );
}

/**
 * Hook to access the uploadista client from the UploadistaProvider context.
 * Must be used within an UploadistaProvider component.
 *
 * @returns Upload client instance from context including file system provider
 * @throws Error if used outside of UploadistaProvider
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const uploadContext = useUploadistaContext();
 *   const { client, fileSystemProvider } = uploadContext;
 *
 *   const handleFilePick = async () => {
 *     try {
 *       const result = await fileSystemProvider.pickDocument();
 *       await client.upload(result.uri);
 *     } catch (error) {
 *       console.error('Upload failed:', error);
 *     }
 *   };
 *
 *   return (
 *     <button onClick={handleFilePick}>
 *       Upload File
 *     </button>
 *   );
 * }
 * ```
 */
export function useUploadistaContext(): UploadistaContextType {
  const context = useContext(UploadistaContext);

  if (context === undefined) {
    throw new Error(
      "useUploadistaContext must be used within an UploadistaProvider. " +
        "Make sure to wrap your component tree with <UploadistaProvider>.",
    );
  }

  return context;
}
