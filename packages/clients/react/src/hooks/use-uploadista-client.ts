import {
  createUploadistaClient,
  type UploadistaClientOptions,
} from "@uploadista/client-browser";
import { useMemo, useRef } from "react";

/**
 * Configuration options for the uploadista client hook.
 * Extends the base client options with React-specific behavior.
 *
 * @property onEvent - Global event handler for all upload and flow events
 * @property baseUrl - API base URL for uploads
 * @property storageId - Default storage identifier
 * @property chunkSize - Size of upload chunks in bytes
 * @property storeFingerprintForResuming - Enable resumable uploads
 * @property retryDelays - Array of retry delays in milliseconds
 * @property parallelUploads - Maximum number of parallel uploads
 * @property uploadStrategy - Upload strategy (sequential, parallel, adaptive)
 * @property smartChunking - Enable dynamic chunk size adjustment
 * @property networkMonitoring - Enable network condition monitoring
 */
export interface UseUploadistaClientOptions extends UploadistaClientOptions {
  /**
   * Global event handler for all upload and flow events from this client
   */
  onEvent?: UploadistaClientOptions["onEvent"];
}

/**
 * Return value from the useUploadistaClient hook.
 *
 * @property client - Configured uploadista client instance (stable across re-renders)
 * @property config - Current client configuration options
 */
export interface UseUploadistaClientReturn {
  /**
   * The uploadista client instance
   */
  client: ReturnType<typeof createUploadistaClient>;

  /**
   * Current configuration of the client
   */
  config: UseUploadistaClientOptions;
}

/**
 * React hook for creating and managing an uploadista client instance.
 * The client instance is memoized and stable across re-renders, only being
 * recreated when configuration options change.
 *
 * This hook is typically used internally by UploadistaProvider, but can be
 * used directly for advanced use cases requiring multiple client instances.
 *
 * @param options - Upload client configuration options
 * @returns Object containing the stable client instance and current configuration
 *
 * @example
 * ```tsx
 * // Basic client setup
 * function MyUploadComponent() {
 *   const { client, config } = useUploadistaClient({
 *     baseUrl: 'https://api.example.com',
 *     storageId: 'default-storage',
 *     chunkSize: 1024 * 1024, // 1MB chunks
 *     storeFingerprintForResuming: true,
 *     onEvent: (event) => {
 *       console.log('Upload event:', event);
 *     }
 *   });
 *
 *   // Use client directly
 *   const handleUpload = async (file: File) => {
 *     await client.upload(file, {
 *       onSuccess: (result) => console.log('Uploaded:', result),
 *       onError: (error) => console.error('Failed:', error),
 *     });
 *   };
 *
 *   return <FileUploader onUpload={handleUpload} />;
 * }
 *
 * // Advanced: Multiple clients with different configurations
 * function MultiClientComponent() {
 *   // Client for image uploads
 *   const imageClient = useUploadistaClient({
 *     baseUrl: 'https://images.example.com',
 *     storageId: 'images',
 *     chunkSize: 2 * 1024 * 1024, // 2MB for images
 *   });
 *
 *   // Client for document uploads
 *   const docClient = useUploadistaClient({
 *     baseUrl: 'https://docs.example.com',
 *     storageId: 'documents',
 *     chunkSize: 512 * 1024, // 512KB for documents
 *   });
 *
 *   return (
 *     <div>
 *       <ImageUploader client={imageClient.client} />
 *       <DocumentUploader client={docClient.client} />
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link UploadistaProvider} for the recommended way to provide client context
 */
export function useUploadistaClient(
  options: UseUploadistaClientOptions,
): UseUploadistaClientReturn {
  // Store the options in a ref to enable stable dependency checking
  const optionsRef = useRef<UseUploadistaClientOptions>(options);

  // Update ref on each render but only create new client when essential deps change
  optionsRef.current = options;

  // Create client instance with stable identity
  // IMPORTANT: We depend on individual config values, not the entire options object,
  // to prevent unnecessary client recreation when the options object reference changes
  const client = useMemo(() => {
    console.log("[useUploadistaClient] Creating NEW client instance with onEvent:", options.onEvent);
    return createUploadistaClient({
      baseUrl: options.baseUrl,
      storageId: options.storageId,
      uploadistaBasePath: options.uploadistaBasePath,
      chunkSize: options.chunkSize,
      storeFingerprintForResuming: options.storeFingerprintForResuming,
      retryDelays: options.retryDelays,
      parallelUploads: options.parallelUploads,
      parallelChunkSize: options.parallelChunkSize,
      uploadStrategy: options.uploadStrategy,
      smartChunking: options.smartChunking,
      networkMonitoring: options.networkMonitoring,
      uploadMetrics: options.uploadMetrics,
      connectionPooling: options.connectionPooling,
      // logger: options.logger,
      auth: options.auth,
      onEvent: options.onEvent,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    options.baseUrl,
    options.storageId,
    options.uploadistaBasePath,
    options.chunkSize,
    options.storeFingerprintForResuming,
    options.retryDelays,
    options.parallelUploads,
    options.parallelChunkSize,
    options.uploadStrategy,
    options.smartChunking,
    options.networkMonitoring,
    options.uploadMetrics,
    options.connectionPooling,
    options.auth,
    options.onEvent,
  ]);

  return {
    client,
    config: options,
  };
}
