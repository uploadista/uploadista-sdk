import type {
  createUploadistaClient,
  UploadistaClientOptions,
} from "../client";

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
