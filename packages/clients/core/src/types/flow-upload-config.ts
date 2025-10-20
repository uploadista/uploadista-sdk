export type FlowUploadConfig = {
  flowId: string;
  storageId: string;
  /**
   * Specify which output node to use for single-value callbacks like onSuccess
   * If not specified, uses the first output node
   */
  outputNodeId?: string;
  /**
   * Additional metadata to include with the upload
   */
  metadata?: Record<string, string>;
};
