import { Effect, Metric, MetricBoundaries, Tracer } from "effect";
import { UploadistaError } from "../errors/uploadista-error";
import {
  type DataStore,
  type EventEmitter,
  type KvStore,
  type UploadEvent,
  UploadEventType,
  type UploadFile,
  type UploadFileDataStoresShape,
  type UploadFileTraceContext,
} from "../types";
import { computeChecksum } from "../utils/checksum";
import { compareMimeTypes, detectMimeType } from "./mime";
import { writeToStore } from "./write-to-store";

/**
 * Creates an ExternalSpan from stored trace context.
 * Used for linking chunk uploads to the original upload trace.
 */
function createExternalSpan(traceContext: UploadFileTraceContext) {
  return Tracer.externalSpan({
    traceId: traceContext.traceId,
    spanId: traceContext.spanId,
    sampled: traceContext.traceFlags === 1,
  });
}

/**
 * Creates an "upload-complete" span Effect that captures the full upload duration.
 * This span is a sibling of upload-create and upload-chunk under the parent "upload" span.
 *
 * Note: The span's visual duration in tracing UIs will be short (instant), but the
 * actual upload duration is captured in the "upload.total_duration_ms" attribute.
 *
 * @param file - The completed upload file
 * @param parentSpan - The parent span to link to
 * @returns Effect that creates and completes the span
 */
const createUploadCompleteSpanEffect = (
  file: UploadFile,
  parentSpan: Tracer.ExternalSpan,
): Effect.Effect<void> => {
  const creationTime = new Date(file.creationDate as string).getTime();
  const totalDurationMs = Date.now() - creationTime;

  return Effect.void.pipe(
    Effect.withSpan("upload-complete", {
      attributes: {
        "upload.id": file.id,
        "upload.size": file.size ?? 0,
        "upload.total_duration_ms": totalDurationMs,
        "upload.storage_id": file.storage.id,
        "upload.file_name": file.metadata?.fileName?.toString() ?? "unknown",
        "upload.creation_date": file.creationDate as string,
        "upload.completion_date": new Date().toISOString(),
      },
      parent: parentSpan,
    }),
  );
};

/**
 * Uploads a chunk of data for an existing upload.
 *
 * This function handles the core chunk upload logic including:
 * - Retrieving upload metadata from KV store
 * - Routing to appropriate data store based on storage ID
 * - Writing chunk data to storage with progress tracking
 * - Updating upload offset and metadata
 * - Emitting progress events
 * - Validating upload completion (checksum, MIME type)
 *
 * The function includes comprehensive observability with:
 * - Effect tracing spans for performance monitoring
 * - Metrics tracking for chunk size, throughput, and success rates
 * - Structured logging for debugging and monitoring
 * - Error handling with proper UploadistaError types
 *
 * @param uploadId - Unique identifier for the upload
 * @param clientId - Client identifier (null for anonymous uploads)
 * @param chunk - ReadableStream containing the chunk data to upload
 * @param dataStoreService - Service for routing to appropriate data stores
 * @param kvStore - KV store for upload metadata persistence
 * @param eventEmitter - Event emitter for progress and validation events
 * @returns Effect that yields the updated UploadFile with new offset
 *
 * @example
 * ```typescript
 * // Upload a chunk for an existing upload
 * const uploadChunkEffect = uploadChunk(
 *   "upload-123",
 *   "client-456",
 *   chunkStream,
 *   {
 *     dataStoreService,
 *     kvStore,
 *     eventEmitter
 *   }
 * );
 *
 * // Run with dependencies
 * const result = await Effect.runPromise(
 *   uploadChunkEffect.pipe(
 *     Effect.provide(dataStoreLayer),
 *     Effect.provide(kvStoreLayer),
 *     Effect.provide(eventEmitterLayer)
 *   )
 * );
 * ```
 */
