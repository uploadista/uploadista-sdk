import type { S3ClientConfig } from "@aws-sdk/client-s3";
import type { UploadistaError } from "@uploadista/core/errors";
import type {
  DataStoreCapabilities,
  DataStoreWriteOptions,
  KvStore,
  UploadFile,
  UploadStrategy,
} from "@uploadista/core/types";
import type { Effect } from "effect";

export type S3StoreOptions = {
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
  // Options to pass to the AWS S3 SDK.
  s3ClientConfig: S3ClientConfig & { bucket: string };
};

export type ChunkInfo = {
  partNumber: number;
  data: Uint8Array;
  size: number;
  isFinalPart?: boolean;
};

export type S3OperationContext = {
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

export type S3Store = {
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

export type S3StoreConfig = S3StoreOptions & {
  kvStore: KvStore<UploadFile>;
};
