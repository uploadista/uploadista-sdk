import type { FlowUploadConfig } from "./flow-upload-config";
import type { FlowUploadItem } from "./flow-upload-item";

export interface MultiFlowUploadOptions<UploadInput> {
  /**
   * Flow configuration
   */
  flowConfig: FlowUploadConfig;

  /**
   * Maximum number of concurrent uploads (default: 3)
   */
  maxConcurrent?: number;

  /**
   * Called when an individual upload progresses
   */
  onItemProgress?: (item: FlowUploadItem<UploadInput>) => void;

  /**
   * Called when an individual upload succeeds
   */
  onItemSuccess?: (item: FlowUploadItem<UploadInput>) => void;

  /**
   * Called when an individual upload fails
   */
  onItemError?: (item: FlowUploadItem<UploadInput>, error: Error) => void;

  /**
   * Called when all uploads complete
   */
  onComplete?: (items: FlowUploadItem<UploadInput>[]) => void;

  /**
   * Custom retry logic
   */
  onShouldRetry?: (error: Error, retryAttempt: number) => boolean;
}
