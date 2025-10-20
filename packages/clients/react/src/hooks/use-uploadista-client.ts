import {
  createUploadistaClient,
  type UploadistaClientOptions,
} from "@uploadista/client-browser";
import { useMemo, useRef } from "react";

export interface UseUploadistaClientOptions extends UploadistaClientOptions {
  /**
   * Global event handler for all upload and flow events from this client
   */
  onEvent?: UploadistaClientOptions["onEvent"];
}

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
 * React hook for creating and managing an upload client instance.
 * The client instance is stable across re-renders and only recreated
 * when essential configuration changes.
 *
 * @param options - Upload client configuration options
 * @returns Object containing the client instance and configuration
 *
 * @example
 * ```tsx
 * const { client } = useUploadistaClient({
 *   baseUrl: 'https://api.example.com',
 *   storageId: 'my-storage',
 *   chunkSize: 1024 * 1024, // 1MB
 *   storeFingerprintForResuming: true,
 *   onEvent: (event) => {
 *     console.log('Upload event:', event);
 *   }
 * });
 * ```
 */
export function useUploadistaClient(
  options: UseUploadistaClientOptions,
): UseUploadistaClientReturn {
  // Store the options in a ref to enable stable dependency checking
  const optionsRef = useRef<UseUploadistaClientOptions>(options);

  // Update ref on each render but only create new client when essential deps change
  optionsRef.current = options;

  // Create client instance with stable identity
  const client = useMemo(() => {
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
  }, [options]);

  return {
    client,
    config: options,
  };
}
