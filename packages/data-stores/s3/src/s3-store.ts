import type AWS from "@aws-sdk/client-s3";
import { UploadistaError } from "@uploadista/core/errors";
import type {
  DataStore,
  DataStoreCapabilities,
  DataStoreWriteOptions,
  UploadFile,
  UploadStrategy,
} from "@uploadista/core/types";
import { UploadFileKVStore } from "@uploadista/core/types";
import {
  s3ActiveUploadsGauge as activeUploadsGauge,
  s3FileSizeHistogram as fileSizeHistogram,
  logS3UploadCompletion,
  s3PartSizeHistogram as partSizeHistogram,
  s3PartUploadDurationHistogram as partUploadDurationHistogram,
  s3UploadDurationHistogram as uploadDurationHistogram,
  s3UploadErrorsTotal as uploadErrorsTotal,
  s3UploadPartsTotal as uploadPartsTotal,
  s3UploadRequestsTotal as uploadRequestsTotal,
  s3UploadSuccessTotal as uploadSuccessTotal,
  withS3TimingMetrics as withTimingMetrics,
  withS3UploadMetrics as withUploadMetrics,
} from "@uploadista/observability";
import { Effect, Ref, Schedule, Stream } from "effect";
import { S3ClientLayer, S3ClientService } from "./services/s3-client.service";
import type { ChunkInfo, S3StoreConfig } from "./types";
import {
  calcOffsetFromParts,
  calcOptimalPartSize,
  getExpirationDate,
  isUploadNotFoundError,
} from "./utils";

/**
 * Generates an S3 key from an upload file, preserving the file extension if available.
 * Looks for filename in metadata under common keys: 'filename', 'fileName', or 'name'.
 * Falls back to just the upload ID if no filename is found.
 */
const getS3Key = (uploadFile: UploadFile): string => {
  const { id, metadata } = uploadFile;

  if (!metadata) {
    return id;
  }

  // Try common metadata keys for filename
  const filename = metadata.filename || metadata.fileName || metadata.name;

  if (typeof filename === "string" && filename.includes(".")) {
    const extension = filename.substring(filename.lastIndexOf("."));
    return `${id}${extension}`;
  }

  return id;
};

