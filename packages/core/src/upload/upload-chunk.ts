import { Effect, Metric, MetricBoundaries } from "effect";
import { UploadistaError } from "../errors/uploadista-error";
import {
  type DataStore,
  type EventEmitter,
  type KvStore,
  type UploadEvent,
  UploadEventType,
  type UploadFile,
  type UploadFileDataStoresShape,
} from "../types";
import { computeChecksum } from "../utils/checksum";
import { compareMimeTypes, detectMimeType } from "./mime";
import { writeToStore } from "./write-to-store";

// Chunk upload
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
    // Get file from KV store
    const file = yield* kvStore.get(uploadId);

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
    }

    return file;
  }).pipe(
    // Add tracing span for chunk upload
    Effect.withSpan("upload-chunk", {
      attributes: {
        "upload.id": uploadId,
        "chunk.upload_id": uploadId,
      },
    }),
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
 * Validate upload after completion.
 * Performs checksum and MIME type validation if configured.
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

      if (declaredMimeType && !compareMimeTypes(declaredMimeType, detectedMimeType)) {
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
        "validation.mime_required": dataStore.getCapabilities().requiresMimeTypeValidation ? "true" : "false",
      },
    }),
  );
