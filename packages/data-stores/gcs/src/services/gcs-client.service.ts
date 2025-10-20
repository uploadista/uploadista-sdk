import type { UploadistaError } from "@uploadista/core/errors";
import { Context, type Effect } from "effect";

export interface GCSOperationContext {
  bucket: string;
  key: string;
  contentType?: string;
  metadata?: Record<string, string | null>;
}

export interface GCSObjectMetadata {
  name: string;
  bucket: string;
  size?: number;
  contentType?: string;
  metadata?: Record<string, string | null>;
  generation?: string;
  timeCreated?: string;
  updated?: string;
}

export type GCSClient = {
  readonly bucket: string;

  // Basic GCS operations
  readonly getObject: (
    key: string,
  ) => Effect.Effect<ReadableStream, UploadistaError>;
  readonly getObjectMetadata: (
    key: string,
  ) => Effect.Effect<GCSObjectMetadata, UploadistaError>;
  readonly getObjectBuffer: (
    key: string,
  ) => Effect.Effect<Uint8Array, UploadistaError>;
  readonly objectExists: (
    key: string,
  ) => Effect.Effect<boolean, UploadistaError>;
  readonly putObject: (
    key: string,
    body: Uint8Array,
    context?: Partial<GCSOperationContext>,
  ) => Effect.Effect<string, UploadistaError>;
  readonly putObjectFromStream?: (
    key: string,
    offset: number,
    readableStream: ReadableStream,
    context?: Partial<GCSOperationContext>,
    onProgress?: (chunkSize: number) => void, // Called with incremental bytes per chunk
  ) => Effect.Effect<number, UploadistaError>;
  readonly putObjectFromStreamWithPatching?: (
    key: string,
    offset: number,
    readableStream: ReadableStream,
    context?: Partial<GCSOperationContext>,
    onProgress?: (chunkSize: number) => void, // Called with incremental bytes per chunk
    isAppend?: boolean,
  ) => Effect.Effect<number, UploadistaError>;
  readonly deleteObject: (key: string) => Effect.Effect<void, UploadistaError>;

  // Resumable upload operations
  readonly createResumableUpload: (
    context: GCSOperationContext,
  ) => Effect.Effect<string, UploadistaError>; // Returns upload URL
  readonly uploadChunk: (
    uploadUrl: string,
    chunk: Uint8Array,
    start: number,
    total?: number,
  ) => Effect.Effect<
    { completed: boolean; bytesUploaded: number },
    UploadistaError
  >;
  readonly getUploadStatus: (
    uploadUrl: string,
  ) => Effect.Effect<
    { bytesUploaded: number; completed: boolean },
    UploadistaError
  >;
  readonly cancelUpload: (
    uploadUrl: string,
  ) => Effect.Effect<void, UploadistaError>;

  // Compose operations (GCS specific - for combining files)
  readonly composeObjects: (
    sourceKeys: string[],
    destinationKey: string,
    context?: Partial<GCSOperationContext>,
  ) => Effect.Effect<string, UploadistaError>;

  // Temporary file operations (for patches)
  readonly putTemporaryObject: (
    key: string,
    body: Uint8Array,
    context?: Partial<GCSOperationContext>,
  ) => Effect.Effect<string, UploadistaError>;
  readonly getTemporaryObject: (
    key: string,
  ) => Effect.Effect<ReadableStream | undefined, UploadistaError>;
  readonly deleteTemporaryObject: (
    key: string,
  ) => Effect.Effect<void, UploadistaError>;
};

export class GCSClientService extends Context.Tag("GCSClientService")<
  GCSClientService,
  GCSClient
>() {}

export interface GCSClientConfig {
  bucket: string;
  // For Node.js implementation
  keyFilename?: string;
  credentials?: object;
  projectId?: string;
  // For REST API implementation
  accessToken?: string;
}