// Clean implementation using composed services
export function createS3Store(config: S3StoreConfig) {
  const {
    deliveryUrl,
    partSize,
    minPartSize = 5_242_880,
    useTags = true,
    maxMultipartParts = 10_000,
    maxConcurrentPartUploads = 60,
    expirationPeriodInMilliseconds = 1000 * 60 * 60 * 24 * 7, // 1 week
    s3ClientConfig: { bucket },
  } = config;

  return Effect.gen(function* () {
    const s3Client = yield* S3ClientService;
    const kvStore = yield* UploadFileKVStore;
    const preferredPartSize = partSize || 8 * 1024 * 1024;

    const getUploadId = (
      uploadFile: UploadFile,
    ): Effect.Effect<string, UploadistaError> => {
      const uploadId = uploadFile.storage.uploadId;
      if (!uploadId) {
        return Effect.fail(
          UploadistaError.fromCode(
            "FILE_WRITE_ERROR",
            new Error("Upload ID is undefined"),
          ),
        );
      }
      return Effect.succeed(uploadId);
    };

    const uploadPart = (
      uploadFile: UploadFile,
      data: Uint8Array,
      partNumber: number,
    ) => {
      const s3Key = getS3Key(uploadFile);

      return withTimingMetrics(
        partUploadDurationHistogram,
        Effect.gen(function* () {
          const uploadId = yield* getUploadId(uploadFile);

          const etag = yield* s3Client
            .uploadPart({
              bucket: s3Client.bucket,
              key: s3Key,
              uploadId,
              partNumber,
              data,
            })
            .pipe(
              Effect.retry(
                Schedule.exponential("1 second", 2.0).pipe(
                  Schedule.intersect(Schedule.recurs(3)),
                ),
              ),
              Effect.tapError((error) =>
                Effect.logWarning("Retrying part upload").pipe(
                  Effect.annotateLogs({
                    upload_id: uploadFile.id,
                    part_number: partNumber,
                    error_message: error.message,
                    retry_attempt: "unknown", // Will be overridden by the retry schedule
                    part_size: data.length,
                    s3_bucket: s3Client.bucket,
                  }),
                ),
              ),
            );

          yield* uploadPartsTotal(Effect.succeed(1));
          yield* Effect.logInfo("Part uploaded successfully").pipe(
            Effect.annotateLogs({
              upload_id: uploadFile.id,
              part_number: partNumber,
              part_size: data.length,
              etag: etag,
            }),
          );

          return etag;
        }),
      ).pipe(
        Effect.withSpan(`s3-upload-part-${partNumber}`, {
          attributes: {
            "upload.id": uploadFile.id,
            "upload.part_number": partNumber,
            "upload.part_size": data.length,
            "s3.bucket": s3Client.bucket,
            "s3.key": s3Key,
          },
        }),
      );
    };

    const uploadIncompletePart = (id: string, data: Uint8Array) =>
      s3Client.putIncompletePart(id, data);

    const downloadIncompletePart = (id: string) =>
      Effect.gen(function* () {
        const incompletePart = yield* s3Client.getIncompletePart(id);

        if (!incompletePart) {
          return undefined;
        }

        // Read the stream and collect all chunks to calculate size
        const reader = incompletePart.getReader();
        const chunks: Uint8Array[] = [];
        let incompletePartSize = 0;

        try {
          while (true) {
            const { done, value } = yield* Effect.promise(() => reader.read());
            if (done) break;
            chunks.push(value);
            incompletePartSize += value.length;
          }
        } finally {
          reader.releaseLock();
        }

        const stream = Stream.fromIterable(chunks);

        return {
          size: incompletePartSize,
          stream,
        };
      });

    const deleteIncompletePart = (id: string) =>
      s3Client.deleteIncompletePart(id);

    const getIncompletePartSize = (id: string) =>
      s3Client.getIncompletePartSize(id);

    const complete = (uploadFile: UploadFile, parts: Array<AWS.Part>) => {
      const s3Key = getS3Key(uploadFile);

      return Effect.gen(function* () {
        const uploadId = yield* getUploadId(uploadFile);

        return yield* s3Client.completeMultipartUpload(
          {
            bucket: s3Client.bucket,
            key: s3Key,
            uploadId,
          },
          parts,
        );
      }).pipe(
        Effect.tap(() => uploadSuccessTotal(Effect.succeed(1))),
        Effect.withSpan("s3-complete-multipart-upload", {
          attributes: {
            "upload.id": uploadFile.id,
            "upload.parts_count": parts.length,
            "s3.bucket": s3Client.bucket,
            "s3.key": s3Key,
          },
        }),
      );
    };

    const abort = (uploadFile: UploadFile) => {
      const s3Key = getS3Key(uploadFile);

      return Effect.gen(function* () {
        const uploadId = yield* getUploadId(uploadFile);

        yield* s3Client.abortMultipartUpload({
          bucket: s3Client.bucket,
          key: s3Key,
          uploadId,
        });

        yield* s3Client.deleteObjects([s3Key]);
      });
    };

    const retrievePartsRecursive = (
      s3Key: string,
      uploadId: string,
      uploadFileId: string,
      partNumberMarker?: string,
    ): Effect.Effect<
      { uploadFound: boolean; parts: AWS.Part[] },
      UploadistaError
    > =>
      Effect.gen(function* () {
        const result = yield* s3Client.listParts({
          bucket: s3Client.bucket,
          key: s3Key,
          uploadId,
          partNumberMarker,
        });

        let parts = result.parts;

        if (result.isTruncated) {
          const rest = yield* retrievePartsRecursive(
            s3Key,
            uploadId,
            uploadFileId,
            result.nextPartNumberMarker,
          );
          parts = [...parts, ...rest.parts];
        }

        if (!partNumberMarker) {
          parts.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0));
        }

        return { uploadFound: true, parts };
      }).pipe(
        Effect.catchAll((error) => {
          if (isUploadNotFoundError(error)) {
            return Effect.logWarning(
              "S3 upload not found during listParts",
            ).pipe(
              Effect.annotateLogs({
                upload_id: uploadFileId,
                error_code: error.code,
              }),
              Effect.as({ uploadFound: false, parts: [] }),
            );
          }
          return Effect.fail(error);
        }),
      );

    const retrieveParts = (id: string, partNumberMarker?: string) =>
      Effect.gen(function* () {
        const metadata = yield* kvStore.get(id);
        const uploadId = yield* getUploadId(metadata);
        const s3Key = getS3Key(metadata);

        return yield* retrievePartsRecursive(
          s3Key,
          uploadId,
          id,
          partNumberMarker,
        );
      });

    const completeMetadata = (upload: UploadFile, useTags: boolean) =>
      Effect.gen(function* () {
        if (!useTags) {
          return 0;
        }

        const uploadFile = yield* kvStore.get(upload.id);
        const uploadId = uploadFile.storage.uploadId;
        if (!uploadId) {
          return 0;
        }

        yield* kvStore.set(upload.id, {
          ...uploadFile,
          storage: { ...uploadFile.storage, uploadId },
        });

        return 0;
      });

    const clearCache = (id: string) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Clearing cache").pipe(
          Effect.annotateLogs({ upload_id: id }),
        );
        yield* kvStore.delete(id);
      });

    const createMultipartUpload = (upload: UploadFile) => {
      const s3Key = getS3Key(upload);

      return Effect.gen(function* () {
        yield* Effect.logInfo("Initializing multipart upload").pipe(
          Effect.annotateLogs({ upload_id: upload.id }),
        );

        const multipartInfo = yield* s3Client.createMultipartUpload({
          bucket: s3Client.bucket,
          key: s3Key,
          uploadId: "", // Not needed for create
          contentType: upload.metadata?.contentType?.toString(),
          cacheControl: upload.metadata?.cacheControl?.toString(),
        });

        const uploadCreated = {
          ...upload,
          storage: {
            ...upload.storage,
            path: multipartInfo.key,
            uploadId: multipartInfo.uploadId,
            bucket: multipartInfo.bucket,
          },
          url: `${deliveryUrl}/${s3Key}`,
        };

        yield* kvStore.set(upload.id, uploadCreated);

        yield* Effect.logInfo("Multipart upload created").pipe(
          Effect.annotateLogs({
            upload_id: upload.id,
            s3_upload_id: uploadCreated.storage.uploadId,
            s3_key: s3Key,
          }),
        );

        yield* uploadRequestsTotal(Effect.succeed(1));
        yield* fileSizeHistogram(Effect.succeed(upload.size || 0));

        return uploadCreated;
      }).pipe(
        Effect.withSpan("s3-create-upload", {
          attributes: {
            "upload.id": upload.id,
            "upload.size": upload.size || 0,
            "s3.bucket": s3Client.bucket,
            "s3.key": s3Key,
          },
        }),
      );
    };

    /**
     * Creates a multipart upload on S3 attaching any metadata to it.
     * Also, a `${file_id}.info` file is created which holds some information
     * about the upload itself like: `upload-id`, `upload-length`, etc.
     */
    const create = (upload: UploadFile) => {
      return Effect.gen(function* () {
        yield* Effect.logInfo("Initializing multipart upload").pipe(
          Effect.annotateLogs({ upload_id: upload.id }),
        );
        const uploadCreated = yield* createMultipartUpload(upload);
        yield* kvStore.set(upload.id, uploadCreated);
        yield* Effect.logInfo("Multipart upload created").pipe(
          Effect.annotateLogs({
            upload_id: upload.id,
            s3_upload_id: uploadCreated.storage.uploadId,
          }),
        );
        yield* uploadRequestsTotal(Effect.succeed(1));

        return uploadCreated;
      }).pipe(
        Effect.withSpan("s3-create-upload", {
          attributes: {
            "upload.id": upload.id,
            "upload.size": upload.size || 0,
            "s3.bucket": bucket,
          },
        }),
      );
    };

    const remove = (id: string) =>
      Effect.gen(function* () {
        const uploadFile = yield* kvStore.get(id);
        yield* abort(uploadFile);
        yield* clearCache(id);
      });

    const write = (
      options: DataStoreWriteOptions,
      dependencies: { onProgress?: (currentOffset: number) => void },
    ) =>
      withUploadMetrics(
        options.file_id,
        withTimingMetrics(
          uploadDurationHistogram,
          Effect.gen(function* () {
            const {
              stream: initialData,
              file_id,
              offset: initialOffset,
            } = options;
            const { onProgress } = dependencies;

            // Capture start time for upload completion metrics
            const startTime = Date.now();

            // Track active upload
            yield* activeUploadsGauge(Effect.succeed(1));

            const prepareResult = yield* prepareUpload(
              file_id,
              initialOffset,
              initialData,
            );

            const {
              uploadFile,
              nextPartNumber,
              offset,
              data,
              existingPartSize,
            } = prepareResult;

            // Use existing part size if parts already exist, otherwise calculate optimal size
            const uploadPartSize =
              existingPartSize ||
              calcOptimalPartSize(
                uploadFile.size,
                preferredPartSize,
                minPartSize,
                maxMultipartParts,
              );

            // Log part size decision for debugging
            yield* Effect.logInfo("Part size decision").pipe(
              Effect.annotateLogs({
                upload_id: file_id,
                existing_part_size: existingPartSize,
                calculated_part_size: calcOptimalPartSize(
                  uploadFile.size,
                  preferredPartSize,
                  minPartSize,
                  maxMultipartParts,
                ),
                final_part_size: uploadPartSize,
                next_part_number: nextPartNumber,
              }),
            );

            const bytesUploaded = yield* uploadParts(
              uploadFile,
              data,
              nextPartNumber,
              offset,
              uploadPartSize,
              minPartSize,
              maxConcurrentPartUploads,
              onProgress,
            );

            const newOffset = offset + bytesUploaded;

            if (uploadFile.size === newOffset) {
              yield* finishUpload(file_id, uploadFile, startTime);
            }

            return newOffset;
          }).pipe(Effect.ensuring(activeUploadsGauge(Effect.succeed(0)))),
        ),
      );

    const getUpload = (id: string) =>
      Effect.gen(function* () {
        const uploadFile = yield* kvStore.get(id);

        const { parts, uploadFound } = yield* retrieveParts(id);
        if (!uploadFound) {
          return {
            ...uploadFile,
            offset: uploadFile.size as number,
            size: uploadFile.size,
          };
        }

        const offset = calcOffsetFromParts(parts);
        const incompletePartSize = yield* getIncompletePartSize(id);

        return {
          ...uploadFile,
          offset: offset + (incompletePartSize ?? 0),
          size: uploadFile.size,
          storage: uploadFile.storage,
        };
      });

    // const read = (id: string) =>
    //   Effect.gen(function* () {
    //     return yield* s3Client.getObject(id);
    //   });

    // Helper functions
    const prepareUpload = (
      fileId: string,
      initialOffset: number,
      initialData: Stream.Stream<Uint8Array, UploadistaError>,
    ) =>
      Effect.gen(function* () {
        const uploadFile = yield* kvStore.get(fileId);
        const { parts } = yield* retrieveParts(fileId);

        const partNumber: number =
          parts.length > 0 && parts[parts.length - 1].PartNumber
            ? (parts[parts.length - 1].PartNumber ?? 0)
            : 0;
        const nextPartNumber = partNumber + 1;

        // Detect existing part size to maintain consistency
        // We check the first part's size to ensure all subsequent parts match
        const existingPartSize =
          parts.length > 0 && parts[0].Size ? parts[0].Size : null;

        // Validate that all existing parts (except potentially the last one) have the same size
        if (existingPartSize && parts.length > 1) {
          const inconsistentPart = parts
            .slice(0, -1)
            .find((part) => part.Size !== existingPartSize);
          if (inconsistentPart) {
            yield* Effect.logWarning(
              "Inconsistent part sizes detected in existing upload",
            ).pipe(
              Effect.annotateLogs({
                upload_id: fileId,
                expected_size: existingPartSize,
                inconsistent_part: inconsistentPart.PartNumber,
                inconsistent_size: inconsistentPart.Size,
              }),
            );
          }
        }

        const incompletePart = yield* downloadIncompletePart(fileId);

        if (incompletePart) {
          yield* deleteIncompletePart(fileId);
          const offset = initialOffset - incompletePart.size;
          const data = incompletePart.stream.pipe(Stream.concat(initialData));
          return {
            uploadFile,
            nextPartNumber,
            offset,
            incompletePartSize: incompletePart.size,
            data,
            existingPartSize,
          };
        } else {
          return {
            uploadFile,
            nextPartNumber,
            offset: initialOffset,
            incompletePartSize: 0,
            data: initialData,
            existingPartSize,
          };
        }
      });

    const finishUpload = (
      fileId: string,
      uploadFile: UploadFile,
      startTime: number,
    ) =>
      Effect.gen(function* () {
        const { parts } = yield* retrieveParts(fileId);

        // Log all parts for debugging S3 multipart upload requirements
        yield* Effect.logInfo("Attempting to complete multipart upload").pipe(
          Effect.annotateLogs({
            upload_id: fileId,
            parts_count: parts.length,
            parts_info: parts.map((part, index) => ({
              part_number: part.PartNumber,
              size: part.Size,
              etag: part.ETag,
              is_final_part: index === parts.length - 1,
            })),
          }),
        );

        yield* complete(uploadFile, parts);
        yield* completeMetadata(uploadFile, useTags);
        // yield* clearCache(fileId);

        // Log upload completion metrics
        const endTime = Date.now();
        const totalDurationMs = endTime - startTime;
        const fileSize = uploadFile.size || 0;
        const throughputBps =
          totalDurationMs > 0 ? (fileSize * 1000) / totalDurationMs : 0;

        // Calculate average part size if we have parts
        const averagePartSize =
          parts.length > 0
            ? parts.reduce((sum, part) => sum + (part.Size || 0), 0) /
              parts.length
            : undefined;

        yield* logS3UploadCompletion(fileId, {
          fileSize,
          totalDurationMs,
          partsCount: parts.length,
          averagePartSize,
          throughputBps,
        });
      }).pipe(
        Effect.tapError((error) =>
          Effect.gen(function* () {
            yield* uploadErrorsTotal(Effect.succeed(1));
            yield* Effect.logError("Failed to finish upload").pipe(
              Effect.annotateLogs({
                upload_id: fileId,
                error: String(error),
              }),
            );
          }),
        ),
      );

    const deleteExpired = (): Effect.Effect<number, UploadistaError> =>
      Effect.gen(function* () {
        if (expirationPeriodInMilliseconds === 0) {
          return 0;
        }

        let keyMarker: string | undefined;
        let uploadIdMarker: string | undefined;
        let isTruncated = true;
        let deleted = 0;

        while (isTruncated) {
          const listResponse = yield* s3Client.listMultipartUploads(
            keyMarker,
            uploadIdMarker,
          );

          const expiredUploads =
            listResponse.Uploads?.filter((multiPartUpload) => {
              const initiatedDate = multiPartUpload.Initiated;
              return (
                initiatedDate &&
                Date.now() >
                  getExpirationDate(
                    initiatedDate.toISOString(),
                    expirationPeriodInMilliseconds,
                  ).getTime()
              );
            }) || [];

          const objectsToDelete = expiredUploads
            .filter((upload): upload is { Key: string } => {
              return !!upload.Key;
            })
            .map((upload) => upload.Key);

          if (objectsToDelete.length > 0) {
            yield* s3Client.deleteObjects(objectsToDelete);

            // Abort multipart uploads
            yield* Effect.forEach(expiredUploads, (upload) => {
              return Effect.gen(function* () {
                if (!upload.Key || !upload.UploadId) {
                  return;
                }
                yield* s3Client.abortMultipartUpload({
                  bucket,
                  key: upload.Key,
                  uploadId: upload.UploadId,
                });
                return;
              });
            });

            deleted += objectsToDelete.length;
          }

          isTruncated = listResponse.IsTruncated ?? false;

          if (isTruncated) {
            keyMarker = listResponse.NextKeyMarker;
            uploadIdMarker = listResponse.NextUploadIdMarker;
          }
        }

        return deleted;
      });

    // Proper single-pass chunking using Effect's async stream constructor
    // Ensures all parts except the final part are exactly the same size (S3 requirement)
    const createChunkedStream =
      (chunkSize: number) =>
      <E>(
        stream: Stream.Stream<Uint8Array, E>,
      ): Stream.Stream<ChunkInfo, E> => {
        return Stream.async<ChunkInfo, E>((emit) => {
          let buffer = new Uint8Array(0);
          let partNumber = 1;
          let totalBytesProcessed = 0;

          const emitChunk = (data: Uint8Array, isFinalChunk = false) => {
            // Log chunk information for debugging - use INFO level to see in logs
            Effect.runSync(
              Effect.logInfo("Creating chunk").pipe(
                Effect.annotateLogs({
                  part_number: partNumber,
                  chunk_size: data.length,
                  expected_size: chunkSize,
                  is_final_chunk: isFinalChunk,
                  total_bytes_processed: totalBytesProcessed + data.length,
                }),
              ),
            );
            emit.single({
              partNumber: partNumber++,
              data,
              size: data.length,
            });
          };

          const processChunk = (newData: Uint8Array) => {
            // Combine buffer with new data
            const combined = new Uint8Array(buffer.length + newData.length);
            combined.set(buffer);
            combined.set(newData, buffer.length);
            buffer = combined;
            totalBytesProcessed += newData.length;

            // Emit full chunks of exactly chunkSize bytes
            // This ensures S3 multipart upload rule: all parts except last must be same size
            while (buffer.length >= chunkSize) {
              const chunk = buffer.slice(0, chunkSize);
              buffer = buffer.slice(chunkSize);
              emitChunk(chunk, false);
            }
          };

          // Process the stream
          Effect.runFork(
            stream.pipe(
              Stream.runForEach((chunk) =>
                Effect.sync(() => processChunk(chunk)),
              ),
              Effect.andThen(() =>
                Effect.sync(() => {
                  // Emit final chunk if there's remaining data
                  // The final chunk can be any size < chunkSize (S3 allows this)
                  if (buffer.length > 0) {
                    emitChunk(buffer, true);
                  }
                  emit.end();
                }),
              ),
              Effect.catchAll((error) => Effect.sync(() => emit.fail(error))),
            ),
          );
        });
      };

    // Byte-level progress tracking during streaming
    // This provides smooth, immediate progress feedback by tracking bytes as they
    // flow through the stream, before they reach S3. This solves the issue where
    // small files (< 5MB) would jump from 0% to 100% instantly.
    const withByteProgressTracking =
      (onProgress?: (totalBytes: number) => void, initialOffset = 0) =>
      <E, R>(stream: Stream.Stream<Uint8Array, E, R>) => {
        if (!onProgress) return stream;

        return Effect.gen(function* () {
          const totalBytesProcessedRef = yield* Ref.make(initialOffset);

          return stream.pipe(
            Stream.tap((chunk) =>
              Effect.gen(function* () {
                const newTotal = yield* Ref.updateAndGet(
                  totalBytesProcessedRef,
                  (total) => total + chunk.length,
                );
                onProgress(newTotal);
              }),
            ),
          );
        }).pipe(Stream.unwrap);
      };

    const uploadParts = (
      uploadFile: UploadFile,
      readStream: Stream.Stream<Uint8Array, UploadistaError>,
      initCurrentPartNumber: number,
      initOffset: number,
      uploadPartSize: number,
      minPartSize: number,
      maxConcurrentPartUploads: number,
      onProgress?: (newOffset: number) => void,
    ) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Starting part uploads").pipe(
          Effect.annotateLogs({
            upload_id: uploadFile.id,
            init_offset: initOffset,
            file_size: uploadFile.size,
            part_size: uploadPartSize,
            min_part_size: minPartSize,
          }),
        );

        // Enhanced Progress Tracking Strategy:
        // 1. Byte-level progress during streaming - provides immediate, smooth feedback
        //    as data flows through the pipeline (even for small files)
        // 2. This tracks progress BEFORE S3 upload, giving users immediate feedback
        // 3. For large files with multiple parts, this provides granular updates
        // 4. For small files (single part), this prevents 0%->100% jumps
        const chunkStream = readStream.pipe(
          // Add byte-level progress tracking during streaming (immediate feedback)
          withByteProgressTracking(onProgress, initOffset),
          // Create chunks for S3 multipart upload with uniform part sizes
          createChunkedStream(uploadPartSize),
        );

        // Track cumulative offset and total bytes with Effect Refs
        const cumulativeOffsetRef = yield* Ref.make(initOffset);
        const totalBytesUploadedRef = yield* Ref.make(0);

        // Create a chunk upload function for the sink
        const uploadChunk = (chunkInfo: ChunkInfo) =>
          Effect.gen(function* () {
            // Calculate cumulative bytes to determine if this is the final part
            const cumulativeOffset = yield* Ref.updateAndGet(
              cumulativeOffsetRef,
              (offset) => offset + chunkInfo.size,
            );
            const isFinalPart = cumulativeOffset >= (uploadFile.size || 0);

            yield* Effect.logDebug("Processing chunk").pipe(
              Effect.annotateLogs({
                upload_id: uploadFile.id,
                cumulative_offset: cumulativeOffset,
                file_size: uploadFile.size,
                chunk_size: chunkInfo.size,
                is_final_part: isFinalPart,
              }),
            );

            const actualPartNumber =
              initCurrentPartNumber + chunkInfo.partNumber - 1;

            if (chunkInfo.size > uploadPartSize) {
              yield* Effect.fail(
                UploadistaError.fromCode(
                  "FILE_WRITE_ERROR",
                  new Error(
                    `Part size ${chunkInfo.size} exceeds upload part size ${uploadPartSize}`,
                  ),
                ),
              );
            }

            // For parts that meet the minimum part size (5MB) or are the final part,
            // upload them as regular multipart parts
            if (chunkInfo.size >= minPartSize || isFinalPart) {
              yield* Effect.logDebug("Uploading multipart chunk").pipe(
                Effect.annotateLogs({
                  upload_id: uploadFile.id,
                  part_number: actualPartNumber,
                  chunk_size: chunkInfo.size,
                  min_part_size: minPartSize,
                  is_final_part: isFinalPart,
                }),
              );
              yield* uploadPart(uploadFile, chunkInfo.data, actualPartNumber);
              yield* partSizeHistogram(Effect.succeed(chunkInfo.size));
            } else {
              // Only upload as incomplete part if it's smaller than minimum and not final
              yield* uploadIncompletePart(uploadFile.id, chunkInfo.data);
            }

            yield* Ref.update(
              totalBytesUploadedRef,
              (total) => total + chunkInfo.size,
            );

            // Note: Byte-level progress is now tracked during streaming phase
            // This ensures smooth progress updates regardless of part size
            // S3 upload completion is tracked via totalBytesUploadedRef for accuracy
          });

        // Process chunks concurrently with controlled concurrency
        yield* chunkStream.pipe(
          Stream.runForEach((chunkInfo) => uploadChunk(chunkInfo)),
          Effect.withConcurrency(maxConcurrentPartUploads),
        );

        return yield* Ref.get(totalBytesUploadedRef);
      });

    const getCapabilities = (): DataStoreCapabilities => ({
      supportsParallelUploads: true,
      supportsConcatenation: true,
      supportsDeferredLength: true,
      supportsResumableUploads: true,
      supportsTransactionalUploads: true,
      maxConcurrentUploads: maxConcurrentPartUploads,
      minChunkSize: minPartSize,
      maxChunkSize: 5_368_709_120, // 5GiB S3 limit
      maxParts: maxMultipartParts,
      optimalChunkSize: preferredPartSize,
      requiresOrderedChunks: false,
      requiresMimeTypeValidation: true,
      maxValidationSize: undefined, // no size limit
    });

    const getChunkerConstraints = () => ({
      minChunkSize: minPartSize,
      maxChunkSize: 5_368_709_120, // 5GiB S3 limit
      optimalChunkSize: preferredPartSize,
      requiresOrderedChunks: false,
    });

    const validateUploadStrategy = (
      strategy: UploadStrategy,
    ): Effect.Effect<boolean, never> => {
      const capabilities = getCapabilities();
      const result = (() => {
        switch (strategy) {
          case "parallel":
            return capabilities.supportsParallelUploads;
          case "single":
            return true;
          default:
            return false;
        }
      })();
      return Effect.succeed(result);
    };

    const concatArrayBuffers = (chunks: Uint8Array[]): Uint8Array => {
      const result = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    };

    const streamToArray = async (
      stream: ReadableStream<Uint8Array>,
    ): Promise<Uint8Array> => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      return concatArrayBuffers(chunks);
    };

    const read = (id: string) =>
      Effect.gen(function* () {
        const upload = yield* kvStore.get(id);
        console.log(upload);
        if (!upload.id) {
          return yield* Effect.fail(
            UploadistaError.fromCode(
              "FILE_READ_ERROR",
              new Error("Upload Key is undefined"),
            ),
          );
        }
        const s3Key = getS3Key(upload);
        const stream = yield* s3Client.getObject(s3Key);
        return yield* Effect.promise(() => streamToArray(stream));
      });

    return {
      bucket,
      create,
      remove,
      write,
      getUpload,
      read,
      deleteExpired,
      getCapabilities,
      getChunkerConstraints,
      validateUploadStrategy,
    } as DataStore<UploadFile>;
  });
}

// Effect-based factory that uses services
export const s3Store = (options: S3StoreConfig) => {
  const {
    s3ClientConfig: { bucket, ...restS3ClientConfig },
  } = options;
  return createS3Store(options).pipe(
    Effect.provide(S3ClientLayer(restS3ClientConfig, bucket)),
  );
};
