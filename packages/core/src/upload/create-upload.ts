import { Effect, Metric, MetricBoundaries } from "effect";
import {
  type EventEmitter,
  type InputFile,
  type KvStore,
  type UploadEvent,
  UploadEventType,
  type UploadFile,
  type UploadFileDataStoresShape,
} from "../types";
import type { GenerateIdShape } from "../utils/generate-id";

/**
 * Creates a new upload and initializes it in the storage system.
 *
 * This function handles the initial upload creation process including:
 * - Generating a unique upload ID
 * - Routing to appropriate data store based on storage ID
 * - Creating the upload record in the data store
 * - Storing upload metadata in KV store
 * - Emitting upload started events
 * - Parsing and validating metadata
 *
 * The function includes comprehensive observability with:
 * - Effect tracing spans for performance monitoring
 * - Metrics tracking for upload creation, file sizes, and success rates
 * - Structured logging for debugging and monitoring
 * - Error handling with proper UploadistaError types
 *
 * @param inputFile - Input file configuration including storage, size, type, etc.
 * @param clientId - Client identifier (null for anonymous uploads)
 * @param dataStoreService - Service for routing to appropriate data stores
 * @param kvStore - KV store for upload metadata persistence
 * @param eventEmitter - Event emitter for upload lifecycle events
 * @param generateId - ID generator for creating unique upload identifiers
 * @returns Effect that yields the created UploadFile
 *
 * @example
 * ```typescript
 * // Create a new upload
 * const inputFile: InputFile = {
 *   storageId: "s3-production",
 *   size: 1024000,
 *   type: "image/jpeg",
 *   fileName: "photo.jpg",
 *   metadata: JSON.stringify({ category: "photos" })
 * };
 *
 * const createEffect = createUpload(
 *   inputFile,
 *   "client-123",
 *   {
 *     dataStoreService,
 *     kvStore,
 *     eventEmitter,
 *     generateId
 *   }
 * );
 *
 * // Run with dependencies
 * const upload = await Effect.runPromise(
 *   createEffect.pipe(
 *     Effect.provide(dataStoreLayer),
 *     Effect.provide(kvStoreLayer),
 *     Effect.provide(eventEmitterLayer),
 *     Effect.provide(generateIdLayer)
 *   )
 * );
 * ```
 */
export const createUpload = (
  inputFile: InputFile,
  clientId: string | null,
  {
    dataStoreService,
    kvStore,
    eventEmitter,
    generateId,
  }: {
    dataStoreService: UploadFileDataStoresShape;
    kvStore: KvStore<UploadFile>;
    eventEmitter: EventEmitter<UploadEvent>;
    generateId: GenerateIdShape;
  },
) =>
  Effect.gen(function* () {
    // Get datastore using Effect
    const dataStore = yield* dataStoreService.getDataStore(
      inputFile.storageId,
      clientId,
    );

    const id = yield* generateId.generateId();
    const { size, type, fileName, lastModified, metadata, flow } = inputFile;

    let parsedMetadata: Record<string, string> = {};
    if (metadata) {
      try {
        parsedMetadata = JSON.parse(metadata) as Record<string, string>;
      } catch {
        parsedMetadata = {};
      }
    }

    const metadataObject: Record<string, string> = {
      ...parsedMetadata,
      type,
      fileName: fileName ?? "",
    };
    if (lastModified) {
      metadataObject.lastModified = lastModified.toString();
    }

    const file: UploadFile = {
      id,
      size,
      metadata: metadataObject,
      offset: 0,
      creationDate: new Date().toISOString(),
      storage: {
        id: inputFile.storageId,

        type,
        path: "",
        bucket: dataStore.bucket,
      },
      flow,
    };

    // Create file using Effect
    const fileCreated = yield* dataStore.create(file);

    // Store in KV store
    yield* kvStore.set(id, fileCreated);

    // Emit event
    yield* eventEmitter.emit(id, {
      type: UploadEventType.UPLOAD_STARTED,
      data: fileCreated,
      flow: fileCreated.flow,
    });

    return fileCreated;
  }).pipe(
    // Add tracing span for the entire create operation
    Effect.withSpan("upload-create", {
      attributes: {
        "upload.file_name": inputFile.fileName ?? "unknown",
        "upload.file_size": inputFile.size?.toString() ?? "0",
        "upload.storage_id": inputFile.storageId,
        "upload.mime_type": inputFile.type,
        "upload.has_flow": inputFile.flow ? "true" : "false",
      },
    }),
    // Track upload creation metrics
    Effect.tap((file) =>
      Effect.gen(function* () {
        // Increment upload created counter
        yield* Metric.increment(
          Metric.counter("upload_created_total", {
            description: "Total number of uploads created",
          }),
        );

        // Record file size
        if (file.size) {
          const fileSizeHistogram = Metric.histogram(
            "upload_file_size_bytes",
            MetricBoundaries.exponential({
              start: 1024,
              factor: 2,
              count: 25,
            }),
          );
          yield* Metric.update(fileSizeHistogram, file.size);
        }

        // Track active uploads gauge
        const activeUploadsGauge = Metric.gauge("active_uploads");
        yield* Metric.increment(activeUploadsGauge);
      }),
    ),
    // Add structured logging
    Effect.tap((file) =>
      Effect.logInfo("Upload created").pipe(
        Effect.annotateLogs({
          "upload.id": file.id,
          "upload.file_name": inputFile.fileName ?? "unknown",
          "upload.file_size": inputFile.size?.toString() ?? "0",
          "upload.storage_id": inputFile.storageId,
        }),
      ),
    ),
    // Handle errors with logging and metrics
    Effect.tapError((error) =>
      Effect.gen(function* () {
        // Log error
        yield* Effect.logError("Upload creation failed").pipe(
          Effect.annotateLogs({
            "upload.file_name": inputFile.fileName ?? "unknown",
            "upload.storage_id": inputFile.storageId,
            error: String(error),
          }),
        );

        // Track failed upload metric
        yield* Metric.increment(
          Metric.counter("upload_failed_total", {
            description: "Total number of uploads that failed",
          }),
        );
      }),
    ),
  );
