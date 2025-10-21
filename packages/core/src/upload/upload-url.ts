import { Effect, Metric } from "effect";
import { UploadistaError } from "../errors";

/**
 * Fetches a file from a remote URL.
 *
 * This function handles HTTP requests to remote URLs for file uploads,
 * including proper error handling, metrics tracking, and observability.
 *
 * Features:
 * - HTTP request with proper error handling
 * - Effect tracing for performance monitoring
 * - Metrics tracking for URL-based uploads
 * - Structured logging for debugging
 * - Response validation and error reporting
 *
 * @param url - The remote URL to fetch the file from
 * @returns Effect that yields the Response object
 *
 * @example
 * ```typescript
 * // Fetch a file from URL
 * const fetchEffect = fetchFile("https://example.com/image.jpg");
 *
 * // Run with error handling
 * const response = await Effect.runPromise(
 *   fetchEffect.pipe(
 *     Effect.catchAll((error) =>
 *       Effect.logError("Failed to fetch file").pipe(
 *         Effect.andThen(Effect.fail(error))
 *       )
 *     )
 *   )
 * );
 * ```
 */
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
          })
        );

        // Track success/failure
        if (response.ok) {
          yield* Metric.increment(
            Metric.counter("upload_from_url_success_total", {
              description: "Total number of successful URL-based uploads",
            })
          );
        }
      })
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
        })
      )
    ),
    // Handle errors with logging and metrics
    Effect.tapError((error) =>
      Effect.gen(function* () {
        // Track failed URL upload
        yield* Metric.increment(
          Metric.counter("upload_from_url_failed_total", {
            description: "Total number of failed URL-based uploads",
          })
        );

        // Log error
        yield* Effect.logError("URL fetch failed").pipe(
          Effect.annotateLogs({
            "upload.url": url,
            error: String(error),
          })
        );
      })
    )
  );
};

/**
 * Converts a Response object to an ArrayBuffer.
 *
 * This function safely converts HTTP response data to binary format
 * for processing and storage, with proper error handling and observability.
 *
 * Features:
 * - Safe conversion from Response to ArrayBuffer
 * - Effect tracing for performance monitoring
 * - Structured logging for debugging
 * - Error handling with proper UploadistaError types
 *
 * @param response - The HTTP Response object to convert
 * @returns Effect that yields the ArrayBuffer data
 *
 * @example
 * ```typescript
 * // Convert response to buffer
 * const bufferEffect = arrayBuffer(response);
 *
 * // Use in upload pipeline
 * const buffer = await Effect.runPromise(
 *   bufferEffect.pipe(
 *     Effect.tap((buffer) =>
 *       Effect.logInfo(`Buffer size: ${buffer.byteLength} bytes`)
 *     )
 *   )
 * );
 * ```
 */
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
        })
      )
    ),
    // Handle errors with logging
    Effect.tapError((error) =>
      Effect.logError("Failed to convert response to array buffer").pipe(
        Effect.annotateLogs({
          error: String(error),
        })
      )
    )
  );
};