export const uploadChunk = (
  uploadId: string,
  clientId: string | null,
  chunk: ReadableStream,
  {
    dataStoreService,
    kvStore,
    eventEmitter,
  }: {
    dataStoreService: UploadFileDataStoresShape;
    kvStore: KvStore<UploadFile>;
    eventEmitter: EventEmitter<UploadEvent>;
  },
) =>
  Effect.gen(function* () {
    // Get file from KV store first to check for trace context
    const file = yield* kvStore.get(uploadId);

    // Create external span from stored trace context if available
    // This links chunk uploads to the original upload trace
    const parentSpan = file.traceContext
      ? createExternalSpan(file.traceContext)
      : undefined;

    // Core chunk processing logic
    const processChunk = Effect.gen(function* () {
      // Get datastore
      const dataStore = yield* dataStoreService.getDataStore(
        file.storage.id,
        clientId,
      );

      // Note: AbortController could be used for cancellation if needed

      // Write to store using writeToStore Effect
      const controller = new AbortController();

      const chunkSize = yield* writeToStore({
        dataStore,
        data: chunk,
        upload: file,
        maxFileSize: 100_000_000,
        controller,
        uploadProgressInterval: 200,
        eventEmitter,
      });

      file.offset = chunkSize;

      // Update KV store
      yield* kvStore.set(uploadId, file);

      // Emit progress event
      yield* eventEmitter.emit(file.id, {
        type: UploadEventType.UPLOAD_PROGRESS,
        data: {
          id: file.id,
          progress: file.offset,
          total: file.size ?? 0,
        },
        flow: file.flow,
      });

      // Check if upload is complete and run validation
      if (file.size && file.offset === file.size) {
        yield* validateUpload({
          file,
          dataStore,
          eventEmitter,
        });

        // Create "upload-complete" span that captures the full upload duration
        // This span shows the total time from upload creation to completion
        if (file.traceContext) {
          const completeParentSpan = createExternalSpan(file.traceContext);
          yield* createUploadCompleteSpanEffect(file, completeParentSpan);
        }
      }

      return file;
    }).pipe(
      // Add tracing span for chunk upload with parent from stored trace context
      Effect.withSpan("upload-chunk", {
        attributes: {
          "upload.id": uploadId,
          "chunk.upload_id": uploadId,
          "upload.has_trace_context": file.traceContext ? "true" : "false",
        },
        parent: parentSpan,
      }),
    );

    return yield* processChunk;
  }).pipe(
    // Track chunk upload metrics
    Effect.tap((file) =>
      Effect.gen(function* () {
        // Increment chunk uploaded counter
        yield* Metric.increment(
          Metric.counter("chunk_uploaded_total", {
            description: "Total number of chunks uploaded",
          }),
        );

        // Record chunk size
        const chunkSize = file.offset;
        const chunkSizeHistogram = Metric.histogram(
          "chunk_size_bytes",
          MetricBoundaries.linear({
            start: 262_144,
            width: 262_144,
            count: 20,
          }),
        );
        yield* Metric.update(chunkSizeHistogram, chunkSize);

        // Update throughput gauge
        if (file.size && file.size > 0) {
          const throughput = chunkSize; // bytes processed
          const throughputGauge = Metric.gauge(
            "upload_throughput_bytes_per_second",
          );
          yield* Metric.set(throughputGauge, throughput);
        }
      }),
    ),
    // Add structured logging for chunk progress
    Effect.tap((file) =>
      Effect.logDebug("Chunk uploaded").pipe(
        Effect.annotateLogs({
          "upload.id": file.id,
          "chunk.size": file.offset.toString(),
          "chunk.progress":
            file.size && file.size > 0
              ? ((file.offset / file.size) * 100).toFixed(2)
              : "0",
          "upload.total_size": file.size?.toString() ?? "0",
        }),
      ),
    ),
    // Handle errors with logging
    Effect.tapError((error) =>
      Effect.logError("Chunk upload failed").pipe(
        Effect.annotateLogs({
          "upload.id": uploadId,
          error: String(error),
        }),
      ),
    ),
  );

/**
 * Validates an upload after completion.
 *
 * Performs comprehensive validation including:
 * - Checksum validation (if provided) using the specified algorithm
 * - MIME type validation (if required by data store capabilities)
 * - File size validation against data store limits
 *
 * Validation results are emitted as events and failures result in:
 * - Cleanup of uploaded data from storage
 * - Removal of metadata from KV store
 * - Appropriate error responses
 *
 * The function respects data store capabilities for validation limits
 * and provides detailed error information for debugging.
 *
 * @param file - The upload file to validate
 * @param dataStore - Data store containing the uploaded file
 * @param eventEmitter - Event emitter for validation events
 * @returns Effect that completes validation or fails with UploadistaError
 *
 * @example
 * ```typescript
 * // Validate upload after completion
 * const validationEffect = validateUpload({
 *   file: completedUpload,
 *   dataStore: s3DataStore,
 *   eventEmitter: progressEmitter
 * });
 *
 * // Run validation
 * await Effect.runPromise(validationEffect);
 * ```
 */
