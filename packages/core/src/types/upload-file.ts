import { z } from "zod";

/**
 * Zod schema for validating UploadFile objects.
 *
 * This schema defines the structure and validation rules for upload file metadata.
 * Use this schema to parse and validate UploadFile data from external sources.
 *
 * @see {@link UploadFile} for the TypeScript type
 */
/**
 * Zod schema for trace context used in distributed tracing.
 */
export const traceContextSchema = z.object({
  traceId: z.string(),
  spanId: z.string(),
  traceFlags: z.number(),
});

/**
 * JSON value type that allows any JSON-serializable data.
 * Used for metadata values which can be primitives, arrays, or nested objects.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * JSON value schema that allows any JSON-serializable data.
 * This is used for metadata values which can be primitives, arrays, or objects.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const uploadFileSchema = z.object({
  id: z.string(),
  size: z.number().optional(),
  offset: z.number(),
  metadata: z.record(z.string(), jsonValueSchema).optional(),
  creationDate: z.string().optional(),
  url: z.string().optional(),
  sizeIsDeferred: z.boolean().optional(),
  checksum: z.string().optional(),
  checksumAlgorithm: z.string().optional(),
  storage: z.object({
    id: z.string(),
    type: z.string(),
    path: z.string().optional(),
    uploadId: z.string().optional(),
    bucket: z.string().optional(),
    parts: z
      .array(
        z.object({
          partNumber: z.number(),
          etag: z.string(),
          size: z.number(),
        }),
      )
      .optional(),
  }),
  flow: z
    .object({
      flowId: z.string(),
      nodeId: z.string(),
      jobId: z.string(),
    })
    .optional(),
  traceContext: traceContextSchema.optional(),
});

/**
 * Represents an uploaded file with its metadata and storage information.
 *
 * This is the core data structure that tracks file uploads throughout their lifecycle.
 * It contains all metadata needed to resume uploads, track progress, and locate files
 * in storage backends.
 *
 * @property id - Unique identifier for this upload
 * @property offset - Current byte offset (how many bytes have been uploaded)
 * @property storage - Storage backend information
 * @property storage.id - Storage backend identifier (e.g., "s3-production")
 * @property storage.type - Storage backend type (e.g., "s3", "azure", "gcs")
 * @property storage.path - Optional path prefix within the storage backend
 * @property storage.uploadId - Optional backend-specific upload ID (e.g., S3 multipart upload ID)
 * @property storage.bucket - Optional bucket or container name
 * @property storage.parts - Optional array of uploaded parts (used by data stores that need to track parts locally, like R2)
 * @property flow - Optional flow processing information (when file is part of a flow)
 * @property flow.flowId - ID of the flow processing this file
 * @property flow.nodeId - ID of the flow node that created this file
 * @property flow.jobId - ID of the flow job execution
 * @property size - Total file size in bytes (undefined if deferred)
 * @property metadata - Custom key-value metadata attached to the file
 * @property creationDate - ISO 8601 timestamp when upload was created
 * @property url - Optional public URL to access the file
 * @property sizeIsDeferred - True if file size is not known at upload start
 * @property checksum - Optional file checksum/hash value
 * @property checksumAlgorithm - Algorithm used for checksum (e.g., "md5", "sha256")
 *
 * @example
 * ```typescript
 * // Create an UploadFile for a new upload
 * const uploadFile: UploadFile = {
 *   id: "upload_abc123",
 *   offset: 0,
 *   size: 1024000,
 *   storage: {
 *     id: "s3-production",
 *     type: "s3",
 *     bucket: "my-uploads",
 *     path: "files/"
 *   },
 *   metadata: {
 *     fileName: "image.jpg",
 *     contentType: "image/jpeg",
 *     userId: "user_123"
 *   },
 *   creationDate: new Date().toISOString(),
 *   checksum: "5d41402abc4b2a76b9719d911017c592",
 *   checksumAlgorithm: "md5"
 * };
 *
 * // UploadFile with flow processing
 * const flowFile: UploadFile = {
 *   id: "upload_xyz789",
 *   offset: 0,
 *   size: 2048000,
 *   storage: {
 *     id: "s3-temp",
 *     type: "s3",
 *     bucket: "temp-processing"
 *   },
 *   flow: {
 *     flowId: "flow_resize_optimize",
 *     nodeId: "input_1",
 *     jobId: "job_456"
 *   }
 * };
 *
 * // Resume an interrupted upload
 * const resumingFile: UploadFile = {
 *   id: "upload_resume",
 *   offset: 524288, // Already uploaded 512KB
 *   size: 1024000,
 *   storage: {
 *     id: "s3-production",
 *     type: "s3",
 *     uploadId: "multipart_xyz" // S3 multipart upload ID
 *   }
 * };
 * ```
 */
/**
 * Trace context for distributed tracing.
 * Allows upload operations to be linked under a single trace.
 */
export type UploadFileTraceContext = {
  /** 128-bit trace identifier (32 hex characters) */
  traceId: string;
  /** 64-bit span identifier (16 hex characters) */
  spanId: string;
  /** Trace flags (1 = sampled) */
  traceFlags: number;
};

export type UploadFile = {
  id: string;
  offset: number;
  storage: {
    id: string;
    type: string;
    path?: string | undefined;
    uploadId?: string | undefined;
    bucket?: string | undefined;
    parts?:
      | Array<{
          partNumber: number;
          etag: string;
          size: number;
        }>
      | undefined;
  };
  flow?: {
    flowId: string;
    nodeId: string;
    jobId: string;
  };
  size?: number | undefined;
  metadata?: Record<string, JsonValue> | undefined;
  creationDate?: string | undefined;
  url?: string | undefined;
  sizeIsDeferred?: boolean | undefined;
  checksum?: string | undefined;
  checksumAlgorithm?: string | undefined;
  /**
   * OpenTelemetry trace context for distributed tracing.
   * When set, subsequent upload operations (chunks, validation) will be
   * linked as children of this trace context.
   */
  traceContext?: UploadFileTraceContext | undefined;
};
