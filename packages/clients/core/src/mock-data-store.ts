import type {
  DataStoreCapabilities,
  UploadStrategy,
} from "@uploadista/core/types";

/**
 * Mock data store implementation for client-side capability negotiation.
 * This doesn't perform actual data store operations but provides capability information
 * for upload strategy decisions.
 */
export class MockClientDataStore {
  constructor(private capabilities: DataStoreCapabilities) {}

  getCapabilities(): DataStoreCapabilities {
    return this.capabilities;
  }

  validateUploadStrategy(strategy: UploadStrategy): boolean {
    switch (strategy) {
      case "parallel":
        return this.capabilities.supportsParallelUploads;
      case "single":
        return true;
      default:
        return false;
    }
  }
}

/**
 * Default capabilities that assume basic parallel upload support
 * (conservative defaults that work with most backends)
 */
export const defaultClientCapabilities: DataStoreCapabilities = {
  supportsParallelUploads: true,
  supportsConcatenation: true,
  supportsDeferredLength: true,
  supportsResumableUploads: true,
  supportsTransactionalUploads: false,
  maxConcurrentUploads: 6, // Browser-safe default
  minChunkSize: 64 * 1024, // 64KB
  maxChunkSize: 100 * 1024 * 1024, // 100MB
  maxParts: 10000,
  optimalChunkSize: 8 * 1024 * 1024, // 8MB
  requiresOrderedChunks: false,
};

/**
 * Capabilities for S3-compatible backends
 */
export const s3LikeCapabilities: DataStoreCapabilities = {
  supportsParallelUploads: true,
  supportsConcatenation: true,
  supportsDeferredLength: true,
  supportsResumableUploads: true,
  supportsTransactionalUploads: true,
  maxConcurrentUploads: 60,
  minChunkSize: 5 * 1024 * 1024, // 5MiB S3 minimum
  maxChunkSize: 5 * 1024 * 1024 * 1024, // 5GiB S3 maximum
  maxParts: 10000,
  optimalChunkSize: 8 * 1024 * 1024, // 8MB
  requiresOrderedChunks: false,
};

/**
 * Capabilities for GCS-compatible backends
 */
export const gcsLikeCapabilities: DataStoreCapabilities = {
  supportsParallelUploads: false, // GCS doesn't have native multipart
  supportsConcatenation: true, // Can combine files
  supportsDeferredLength: true,
  supportsResumableUploads: true,
  supportsTransactionalUploads: false,
  maxConcurrentUploads: 1,
  minChunkSize: undefined,
  maxChunkSize: undefined,
  maxParts: undefined,
  optimalChunkSize: 8 * 1024 * 1024, // 8MB
  requiresOrderedChunks: true,
};

/**
 * Capabilities for filesystem-based backends
 */
export const filesystemLikeCapabilities: DataStoreCapabilities = {
  supportsParallelUploads: false, // Sequential operations
  supportsConcatenation: false,
  supportsDeferredLength: false,
  supportsResumableUploads: true,
  supportsTransactionalUploads: false,
  maxConcurrentUploads: 1,
  minChunkSize: undefined,
  maxChunkSize: undefined,
  maxParts: undefined,
  optimalChunkSize: 1024 * 1024, // 1MB
  requiresOrderedChunks: true,
};