const validateUpload = ({
  file,
  dataStore,
  eventEmitter,
}: {
  file: UploadFile;
  dataStore: DataStore<UploadFile>;
  eventEmitter: EventEmitter<UploadEvent>;
}): Effect.Effect<void, UploadistaError, never> =>
  Effect.gen(function* () {
    const capabilities = dataStore.getCapabilities();

    // Check if file exceeds max validation size
    if (
      capabilities.maxValidationSize &&
      file.size &&
      file.size > capabilities.maxValidationSize
    ) {
      yield* eventEmitter.emit(file.id, {
        type: UploadEventType.UPLOAD_VALIDATION_WARNING,
        data: {
          id: file.id,
          message: `File size (${file.size} bytes) exceeds max validation size (${capabilities.maxValidationSize} bytes). Validation skipped.`,
        },
        flow: file.flow,
      });
      return;
    }

    // Read file from datastore for validation
    const fileBytes = yield* dataStore.read(file.id);

    // Validate checksum if provided
    if (file.checksum && file.checksumAlgorithm) {
      const computedChecksum = yield* computeChecksum(
        fileBytes,
        file.checksumAlgorithm,
      );

      if (computedChecksum !== file.checksum) {
        // Emit validation failure event
        yield* eventEmitter.emit(file.id, {
          type: UploadEventType.UPLOAD_VALIDATION_FAILED,
          data: {
            id: file.id,
            reason: "checksum_mismatch",
            expected: file.checksum,
            actual: computedChecksum,
          },
          flow: file.flow,
        });

        // Clean up file and remove from KV store
        yield* dataStore.remove(file.id);

        // Fail with checksum mismatch error
        return yield* UploadistaError.fromCode("CHECKSUM_MISMATCH", {
          body: `Checksum validation failed. Expected: ${file.checksum}, Got: ${computedChecksum}`,
          details: {
            uploadId: file.id,
            expected: file.checksum,
            actual: computedChecksum,
            algorithm: file.checksumAlgorithm,
          },
        }).toEffect();
      }

      // Emit checksum validation success
      yield* eventEmitter.emit(file.id, {
        type: UploadEventType.UPLOAD_VALIDATION_SUCCESS,
        data: {
          id: file.id,
          validationType: "checksum",
          algorithm: file.checksumAlgorithm,
        },
        flow: file.flow,
      });
    }

    // Validate MIME type if required by capabilities
    if (capabilities.requiresMimeTypeValidation) {
      const detectedMimeType = detectMimeType(fileBytes);
      const declaredMimeType = file.metadata?.type as string | undefined;

      if (
        declaredMimeType &&
        !compareMimeTypes(declaredMimeType, detectedMimeType)
      ) {
        // Emit validation failure event
        yield* eventEmitter.emit(file.id, {
          type: UploadEventType.UPLOAD_VALIDATION_FAILED,
          data: {
            id: file.id,
            reason: "mimetype_mismatch",
            expected: declaredMimeType,
            actual: detectedMimeType,
          },
          flow: file.flow,
        });

        // Clean up file and remove from KV store
        yield* dataStore.remove(file.id);

        // Fail with MIME type mismatch error
        return yield* UploadistaError.fromCode("MIMETYPE_MISMATCH", {
          body: `MIME type validation failed. Expected: ${declaredMimeType}, Detected: ${detectedMimeType}`,
          details: {
            uploadId: file.id,
            expected: declaredMimeType,
            actual: detectedMimeType,
          },
        }).toEffect();
      }

      // Emit MIME type validation success
      yield* eventEmitter.emit(file.id, {
        type: UploadEventType.UPLOAD_VALIDATION_SUCCESS,
        data: {
          id: file.id,
          validationType: "mimetype",
        },
        flow: file.flow,
      });
    }
  }).pipe(
    Effect.withSpan("validate-upload", {
      attributes: {
        "upload.id": file.id,
        "validation.checksum_provided": file.checksum ? "true" : "false",
        "validation.mime_required": dataStore.getCapabilities()
          .requiresMimeTypeValidation
          ? "true"
          : "false",
      },
    }),
  );
