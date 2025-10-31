import type {
  R2Bucket,
  R2UploadedPart as CloudflareR2UploadedPart,
  ReadableStream,
} from "@cloudflare/workers-types";
import type { UploadistaError } from "@uploadista/core/errors";
import type {
  DataStoreCapabilities,
  DataStoreWriteOptions,
  UploadFile,
  UploadStrategy,
} from "@uploadista/core/types";
import type { Effect } from "effect";

/**
 * Extended R2UploadedPart type that includes size property
 * Cloudflare's R2UploadedPart doesn't include size, but we need it for tracking
 */
export type R2UploadedPart = CloudflareR2UploadedPart & {
  size: number;
};

export type R2StoreOptions = {
  deliveryUrl: string;
  /**
   * The preferred part size for parts send to S3. Can not be lower than 5MiB or more than 5GiB.
   * The server calculates the optimal part size, which takes this size into account,
   * but may increase it to not exceed the S3 10K parts limit.
   */
  partSize?: number;
  /**
   * The minimal part size for parts.
   * Can be used to ensure that all non-trailing parts are exactly the same size.
   * Can not be lower than 5MiB or more than 5GiB.
   */
  minPartSize?: number;
  /**
   * The maximum number of parts allowed in a multipart upload. Defaults to 10,000.
   */
  maxMultipartParts?: number;
  useTags?: boolean;
  maxConcurrentPartUploads?: number;
  expirationPeriodInMilliseconds?: number;
  // Options to pass to the Cloudflare R2 SDK.
  bucket: string;
  r2Bucket: R2Bucket;
};

export type ChunkInfo = {
  partNumber: number;
  data: Uint8Array;
  size: number;
  isFinalPart?: boolean;
};

export type R2OperationContext = {
  uploadId: string;
  bucket: string;
  key: string;
  partNumber?: number;
  partSize?: number;
  contentType?: string;
  cacheControl?: string;
};

export type PartUploadResult = {
  etag: string;
  partNumber: number;
};

export type MultipartUploadInfo = {
  uploadId: string;
  bucket: string;
  key: string;
};

export type UploadProgress = {
  bytesUploaded: number;
  totalBytes: number;
  currentOffset: number;
};

export type R2Store = {
  bucket: string;
  create: (upload: UploadFile) => Effect.Effect<UploadFile, UploadistaError>;
  remove: (id: string) => Effect.Effect<void, UploadistaError>;
  write: (
    options: DataStoreWriteOptions,
    dependencies: { onProgress?: (chunkSize: number) => void },
  ) => Effect.Effect<number, UploadistaError>;
  getUpload: (id: string) => Effect.Effect<UploadFile, UploadistaError>;
  read: (id: string) => Effect.Effect<ReadableStream, UploadistaError>;
  deleteExpired: Effect.Effect<number, UploadistaError>;
  getCapabilities: () => DataStoreCapabilities;
  getChunkerConstraints: () => {
    minChunkSize: number;
    maxChunkSize: number;
    optimalChunkSize: number;
    requiresOrderedChunks: boolean;
  };
  validateUploadStrategy: (
    strategy: UploadStrategy,
  ) => Effect.Effect<boolean, never>;
};

export type R2StoreConfig = R2StoreOptions;
