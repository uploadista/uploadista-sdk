/**
 * Configuration for uploading a file through a flow pipeline.
 *
 * Flows enable processing uploaded files through a sequence of transformation
 * nodes (e.g., image resize, format conversion, validation) before final storage.
 *
 * @example Basic flow upload
 * ```typescript
 * const config: FlowUploadConfig = {
 *   flowId: 'image-optimization',
 *   storageId: 'processed-images',
 * };
 *
 * await client.uploadWithFlow(file, config, {
 *   onProgress: (progress) => console.log(`${progress}%`),
 *   onSuccess: (result) => console.log('Processed:', result),
 * });
 * ```
 *
 * @example With specific output node
 * ```typescript
 * const config: FlowUploadConfig = {
 *   flowId: 'multi-format-conversion',
 *   storageId: 'images',
 *   outputNodeId: 'webp-output', // Get WebP version instead of first output
 *   metadata: {
 *     userId: '123',
 *     album: 'vacation-2024',
 *   },
 * };
 * ```
 */
export type FlowUploadConfig = {
  /** Unique identifier of the flow to execute */
  flowId: string;

  /** Storage backend where flow outputs will be saved */
  storageId: string;

  /**
   * Specify which output node to use for single-value callbacks like onSuccess.
   *
   * For flows with multiple output nodes, this determines which output
   * is passed to the onSuccess callback. If not specified, uses the first
   * output node. The onFlowComplete callback receives all outputs regardless.
   */
  outputNodeId?: string;

  /**
   * Additional metadata to attach to the upload and flow execution.
   *
   * This metadata is stored with the upload and can be used for tracking,
   * filtering, or providing context to flow nodes.
   */
  metadata?: Record<string, string>;
};
