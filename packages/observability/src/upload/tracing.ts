import { Effect } from "effect";

// ============================================================================
// Upload Tracing Utilities
// ============================================================================

/**
 * Wrap an Effect with an upload operation span
 */
export const withUploadSpan =
  <A, E, R>(operation: string, attributes?: Record<string, unknown>) =>
  (effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.withSpan(`upload-${operation}`, {
        attributes: {
          "upload.operation": operation,
          ...attributes,
        },
      }),
    );

/**
 * Add upload context to the current span
 */
export const withUploadContext = (context: {
  uploadId?: string;
  fileName?: string;
  fileSize?: number;
  storageId?: string;
  mimeType?: string;
}) =>
  Effect.annotateCurrentSpan({
    "upload.id": context.uploadId ?? "unknown",
    "upload.file_name": context.fileName ?? "unknown",
    "upload.file_size": context.fileSize?.toString() ?? "0",
    "upload.storage_id": context.storageId ?? "unknown",
    "upload.mime_type": context.mimeType ?? "unknown",
  });

/**
 * Add chunk context to the current span
 */
export const withChunkContext = (context: {
  uploadId: string;
  chunkSize: number;
  offset: number;
  totalSize?: number;
}) =>
  Effect.annotateCurrentSpan({
    "chunk.upload_id": context.uploadId,
    "chunk.size": context.chunkSize.toString(),
    "chunk.offset": context.offset.toString(),
    "chunk.total_size": context.totalSize?.toString() ?? "0",
    "chunk.progress":
      context.totalSize && context.totalSize > 0
        ? ((context.offset / context.totalSize) * 100).toFixed(2)
        : "0",
  });
