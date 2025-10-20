import { Effect, Metric } from "effect";
import { UploadistaError } from "../errors";

// Helper functions for URL-based file fetching
export const fetchFile = (url: string) => {
  return Effect.tryPromise({
    try: async () => {
      return await fetch(url);
    },
    catch: (error) => {
      return UploadistaError.fromCode("UNKNOWN_ERROR", {
        cause: error,
      });
    },
  }).pipe(
    // Add tracing span for URL fetch
    Effect.withSpan("upload-fetch-url", {
      attributes: {
        "upload.url": url,
        "upload.operation": "fetch",
      },
    }),
    // Track URL fetch metrics
    Effect.tap((response) =>
      Effect.gen(function* () {
        // Increment URL upload counter
        yield* Metric.increment(
          Metric.counter("upload_from_url_total", {
            description: "Total number of URL-based uploads",
          }),
        );

        // Track success/failure
        if (response.ok) {
          yield* Metric.increment(
            Metric.counter("upload_from_url_success_total", {
              description: "Total number of successful URL-based uploads",
            }),
          );
        }
      }),
    ),
    // Add structured logging
    Effect.tap((response) =>
      Effect.logInfo("URL fetch completed").pipe(
        Effect.annotateLogs({
          "upload.url": url,
          "response.status": response.status.toString(),
          "response.ok": response.ok.toString(),
          "response.content_length":
            response.headers.get("content-length") ?? "unknown",
        }),
      ),
    ),
    // Handle errors with logging and metrics
    Effect.tapError((error) =>
      Effect.gen(function* () {
        // Track failed URL upload
        yield* Metric.increment(
          Metric.counter("upload_from_url_failed_total", {
            description: "Total number of failed URL-based uploads",
          }),
        );

        // Log error
        yield* Effect.logError("URL fetch failed").pipe(
          Effect.annotateLogs({
            "upload.url": url,
            error: String(error),
          }),
        );
      }),
    ),
  );
};

export const arrayBuffer = (response: Response) => {
  return Effect.tryPromise({
    try: async () => {
      return await response.arrayBuffer();
    },
    catch: (error) => {
      return UploadistaError.fromCode("UNKNOWN_ERROR", {
        cause: error,
      });
    },
  }).pipe(
    // Add tracing span for buffer conversion
    Effect.withSpan("upload-convert-to-buffer", {
      attributes: {
        "upload.operation": "arrayBuffer",
      },
    }),
    // Add structured logging
    Effect.tap((buffer) =>
      Effect.logDebug("Response converted to array buffer").pipe(
        Effect.annotateLogs({
          "buffer.size": buffer.byteLength.toString(),
        }),
      ),
    ),
    // Handle errors with logging
    Effect.tapError((error) =>
      Effect.logError("Failed to convert response to array buffer").pipe(
        Effect.annotateLogs({
          error: String(error),
        }),
      ),
    ),
  );
};
