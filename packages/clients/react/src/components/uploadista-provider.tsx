"use client";
import type { UploadistaEvent } from "@uploadista/client-browser";
import type React from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { FlowManagerProvider } from "../contexts/flow-manager-context";
import {
  type UseUploadistaClientOptions,
  type UseUploadistaClientReturn,
  useUploadistaClient,
} from "../hooks/use-uploadista-client";

/**
 * Props for the UploadistaProvider component.
 * Combines client configuration options with React children.
 *
 * @property children - React components that will have access to the upload client context
 * @property baseUrl - API base URL for uploads
 * @property storageId - Default storage identifier
 * @property chunkSize - Upload chunk size in bytes
 * @property ... - All other UploadistaClientOptions
 */
export interface UploadistaProviderProps
  extends Omit<UseUploadistaClientOptions, "onEvent"> {
  /**
   * Children components that will have access to the upload client
   */
  children: React.ReactNode;
}

type UploadistaContextValue = UseUploadistaClientReturn & {
  /**
   * Subscribe to events (used internally by hooks)
   * @internal
   */
  subscribeToEvents: (handler: (event: UploadistaEvent) => void) => () => void;
};

const UploadistaContext = createContext<UploadistaContextValue | null>(null);

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

  // Event handler that broadcasts to all subscribers
  const handleEvent = useCallback((event: UploadistaEvent) => {
    // Broadcast to all subscribers
    eventSubscribersRef.current.forEach((handler) => {
      try {
        handler(event);
      } catch (err) {
        console.error("Error in event subscriber:", err);
      }
    });
  }, []);

  const uploadClient = useUploadistaClient({
    ...options,
    onEvent: handleEvent,
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
  const contextValue = useMemo(
    () => ({
      ...uploadClient,
      subscribeToEvents,
    }),
    [uploadClient, subscribeToEvents],
  );

  return (
    <UploadistaContext.Provider value={contextValue}>
      <FlowManagerProvider>{children}</FlowManagerProvider>
    </UploadistaContext.Provider>
  );
}

/**
 * Hook to access the uploadista client from the UploadistaProvider context.
 * Must be used within an UploadistaProvider component.
 *
 * @returns Upload client instance from context
 * @throws Error if used outside of UploadistaProvider
 *
 * @example
 * ```tsx
 * function FileUploader() {
 *   const uploadClient = useUploadistaContext();
 *   const upload = useUpload(uploadClient);
 *
 *   return (
 *     <button
 *       onClick={() => {
 *         const input = document.createElement('input');
 *         input.type = 'file';
 *         input.onchange = (e) => {
 *           const file = (e.target as HTMLInputElement).files?.[0];
 *           if (file) upload.upload(file);
 *         };
 *         input.click();
 *       }}
 *     >
 *       Upload File
 *     </button>
 *   );
 * }
 * ```
 */
export function useUploadistaContext(): UploadistaContextValue {
  const context = useContext(UploadistaContext);

  if (context === null) {
    throw new Error(
      "useUploadistaContext must be used within an UploadistaProvider. " +
        "Make sure to wrap your component tree with <UploadistaProvider>.",
    );
  }

  return context;
}
