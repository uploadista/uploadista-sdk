import { Effect, Ref } from "effect";
import { UploadistaError } from "../errors";
import { StreamLimiterEffect } from "../streams/stream-limiter";
import type { DataStore, UploadEvent, UploadFile } from "../types";
import { type EventEmitter, UploadEventType } from "../types";
import { convertToStream } from "./convert-to-stream";

type WriteToStoreOptions = {
  data: ReadableStream<Uint8Array>;
  upload: UploadFile;
  dataStore: DataStore<UploadFile>;
  maxFileSize: number;
  controller: AbortController;
  eventEmitter: EventEmitter<UploadEvent>;
  uploadProgressInterval?: number;
};

export function writeToStore({
  data,
  upload,
  dataStore,
  maxFileSize,
  controller,
  eventEmitter,
  uploadProgressInterval = 200,
}: WriteToStoreOptions) {
  return Effect.gen(function* () {
    const stream = convertToStream(data);
    // Check if already aborted
    if (controller.signal.aborted) {
      return yield* Effect.fail(UploadistaError.fromCode("ABORTED"));
    }

    // Create an AbortController to manage the stream pipeline
    const abortController = new AbortController();
    const { signal } = abortController;

    // Set up abort handling
    const onAbort = () => {
      // stream.cancel();
      abortController.abort();
    };

    controller.signal.addEventListener("abort", onAbort, { once: true });

    return yield* Effect.acquireUseRelease(
      Effect.sync(() => ({ signal, onAbort })),
      ({ signal: _signal }) =>
        Effect.gen(function* () {
          // Create a ref to track the last progress emission time for throttling
          const lastEmitTime = yield* Ref.make(0);

          // Create the stream limiter
          const limiter = StreamLimiterEffect.limit({
            maxSize: maxFileSize,
          });

          // Pipe the data through the limiter
          const limitedStream = limiter(stream);

          // Write to the data store with progress tracking
          const offset = yield* dataStore.write(
            {
              stream: limitedStream,
              file_id: upload.id,
              offset: upload.offset,
            },
            {
              onProgress: (newOffset: number) => {
                // Simple throttling using timestamp check
                const now = Date.now();
                Ref.get(lastEmitTime)
                  .pipe(
                    Effect.flatMap((lastTime) => {
                      if (now - lastTime >= uploadProgressInterval) {
                        return Effect.gen(function* () {
                          yield* Ref.set(lastEmitTime, now);
                          yield* eventEmitter.emit(upload.id, {
                            type: UploadEventType.UPLOAD_PROGRESS,
                            data: {
                              id: upload.id,
                              progress: newOffset,
                              total: upload.size ?? 0,
                            },
                            flow: upload.flow,
                          });
                        });
                      }
                      return Effect.void;
                    }),
                    Effect.runPromise,
                  )
                  .catch(() => {
                    // Ignore errors during progress emission
                  });
              },
            },
          );

          return offset;
        }).pipe(
          Effect.catchAll((error) => {
            if (error instanceof Error && error.name === "AbortError") {
              return Effect.fail(UploadistaError.fromCode("ABORTED"));
            }
            if (error instanceof UploadistaError) {
              return Effect.fail(error);
            }
            return Effect.fail(
              UploadistaError.fromCode("FILE_WRITE_ERROR", { cause: error }),
            );
          }),
        ),
      ({ onAbort }) =>
        Effect.sync(() => {
          controller.signal.removeEventListener("abort", onAbort);
        }),
    );
  }).pipe(
    // Add tracing span for write operation
    Effect.withSpan("upload-write-to-store", {
      attributes: {
        "upload.id": upload.id,
        "upload.offset": upload.offset.toString(),
        "upload.max_file_size": maxFileSize.toString(),
        "upload.file_size": upload.size?.toString() ?? "0",
      },
    }),
    // Add structured logging for write operation
    Effect.tap((offset) =>
      Effect.logDebug("Data written to store").pipe(
        Effect.annotateLogs({
          "upload.id": upload.id,
          "write.offset": offset.toString(),
          "write.bytes_written": (offset - upload.offset).toString(),
        }),
      ),
    ),
    // Handle errors with logging
    Effect.tapError((error) =>
      Effect.logError("Failed to write to store").pipe(
        Effect.annotateLogs({
          "upload.id": upload.id,
          "upload.offset": upload.offset.toString(),
          error:
            error instanceof UploadistaError
              ? error.code
              : String(error),
        }),
      ),
    ),
  );
}
