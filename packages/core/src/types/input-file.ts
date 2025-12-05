import { z } from "zod";

/**
 * Zod schema for validating InputFile objects.
 *
 * This schema defines the structure and validation rules for file upload requests.
 * Use this schema to parse and validate input data when creating new uploads.
 *
 * @see {@link InputFile} for the TypeScript type
 */
export const inputFileSchema = z
  .object({
    uploadLengthDeferred: z.boolean().optional(),
    storageId: z.string(),
    /** File size in bytes. Optional when uploadLengthDeferred is true. */
    size: z.number().optional(),
    /** Optional size hint for optimization when size is unknown */
    sizeHint: z.number().optional(),
    type: z.string(),
    fileName: z.string().optional(),
    lastModified: z.number().optional(),
    metadata: z.string().optional(),
    checksum: z.string().optional(),
    checksumAlgorithm: z.string().optional(),
    flow: z
      .object({
        flowId: z.string(),
        nodeId: z.string(),
        jobId: z.string(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // Size is required unless uploadLengthDeferred is true
      if (data.uploadLengthDeferred === true) {
        return true; // Size can be omitted
      }
      return data.size !== undefined && data.size >= 0;
    },
    {
      message: "size is required when uploadLengthDeferred is not true",
      path: ["size"],
    },
  );

/**
 * Represents the input data for creating a new file upload.
 *
 * This type defines the information required to initiate an upload.
 * It's used by clients to provide upload metadata before sending file data.
 *
 * @property storageId - Target storage backend identifier (e.g., "s3-production", "azure-blob")
 * @property size - File size in bytes. Optional when uploadLengthDeferred is true.
 * @property sizeHint - Optional size hint for optimization when exact size is unknown
 * @property type - MIME type of the file (e.g., "image/jpeg", "application/pdf")
 * @property uploadLengthDeferred - If true, file size is not known upfront (streaming upload)
 * @property fileName - Original filename from the client
 * @property lastModified - File's last modified timestamp in milliseconds since epoch
 * @property metadata - Base64-encoded metadata string (as per tus protocol)
 * @property checksum - Expected file checksum for validation
 * @property checksumAlgorithm - Algorithm used for checksum (e.g., "md5", "sha256")
 * @property flow - Optional flow processing configuration
 * @property flow.flowId - ID of the flow to execute on this file
 * @property flow.nodeId - Starting node ID in the flow
 * @property flow.jobId - Flow job execution ID
 *
 * @example
 * ```typescript
 * // Basic file upload
 * const inputFile: InputFile = {
 *   storageId: "s3-production",
 *   size: 1024000,
 *   type: "image/jpeg",
 *   fileName: "photo.jpg",
 *   lastModified: Date.now()
 * };
 *
 * // Upload with metadata (base64 encoded as per tus protocol)
 * const metadata = btoa(JSON.stringify({
 *   userId: "user_123",
 *   albumId: "album_456"
 * }));
 * const inputWithMetadata: InputFile = {
 *   storageId: "s3-production",
 *   size: 2048000,
 *   type: "image/png",
 *   fileName: "screenshot.png",
 *   metadata
 * };
 *
 * // Upload with checksum validation
 * const inputWithChecksum: InputFile = {
 *   storageId: "s3-production",
 *   size: 512000,
 *   type: "application/pdf",
 *   fileName: "document.pdf",
 *   checksum: "5d41402abc4b2a76b9719d911017c592",
 *   checksumAlgorithm: "md5"
 * };
 *
 * // Upload that triggers a flow
 * const inputWithFlow: InputFile = {
 *   storageId: "s3-temp",
 *   size: 4096000,
 *   type: "image/jpeg",
 *   fileName: "large-image.jpg",
 *   flow: {
 *     flowId: "resize-and-optimize",
 *     nodeId: "input_1",
 *     jobId: "job_789"
 *   }
 * };
 *
 * // Streaming upload (size unknown) - size can be omitted
 * const streamingInput: InputFile = {
 *   storageId: "s3-production",
 *   type: "video/mp4",
 *   uploadLengthDeferred: true,
 *   fileName: "live-stream.mp4"
 * };
 *
 * // Streaming upload with size hint for optimization
 * const streamingWithHint: InputFile = {
 *   storageId: "s3-production",
 *   type: "image/webp",
 *   uploadLengthDeferred: true,
 *   sizeHint: 5_000_000, // ~5MB expected
 *   fileName: "optimized-image.webp"
 * };
 * ```
 */
export type InputFile = z.infer<typeof inputFileSchema>;
